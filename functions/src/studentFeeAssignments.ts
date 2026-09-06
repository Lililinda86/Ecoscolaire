import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { appliesToStudent, feeAssignmentId, schoolFees, SchoolFee } from './schoolFeeCatalog';
type Data = Record<string, unknown>;
export interface PendingFeeAssignment { ref: admin.firestore.DocumentReference; data: Data }
export async function readStudentFees(tx: admin.firestore.Transaction, db: admin.firestore.Firestore,
  schoolId: string, studentId: string, academicYear: string, school: Data, student: Data, classData: Data) {
  const snapshots = await tx.get(db.collection('studentFeeAssignments').where('studentId', '==', studentId));
  const fees = new Map<string, SchoolFee>();
  for (const snapshot of snapshots.docs) {
    const d = snapshot.data();
    if (d.schoolId !== schoolId || d.academicYear !== academicYear) continue;
    if (snapshot.id !== feeAssignmentId(schoolId, studentId, academicYear, d.feeId) || d.fee?.id !== d.feeId || d.fee?.schemaVersion !== 2 || !Number.isSafeInteger(d.fee.amount) || d.fee.amount <= 0) throw new functions.https.HttpsError('failed-precondition', 'Affectation financière incohérente.');
    fees.set(d.feeId, d.fee);
  }
  const pending: PendingFeeAssignment[] = [];
  for (const entry of schoolFees(school)) {
    if (entry.schemaVersion !== 2) continue;
    const fee = entry as SchoolFee;
    if (fees.has(fee.id) || !fee.mandatory || !appliesToStudent(fee, { ...student, id: studentId }, classData, academicYear)) continue;
    fees.set(fee.id, fee);
    pending.push({ ref: db.collection('studentFeeAssignments').doc(feeAssignmentId(schoolId, studentId, academicYear, fee.id)),
      data: { schoolId, studentId, academicYear, feeId: fee.id, fee, assignedBy: 'mandatory-policy', assignedAt: admin.firestore.FieldValue.serverTimestamp() } });
  }
  return { fees: [...fees.values()], pending };
}
export function writePendingFees(tx: admin.firestore.Transaction, pending: PendingFeeAssignment[]) {
  for (const assignment of pending) tx.create(assignment.ref, assignment.data);
}
