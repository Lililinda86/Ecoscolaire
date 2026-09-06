import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';

type Data = Record<string, unknown>;
const fail = (message: string) => new functions.https.HttpsError('failed-precondition', message);
const money = (value: unknown) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw fail('Montant entier positif ou nul requis.');
  return Number(value);
};
export async function publishFinancialTariffs(tx: admin.firestore.Transaction, db: admin.firestore.Firestore,
  school: admin.firestore.DocumentSnapshot, uid: string, raw: Data) {
  const current = school.data() || {};
  if (raw.expectedVersion !== (current.financialTariffVersion || null)) throw fail('Les tarifs ont changé. Rechargez les Paramètres.');
  if (raw.academicYear !== current.academicYear) throw fail('Année scolaire active requise.');
  const source = raw.configuration as Data;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw fail('Configuration requise.');
  if (typeof raw.reason !== 'string' || !raw.reason.trim() || raw.reason.length > 500) throw fail('Motif de modification requis.');
  const global = source.globalFees as Data;
  const globalFees = Object.fromEntries(['feeT1', 'feeT2', 'feeT3', 'feeTransport', 'feeUniforms'].map(key => [key, money(global?.[key])]));
  const classes = source.classFees as Data;
  if (!classes || typeof classes !== 'object' || Array.isArray(classes) || Object.keys(classes).length > 300) throw fail('Barème par classe invalide.');
  const classFees: Data = {};
  for (const [name, value] of Object.entries(classes)) {
    if (!name.trim() || name.length > 120 || !value || typeof value !== 'object' || Array.isArray(value)) throw fail('Classe invalide.');
    const fields = value as Data;
    const fee = Object.fromEntries(Object.entries(fields).map(([key, amount]) => {
      if (!['registration', 'tuition', 't1', 't2', 't3'].includes(key)) throw fail('Champ tarifaire invalide.');
      return [key, money(amount)];
    }));
    const installments = Number(fee.t1 || 0) + Number(fee.t2 || 0) + Number(fee.t3 || 0);
    if (fee.tuition !== undefined && installments > 0 && installments !== fee.tuition) throw fail('Le total T1/T2/T3 doit correspondre à la scolarité annuelle.');
    classFees[name] = fee;
  }
  const inputPolicy = source.transportPolicy as Data;
  if (!inputPolicy || ![null, 'ITALO_PK_2026'].includes(inputPolicy.feePolicyId as string | null)) throw fail('Politique transport invalide.');
  const periods = inputPolicy.billingPeriods;
  if (!Array.isArray(periods) || periods.length > 12 || new Set(periods).size !== periods.length
    || periods.some(p => typeof p !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)
      || p < `${String(current.academicYear).slice(0, 4)}-09` || p > `${String(current.academicYear).slice(5)}-08`)
    || (inputPolicy.feePolicyId && !periods.length)) throw fail('Mois facturables invalides pour cette année.');
  const rates = inputPolicy.pkRates as Data;
  const pkRates = { pk14To33: money(rates?.pk14To33), pk34To42: money(rates?.pk34To42) };
  if (!pkRates.pk14To33 || !pkRates.pk34To42) throw fail('Le transport maternelle/primaire doit rester payant.');
  const transportPolicy = { ...(current.transportPolicy || {}), feePolicyId: inputPolicy.feePolicyId, billingPeriods: [...periods].sort(), pkRates };
  const previous = { globalFees: current.globalFees || {}, classFees: current.classFees || {}, transportPolicy: current.transportPolicy || {} };
  const next = { globalFees, classFees, transportPolicy };
  const version = createHash('sha256').update(JSON.stringify([school.id, current.academicYear, current.financialTariffVersion || null, next])).digest('hex');
  const versionRef = school.ref.collection('financialTariffVersions').doc(version);
  if ((await tx.get(versionRef)).exists) return { version, replay: true };
  tx.create(versionRef, { academicYear: current.academicYear, previous, next, reason: raw.reason.trim(),
    actorId: uid, effectiveAt: admin.firestore.FieldValue.serverTimestamp(), obligationsPolicy: 'EXISTING_OBLIGATIONS_IMMUTABLE' });
  tx.update(school.ref, { ...next, financialTariffVersion: version });
  tx.create(db.collection('audit_logs').doc(), { schoolId: school.id, userId: uid, action: 'FINANCIAL_TARIFF_VERSION_PUBLISHED', version,
    reason: raw.reason.trim(), academicYear: current.academicYear, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return { version, replay: false };
}
