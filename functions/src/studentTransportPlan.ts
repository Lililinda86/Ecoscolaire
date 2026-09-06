import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';
import { resolveItaloTransportFee, TransportCycle } from './transportPaymentPolicy';

type Data = Record<string, unknown>;
export const transportPlanId = (schoolId: string, studentId: string, year: string): string =>
  createHash('sha256').update(JSON.stringify([schoolId, studentId, year])).digest('hex');
export const prospectivePeriod = (today: string): string => {
  const [year, month] = today.split('-').map(Number);
  return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
};
export const revisePeriodFees = (previous: Record<string, number>, periods: string[], effectivePeriod: string, amount: number): Record<string, number> => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectivePeriod) || !Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_TRANSPORT_PLAN');
  const result = { ...previous };
  for (const period of periods) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('INVALID_TRANSPORT_PERIOD');
    if (period >= effectivePeriod) result[period] = amount;
  }
  return result;
};

export const setStudentTransportPlan = functions.https.onCall(async (raw, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  const schoolId = raw?.schoolId; const studentId = raw?.studentId;
  for (const v of [schoolId, studentId]) if (typeof v !== 'string' || !v || v.includes('/') || v.length > 128) throw new functions.https.HttpsError('invalid-argument', 'Identifiant invalide.');
  if (typeof raw.usesTransport !== 'boolean') throw new functions.https.HttpsError('invalid-argument', 'Abonnement invalide.');
  const db = admin.firestore();
  return db.runTransaction(async tx => {
    const [userSnap, schoolSnap, studentSnap, privateSnap] = await Promise.all([
      tx.get(db.collection('users').doc(context.auth!.uid)), tx.get(db.collection('schools').doc(schoolId)),
      tx.get(db.collection('students').doc(studentId)), tx.get(db.collection('studentPrivate').doc(studentId))
    ]);
    const user = userSnap.data() || {}; const school = schoolSnap.data() || {}; const student = studentSnap.data() || {}; const privateData = privateSnap.data() || {};
    if ((user.active !== true && user.isActive !== true) || user.status === 'inactive' || !['owner', 'director', 'secretary', 'superAdmin'].includes(user.role) || (user.role !== 'superAdmin' && user.schoolId !== schoolId) || student.schoolId !== schoolId || privateData.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Accès refusé.');
    if (!schoolSnap.exists || school.active === false || school.subscriptionStatus === 'suspended') throw new functions.https.HttpsError('failed-precondition', 'École indisponible.');
    const [classSnap, yearSnap] = await Promise.all([tx.get(db.collection('classes').doc(String(student.classId))), tx.get(db.collection('academicYears').doc(String(student.academicYearId)))]);
    const classData = classSnap.data() || {}; const year = yearSnap.data() || {};
    if (classData.schoolId !== schoolId || year.schoolId !== schoolId || year.name !== school.academicYear || student.academicYearId !== school.activeAcademicYearId) throw new functions.https.HttpsError('failed-precondition', 'Classe ou année invalide.');
    const cycle = (classData.cycle || ({ maternelle: 'nursery', primaire: 'primary', secondaire: 'secondary' } as Record<string, string>)[classData.level] || classData.level) as TransportCycle;
    const periods = school.transportPolicy?.billingPeriods;
    if (Array.isArray(periods) && periods.some((p: unknown) => typeof p !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p) || p < `${String(year.name).slice(0, 4)}-09` || p > `${String(year.name).slice(5)}-08`)) {
      throw new functions.https.HttpsError('failed-precondition', 'Mois hors année scolaire.');
    }
    if (school.transportPolicy?.feePolicyId !== 'ITALO_PK_2026' || !Array.isArray(periods) || !periods.length || new Set(periods).size !== periods.length) throw new functions.https.HttpsError('failed-precondition', 'Configurer les mois facturables.');
    const zonePk = raw.zonePk ?? null;
    if (raw.usesTransport && (!Number.isSafeInteger(zonePk) || zonePk < 14 || zonePk > 42)) throw new functions.https.HttpsError('invalid-argument', 'Choisir un point PK14 à PK42.');
    const fee = resolveItaloTransportFee({ cycle, usesTransport: raw.usesTransport, zonePk });
    const ref = db.collection('studentTransportPlans').doc(transportPlanId(schoolId, studentId, year.name));
    const planSnap = await tx.get(ref); const plan = planSnap.data() || {};
    const [allocations, payments] = await Promise.all([
      tx.get(db.collection('transportPaymentAllocations').where('studentId', '==', studentId)),
      tx.get(db.collection('payments').where('studentId', '==', studentId))
    ]);
    const protectedPeriods = new Set<string>();
    for (const doc of allocations.docs) { const a = doc.data(); if (a.schoolId === schoolId && a.academicYear === year.name && typeof a.period === 'string') protectedPeriods.add(a.period); }
    for (const doc of payments.docs) { const p = doc.data(); if (p.schoolId === schoolId && p.academicYear === year.name) {
      if (p.type === 'transport' && typeof p.period === 'string') protectedPeriods.add(p.period);
      for (const l of Array.isArray(p.lineItems) ? p.lineItems : []) if (l.type === 'transport' && typeof l.period === 'string') protectedPeriods.add(l.period);
    } }
    if (planSnap.exists && (plan.schoolId !== schoolId || plan.studentId !== studentId || plan.academicYear !== year.name)) throw new functions.https.HttpsError('failed-precondition', 'Historique incohérent.');
    if (planSnap.exists && plan.usesTransport === raw.usesTransport && plan.zonePk === zonePk) return { monthlyGrossAmount: fee.monthlyGrossAmount, effectivePeriod: plan.effectivePeriod, replay: true };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const effectivePeriod = prospectivePeriod(today);
    let previous: Record<string, number> = plan.periodFees || {};
    if (!planSnap.exists) {
      // Nursery was not billable before this policy; never manufacture past nursery debt.
      const oldFee = cycle === 'primary' && Number.isSafeInteger(privateData.transportZonePk) ? resolveItaloTransportFee({ cycle, usesTransport: student.usesTransport === true, zonePk: privateData.transportZonePk }).monthlyGrossAmount : 0;
      previous = Object.fromEntries(periods.map((period: string) => [period, oldFee]));
    }
    const periodFees = revisePeriodFees(previous, periods.filter((p: string) => !protectedPeriods.has(p)), effectivePeriod, fee.monthlyGrossAmount);
    const change: Data = { effectivePeriod, zonePk, usesTransport: raw.usesTransport, monthlyGrossAmount: fee.monthlyGrossAmount, actorId: context.auth!.uid, at: today };
    tx.set(ref, { schoolId, studentId, academicYear: year.name, periodFees, usesTransport: raw.usesTransport, zonePk, effectivePeriod,
      history: [...(Array.isArray(plan.history) ? plan.history : []), change], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(studentSnap.ref, { usesTransport: raw.usesTransport, transportStatus: raw.usesTransport ? 'active' : 'none' });
    tx.update(privateSnap.ref, { transportZonePk: zonePk });
    tx.create(db.collection('audit_logs').doc(), { schoolId, userId: context.auth!.uid, action: 'TRANSPORT_PLAN_CHANGED', studentId, ...change, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { monthlyGrossAmount: fee.monthlyGrossAmount, effectivePeriod, replay: false };
  });
});
