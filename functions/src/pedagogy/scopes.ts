import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
export type PedagogyData = admin.firestore.DocumentData;
export const activePedagogyDocument = (value: PedagogyData): boolean => value.isActive !== false && value.active !== false && !['inactive', 'archived', 'cancelled', 'draft'].includes(value.status);
export function scopedDocument(snap: admin.firestore.DocumentSnapshot, schoolId: string, label = 'Document'): PedagogyData {
  if (!snap.exists || snap.data()?.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', `${label} absent ou hors établissement.`);
  return snap.data()!;
}
export function boundedPedagogyText(value: unknown, label: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new functions.https.HttpsError('invalid-argument', `${label} requis (maximum ${max} caractères).`);
  return value.trim();
}
export async function responsibleTeacher(transaction: admin.firestore.Transaction, db: admin.firestore.Firestore, scope: { schoolId: string; academicYearId: string; classId: string; subjectId: string }, teacherStaffId: string) {
  const [staffSnap, assignments] = await Promise.all([
    transaction.get(db.collection('staff').doc(teacherStaffId)),
    transaction.get(db.collection('teacherAssignments').where('schoolId', '==', scope.schoolId).where('academicYearId', '==', scope.academicYearId).where('classId', '==', scope.classId).where('subjectId', '==', scope.subjectId).limit(21))
  ]);
  const staff = scopedDocument(staffSnap, scope.schoolId, 'Enseignant');
  if (staff.role !== 'teacher' || !activePedagogyDocument(staff) || assignments.size > 20) throw new functions.https.HttpsError('permission-denied', 'Responsabilité pédagogique non vérifiable.');
  const owned = assignments.docs.filter(doc => { const row = doc.data(); return row.teacherStaffId === teacherStaffId && activePedagogyDocument(row) && (row.status === 'active' || row.isActive === true); });
  if (owned.length !== 1) throw new functions.https.HttpsError('permission-denied', 'Une affectation active unique est requise pour cet enseignant et cette matière.');
  return { id: owned[0].id, ...owned[0].data() };
}
