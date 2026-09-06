import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';

type Data = Record<string, unknown>;
export interface ObligationSnapshot extends Data {
  schoolId: string; studentId: string; academicYear: string; key: string;
  grossExpectedAmount: number; originalDueDate: string | null;
  tariffVersion: string; classId: string; cycle: string; category: string;
}
export const obligationId = (schoolId: string, studentId: string, academicYear: string, key: string) =>
  createHash('sha256').update(JSON.stringify([schoolId, studentId, academicYear, key])).digest('hex');

export async function readObligations(tx: admin.firestore.Transaction, db: admin.firestore.Firestore,
  schoolId: string, studentId: string, academicYear: string): Promise<Record<string, ObligationSnapshot>> {
  const docs = await tx.get(db.collection('studentFinancialObligations').where('studentId', '==', studentId));
  const result: Record<string, ObligationSnapshot> = {};
  for (const doc of docs.docs) {
    const item = doc.data() as ObligationSnapshot;
    if (item.schoolId !== schoolId || item.academicYear !== academicYear) continue;
    if (typeof item.key !== 'string' || doc.id !== obligationId(schoolId, studentId, academicYear, item.key)
      || !Number.isSafeInteger(item.grossExpectedAmount) || item.grossExpectedAmount <= 0
      || (item.originalDueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(item.originalDueDate))) {
      throw new functions.https.HttpsError('failed-precondition', 'Snapshot financier incohérent.');
    }
    result[item.key] = item;
  }
  return result;
}

export const snapshotsFrom = (source: Data): Record<string, ObligationSnapshot> =>
  (source.obligationSnapshots || {}) as Record<string, ObligationSnapshot>;

export function freezeObligations(tx: admin.firestore.Transaction, db: admin.firestore.Firestore,
  existing: Record<string, ObligationSnapshot>, scope: { schoolId: string; studentId: string; academicYear: string;
    classId: string; cycle: string; tariffVersion: string },
  lines: Array<{ key: string; type: string; label?: string; tariffVersion?: string; category?: string; grossExpectedAmount: number; netExpectedAmount: number;
    originalDueDate: string | null; period: string | null; feeId: string | null; zonePk?: number | null }>) {
  for (const line of lines) {
    if (existing[line.key] || line.grossExpectedAmount <= 0) continue;
    // Aggregate transport is not an obligation: freeze its individual monthly lines instead.
    if (line.type === 'transport' && !line.period) continue;
    tx.create(db.collection('studentFinancialObligations').doc(obligationId(scope.schoolId, scope.studentId, scope.academicYear, line.key)), {
      ...scope, key: line.key, label: line.label || line.key, tariffVersion: line.tariffVersion || scope.tariffVersion, category: line.category || line.type,
      grossExpectedAmount: line.grossExpectedAmount, netExpectedAmountAtCreation: line.netExpectedAmount,
      originalDueDate: line.originalDueDate, period: line.period, feeId: line.feeId, zonePk: line.zonePk ?? null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}
