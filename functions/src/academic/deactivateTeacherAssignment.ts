import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const deactivateTeacherAssignment = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId, academicYearId, classId, subjectId, reason } = data || {};

  // Parameter validation
  if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof academicYearId !== 'string' || !/^\d{4}-\d{4}$/.test(academicYearId)) {
    throw new functions.https.HttpsError('invalid-argument', 'academicYearId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof classId !== 'string' || classId.trim() === '' || classId.includes('/') || classId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'classId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof subjectId !== 'string' || subjectId.trim() === '' || subjectId.includes('/') || subjectId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'subjectId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }

  const cleanSchoolId = schoolId.trim();
  const cleanAcademicYearId = academicYearId.trim();
  const cleanClassId = classId.trim();
  const cleanSubjectId = subjectId.trim();

  let cleanReason: string | undefined = undefined;
  if (typeof reason === 'string') {
    const trimmed = reason.trim();
    if (trimmed.length > 500) {
      throw new functions.https.HttpsError('invalid-argument', 'Raison trop longue.', { businessCode: 'INVALID_ARGUMENT' });
    }
    if (trimmed !== '') {
      cleanReason = trimmed;
    }
  }

  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read operator profile
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Utilisateur opérateur introuvable.', { businessCode: 'PERMISSION_DENIED' });
      }
      const operator = userSnap.data()!;
      if (operator.isActive !== true && operator.active !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Compte opérateur inactif.', { businessCode: 'PERMISSION_DENIED' });
      }
      const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
      if (!allowedRoles.includes(operator.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé.', { businessCode: 'PERMISSION_DENIED' });
      }
      if (operator.role !== 'superAdmin' && operator.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'opérateur n\'appartient pas à l\'école.', { businessCode: 'SCHOOL_MISMATCH' });
      }

      // 2. Read slot
      const slotId = `${cleanSchoolId}__${cleanAcademicYearId}__${cleanClassId}__${cleanSubjectId}__primary`;
      const slotRef = db.collection('teacherAssignmentSlots').doc(slotId);
      const slotSnap = await transaction.get(slotRef);

      if (!slotSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Aucune affectation trouvée pour cette classe et matière.', { businessCode: 'ASSIGNMENT_NOT_FOUND' });
      }

      const slotData = slotSnap.data()!;
      // CAS B — slot déjà inactif
      if (slotData.isActive === false) {
        return {
          deactivated: false,
          alreadyDeactivated: true,
          assignmentId: slotData.assignmentId,
          slotId
        };
      }

      const assignmentId = slotData.assignmentId;
      const assignmentRef = db.collection('teacherAssignments').doc(assignmentId);
      const assignmentSnap = await transaction.get(assignmentRef);

      if (!assignmentSnap.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité de l\'affectation.', { businessCode: 'ASSIGNMENT_INTEGRITY_ERROR' });
      }

      const assignmentData = assignmentSnap.data()!;
      if (assignmentData.isActive !== true) {
        throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'état entre le slot et l\'historique.', { businessCode: 'ASSIGNMENT_INTEGRITY_ERROR' });
      }

      // Deactivate historical document
      transaction.update(assignmentRef, {
        isActive: false,
        endedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: uid,
        deactivatedAt: nowIso,
        deactivatedBy: uid,
        ...(cleanReason ? { deactivationReason: cleanReason } : {})
      });

      // Update slot
      transaction.update(slotRef, {
        isActive: false,
        updatedAt: nowIso,
        updatedBy: uid
      });

      return {
        deactivated: true,
        alreadyDeactivated: false,
        assignmentId,
        slotId
      };
    });
  } catch (err: unknown) {
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    throw new functions.https.HttpsError(
      'internal',
      err instanceof Error ? err.message : String(err)
    );
  }
});
