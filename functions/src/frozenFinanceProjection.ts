import * as admin from 'firebase-admin';
import { readObligations } from './financialObligationSnapshots';
import { resolveStudentFinanceData } from './studentFinanceProjection';

/** Legacy payment entry points consume the same established gross tariffs as V3. */
export async function readFrozenFinance(tx: admin.firestore.Transaction, db: admin.firestore.Firestore,
  student: admin.firestore.DocumentData, financeSnapshot: admin.firestore.DocumentSnapshot) {
  const finance = resolveStudentFinanceData(student, financeSnapshot);
  if (typeof student.schoolId !== 'string' || !student.schoolId) return finance;
  const school = await tx.get(db.collection('schools').doc(student.schoolId));
  const year = school.data()?.academicYear;
  if (typeof year !== 'string') return finance;
  const snapshots = await readObligations(tx, db, student.schoolId, financeSnapshot.id, year);
  for (const [key, field] of [['registration_fee', 'registrationFeeExpected'], ['tuition:T1', 'feeT1'], ['tuition:T2', 'feeT2'], ['tuition:T3', 'feeT3'], ['uniforms', 'feeUniforms']]) {
    if (snapshots[key]) finance[field] = snapshots[key].grossExpectedAmount;
  }
  return finance;
}
