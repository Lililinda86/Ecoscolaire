import { publishFinancialTariffs } from './financialTariffConfiguration';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';
import { resolveCanonicalClassCycle } from './classCycle';
import { resolveItaloTransportFee } from './transportPaymentPolicy';

type Data = Record<string, unknown>;
export interface SchoolFee extends Data {
  id: string; schemaVersion: 2; label: string; category: string; description: string;
  amount: number; academicYear: string; mandatory: boolean; active: boolean;
  dueDate: string | null; classIds: string[]; cycles: string[]; studentIds: string[];
}
const fail = (message: string) => new functions.https.HttpsError('failed-precondition', message);
const id = (value: unknown): string => {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || value.length > 128 || value.includes('/') || value.trim() !== value) throw fail('Identifiant invalide.');
  return value;
};
const ids = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 200) throw fail('Sélection invalide (200 éléments maximum).');
  return [...new Set(value.map(id))];
};
export const schoolFees = (school: Data): Data[] => Array.isArray(school.feeCatalog)
  ? school.feeCatalog as Data[] : school.feeCatalog && typeof school.feeCatalog === 'object'
    ? Object.entries(school.feeCatalog as Data).map(([key, value]) => ({ ...(value as Data), id: key })) : [];

export const appliesToStudent = (fee: SchoolFee, student: Data, classData: Data, year: string): boolean =>
  fee.academicYear === year && fee.active &&
  (!fee.classIds.length || fee.classIds.includes(String(student.classId))) &&
  (!fee.cycles.length || fee.cycles.includes(resolveCanonicalClassCycle(classData))) &&
  (!fee.studentIds.length || fee.studentIds.includes(String(student.id)));

export const feeAssignmentId = (schoolId: string, studentId: string, year: string, feeId: string): string =>
  createHash('sha256').update(JSON.stringify([schoolId, studentId, year, feeId])).digest('hex');

async function authorize(tx: admin.firestore.Transaction, db: admin.firestore.Firestore, uid: string, schoolId: string, write: boolean) {
  const [user, school] = await Promise.all([tx.get(db.collection('users').doc(uid)), tx.get(db.collection('schools').doc(schoolId))]);
  const u = user.data() || {};
  const roles = write ? ['owner', 'director', 'superAdmin'] : ['owner', 'director', 'secretary', 'accountant', 'superAdmin'];
  if ((u.isActive !== true && u.active !== true) || u.status === 'inactive' || !roles.includes(String(u.role)) || (u.role !== 'superAdmin' && u.schoolId !== schoolId)) {
    throw new functions.https.HttpsError('permission-denied', 'Opération non autorisée.');
  }
  if (!school.exists || school.data()?.active === false || school.data()?.subscriptionStatus === 'suspended') throw fail('École indisponible.');
  return school;
}

export const getSchoolFeeCatalog = functions.https.onCall(async (raw, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  const schoolId = id(raw?.schoolId); const db = admin.firestore();
  return db.runTransaction(async tx => {
    const school = await authorize(tx, db, context.auth!.uid, schoolId, false);
    let transportTariff = null;
    if (raw.classId) {
      const cls = await tx.get(db.collection('classes').doc(id(raw.classId)));
      if (!cls.exists || cls.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Classe hors établissement.');
      if (school.data()?.transportPolicy?.feePolicyId !== 'ITALO_PK_2026') throw fail('Politique transport non configurée.');
      if (!Number.isSafeInteger(raw.zonePk) || raw.zonePk < 14 || raw.zonePk > 42) throw fail('Choisir un point PK14 à PK42.');
      transportTariff = resolveItaloTransportFee({ cycle: resolveCanonicalClassCycle(cls.data() || {}), usesTransport: true, zonePk: raw.zonePk, rates: school.data()?.transportPolicy?.pkRates });
    }
    return { fees: schoolFees(school.data() || {}), transportTariff, configuration: { globalFees: school.data()?.globalFees || {},
      classFees: school.data()?.classFees || {}, transportPolicy: school.data()?.transportPolicy || {}, version: school.data()?.financialTariffVersion || null } };
  });
});

export const manageSchoolFee = functions.https.onCall(async (raw, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  const schoolId = id(raw?.schoolId); const feeId = raw?.action === 'configure' ? 'configuration' : id(raw?.feeId); const db = admin.firestore();
  return db.runTransaction(async tx => {
    const school = await authorize(tx, db, context.auth!.uid, schoolId, true);
    if (raw.action === 'configure') return publishFinancialTariffs(tx, db, school, context.auth!.uid, raw);
    const entries = schoolFees(school.data() || {});
    const existing = entries.find(f => f.id === feeId);
    if (raw.action === 'create') {
      const source = raw.fee || {};
      const year = String(source.academicYear || '');
      if (!/^\d{4}-\d{4}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1 || school.data()?.academicYear !== year) throw fail('Année scolaire active requise.');
      const classIds = ids(source.classIds || []); const cycles = ids(source.cycles || []); const studentIds = ids(source.studentIds || []);
      if (cycles.some(c => !['nursery', 'primary', 'secondary'].includes(c))) throw fail('Cycle invalide.');
      const targets = await Promise.all([...classIds.map(c => tx.get(db.collection('classes').doc(c))), ...studentIds.map(s => tx.get(db.collection('students').doc(s)))]);
      if (targets.some(s => !s.exists || s.data()?.schoolId !== schoolId)) throw new functions.https.HttpsError('permission-denied', 'Cible hors établissement.');
      if (typeof source.label !== 'string' || !source.label.trim() || source.label.length > 120 || typeof source.description !== 'string' || source.description.length > 500) throw fail('Nom ou description invalide.');
      if (!Number.isSafeInteger(source.amount) || source.amount <= 0 || typeof source.mandatory !== 'boolean') throw fail('Montant ou caractère obligatoire invalide.');
      const categories = ['uniform', 'sports_uniform', 'books', 'supplies', 'exam', 'canteen', 'activity', 'excursion', 'event', 'photo', 'contribution', 'exceptional', 'other'];
      if (!categories.includes(source.category)) throw fail('Catégorie invalide.');
      const dueDate = source.dueDate || null;
      if (dueDate !== null && (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) throw fail('Échéance invalide.');
      const fee: SchoolFee = { id: feeId, schemaVersion: 2, label: source.label.trim(), description: source.description.trim(), category: source.category,
        amount: source.amount, academicYear: year, mandatory: source.mandatory, active: true, dueDate, classIds, cycles, studentIds };
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(fee)) return { feeId, replay: true };
        throw new functions.https.HttpsError('already-exists', 'Identifiant déjà utilisé : créer une nouvelle version.');
      }
      if (entries.length >= 200) throw fail('Catalogue limité à 200 versions.');
      tx.update(school.ref, { feeCatalog: [...entries, fee] });
    } else if (raw.action === 'revise') {
      if (!existing || existing.schemaVersion !== 2 || existing.active !== true) throw fail('Frais actif requis.');
      if (existing.amount !== raw.expectedAmount) throw fail('Le tarif a changé. Rechargez le catalogue.');
      if (!Number.isSafeInteger(raw.amount) || raw.amount <= 0) throw fail('Montant entier positif requis.');
      if (typeof raw.reason !== 'string' || !raw.reason.trim() || raw.reason.length > 500) throw fail('Motif requis.');
      if (raw.amount === existing.amount) return { feeId, replay: true };
      const versionId = createHash('sha256').update(JSON.stringify([schoolId, feeId, existing.versionId || 'initial', raw.amount])).digest('hex');
      const next = { ...existing, amount: raw.amount, versionId };
      // Stable fee identity: existing student assignments retain their old full snapshot.
      // A revision is never a second compulsory charge on already-assigned students.
      tx.create(school.ref.collection('financialTariffVersions').doc(versionId), {
        feeId, academicYear: existing.academicYear, previous: existing, next,
        reason: raw.reason.trim(), actorId: context.auth!.uid, effectiveAt: admin.firestore.FieldValue.serverTimestamp()
      });
      tx.update(school.ref, { feeCatalog: entries.map(f => f.id === feeId ? next : f) });
    } else if (raw.action === 'archive') {
      if (!existing || existing.schemaVersion !== 2) throw fail('Frais versionné requis.');
      if (existing.active === false) return { feeId, replay: true };
      const fee = existing as SchoolFee;
      // Freeze all current mandatory obligations before stopping new assignments.
      const roster = fee.mandatory ? await tx.get(db.collection('students').where('schoolId', '==', schoolId).limit(201)) : null;
      if (roster && roster.size > 200) throw fail('Archivage à traiter par lot administrateur (plus de 200 élèves).');
      const pending: Array<{ ref: admin.firestore.DocumentReference; studentId: string }> = [];
      for (const student of roster?.docs || []) {
        const s = student.data();
        if (s.academicYearId !== school.data()?.activeAcademicYearId) continue;
        const cls = await tx.get(db.collection('classes').doc(id(s.classId)));
        if (!cls.exists || cls.data()?.schoolId !== schoolId) throw fail('Classe invalide.');
        if (!appliesToStudent(fee, { ...s, id: student.id }, cls.data() || {}, fee.academicYear)) continue;
        const ref = db.collection('studentFeeAssignments').doc(feeAssignmentId(schoolId, student.id, fee.academicYear, feeId));
        if (!(await tx.get(ref)).exists) pending.push({ ref, studentId: student.id });
      }
      for (const item of pending) tx.create(item.ref, { schoolId, studentId: item.studentId, academicYear: fee.academicYear, feeId, fee,
        assignedBy: context.auth!.uid, assignedAt: admin.firestore.FieldValue.serverTimestamp() });
      tx.update(school.ref, { feeCatalog: entries.map(f => f.id === feeId ? { ...f, active: false } : f) });
    } else if (raw.action === 'assign') {
      if (!existing || existing.schemaVersion !== 2 || existing.active !== true) throw fail('Frais actif requis.');
      const fee = existing as SchoolFee; const studentId = id(raw.studentId);
      const student = await tx.get(db.collection('students').doc(studentId));
      if (!student.exists || student.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Élève hors établissement.');
      const data = { ...student.data(), id: studentId };
      const classSnap = await tx.get(db.collection('classes').doc(id(student.data()?.classId)));
      if (!classSnap.exists || classSnap.data()?.schoolId !== schoolId || !appliesToStudent(fee, data, classSnap.data() || {}, String(school.data()?.academicYear))) throw fail('Frais non applicable à cet élève.');
      const yearSnap = await tx.get(db.collection('academicYears').doc(id(student.data()?.academicYearId)));
      if (!yearSnap.exists || yearSnap.data()?.schoolId !== schoolId || yearSnap.data()?.name !== fee.academicYear) throw fail('Année élève incompatible.');
      const ref = db.collection('studentFeeAssignments').doc(feeAssignmentId(schoolId, studentId, fee.academicYear, feeId));
      if ((await tx.get(ref)).exists) return { feeId, replay: true };
      tx.create(ref, { schoolId, studentId, academicYear: fee.academicYear, feeId, fee, assignedBy: context.auth!.uid, assignedAt: admin.firestore.FieldValue.serverTimestamp() });
    } else {
      throw fail('Action invalide. Les tarifs publiés sont immuables ; créer un nouveau frais pour une nouvelle tarification.');
    }
    tx.create(db.collection('audit_logs').doc(), { schoolId, userId: context.auth!.uid, action: 'SCHOOL_FEE_' + raw.action.toUpperCase(), targetId: feeId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { feeId, replay: false };
  });
});
