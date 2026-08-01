import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

function resolvePublishedClassProgram(programDocuments: { id: string, data: admin.firestore.DocumentData }[]) {
  if (!programDocuments || programDocuments.length === 0) {
    throw new functions.https.HttpsError('not-found', 'Programme de classe introuvable.', { businessCode: 'PROGRAM_NOT_FOUND' });
  }
  const publishedPrograms = programDocuments.filter(p => p.data.status === 'published');
  if (publishedPrograms.length === 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Le programme de cette classe n\'est pas publié.', { businessCode: 'PROGRAM_NOT_PUBLISHED' });
  }
  if (publishedPrograms.length > 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Plusieurs programmes publiés ont été trouvés.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
  }
  return {
    programId: publishedPrograms[0].id,
    programData: publishedPrograms[0].data
  };
}

function resolvePublishedProgramSubject(params: { publishedSubjects: { id: string, data: admin.firestore.DocumentData }[], requestedSubjectId: string }) {
  const { publishedSubjects, requestedSubjectId } = params;

  // Chercher par catalogSubjectId d'abord, sinon subjectId (fallback)
  const matches = publishedSubjects.filter(s =>
    s.data.catalogSubjectId === requestedSubjectId || s.data.subjectId === requestedSubjectId
  );

  if (matches.length === 0) {
    throw new functions.https.HttpsError('not-found', 'Matière absente du programme publié.', { businessCode: 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM' });
  }

  if (matches.length > 1) {
    throw new functions.https.HttpsError('failed-precondition', 'Plusieurs matières correspondent à cet identifiant.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
  }

  const subjectData = matches[0].data;

  if (subjectData.isActive === false) {
    throw new functions.https.HttpsError('failed-precondition', 'La matière publiée est inactive.', { businessCode: 'PUBLISHED_SUBJECT_INACTIVE' });
  }

  return {
    programSubjectId: matches[0].id,
    canonicalSubjectId: requestedSubjectId,
    catalogSubjectId: subjectData.catalogSubjectId,
    code: subjectData.subjectCodeSnapshot,
    name: subjectData.subjectNameSnapshot,
    programId: subjectData.programId
  };
}

export const setPrimaryTeacherAssignment = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId, academicYearId, classId, subjectId, teacherStaffId } = data || {};

  // Parameter validation
  if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof academicYearId !== 'string' || academicYearId.trim() === '' || academicYearId.includes('/') || academicYearId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'academicYearId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof classId !== 'string' || classId.trim() === '' || classId.includes('/') || classId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'classId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof subjectId !== 'string' || subjectId.trim() === '' || subjectId.includes('/') || subjectId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'subjectId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof teacherStaffId !== 'string' || teacherStaffId.trim() === '' || teacherStaffId.includes('/') || teacherStaffId.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'teacherStaffId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }

  const cleanSchoolId = schoolId.trim();
  const cleanAcademicYearId = academicYearId.trim();
  const cleanClassId = classId.trim();
  const cleanSubjectId = subjectId.trim();
  const cleanTeacherStaffId = teacherStaffId.trim();

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

      // 1.5 Read AcademicYear
      const academicYearRef = db.collection('academicYears').doc(cleanAcademicYearId);
      const academicYearSnap = await transaction.get(academicYearRef);
      if (!academicYearSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Année scolaire introuvable.', { businessCode: 'ACADEMIC_YEAR_NOT_FOUND' });
      }
      const academicYearData = academicYearSnap.data()!;
      if (academicYearData.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'année scolaire ne correspond pas à l\'école.', { businessCode: 'SCHOOL_MISMATCH' });
      }

      // 2. Read class
      const classRef = db.collection('classes').doc(cleanClassId);
      const classSnap = await transaction.get(classRef);
      if (!classSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Classe introuvable.', { businessCode: 'CLASS_NOT_FOUND' });
      }
      const classData = classSnap.data()!;
      if (classData.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'école de la classe ne correspond pas.', { businessCode: 'SCHOOL_MISMATCH' });
      }
      if (classData.isActive === false || classData.active === false) {
        throw new functions.https.HttpsError('failed-precondition', 'La classe est inactive.', { businessCode: 'CLASS_INACTIVE' });
      }

      // 3. Read staff teacher
      const staffRef = db.collection('staff').doc(cleanTeacherStaffId);
      const staffSnap = await transaction.get(staffRef);
      if (!staffSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Enseignant introuvable dans le personnel.', { businessCode: 'TEACHER_NOT_FOUND' });
      }
      const staffData = staffSnap.data()!;
      if (staffData.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'école de l\'enseignant ne correspond pas.', { businessCode: 'SCHOOL_MISMATCH' });
      }
      const staffType = staffData.staffType || staffData.role || 'other';
      const teachingEnabled = staffData.teachingEnabled === true;
      const isEligible = staffType === 'teacher' || teachingEnabled;

      if (!isEligible) {
        throw new functions.https.HttpsError('failed-precondition', 'Le membre du personnel n\'est pas un enseignant.', { businessCode: 'TEACHER_NOT_ELIGIBLE' });
      }

      const employmentStatus = staffData.employmentStatus || (staffData.isActive === false || staffData.active === false ? 'inactive' : (staffData.isActive === true || staffData.active === true ? 'active' : 'inactive'));
      if (employmentStatus !== 'active' && staffData.status !== 'actif' && staffData.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'L\'enseignant est inactif.', { businessCode: 'TEACHER_INACTIVE' });
      }

      // 4. Read staff-user links
      const linkByStaffRef = db.collection('staffUserLinkByStaff').doc(`${cleanSchoolId}__${cleanTeacherStaffId}`);
      const linkByStaffSnap = await transaction.get(linkByStaffRef);
      let teacherUserId: string | null = null;

      if (linkByStaffSnap.exists) {
        const linkByStaffData = linkByStaffSnap.data()!;
        if (linkByStaffData.isActive === true) {
          const linkId = linkByStaffData.linkId;
          const userId = linkByStaffData.userId;

          const linkByUserRef = db.collection('staffUserLinkByUser').doc(userId);
          const linkSnap = db.collection('staffUserLinks').doc(linkId);

          const [linkByUserSnap, linkDocSnap] = await Promise.all([
            transaction.get(linkByUserRef),
            transaction.get(linkSnap)
          ]);

          if (!linkByUserSnap.exists || !linkDocSnap.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Incohérence détectée dans la liaison de l\'enseignant.', { businessCode: 'TEACHER_LINK_INTEGRITY_ERROR' });
          }

          const linkByUser = linkByUserSnap.data()!;
          const linkDoc = linkDocSnap.data()!;

          if (
            linkByUser.staffId !== cleanTeacherStaffId ||
            linkByUser.userId !== userId ||
            linkByUser.linkId !== linkId ||
            linkByUser.isActive !== true ||
            linkDoc.staffId !== cleanTeacherStaffId ||
            linkDoc.userId !== userId ||
            linkDoc.isActive !== true ||
            linkDoc.schoolId !== cleanSchoolId
          ) {
            throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité de la liaison utilisateur.', { businessCode: 'TEACHER_LINK_INTEGRITY_ERROR' });
          }

          teacherUserId = userId;
        }
      }

      // 5. Read ClassProgram by fields instead of reconstructed ID
      const programQuery = await transaction.get(
        db.collection('classPrograms')
          .where('schoolId', '==', cleanSchoolId)
          .where('classId', '==', cleanClassId)
          .where('academicYearId', '==', cleanAcademicYearId)
      );

      const programDocuments = programQuery.docs.map(doc => ({ id: doc.id, data: doc.data() }));
      const { programId, programData } = resolvePublishedClassProgram(programDocuments);

      if (programData.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'Programme d\'une autre école.', { businessCode: 'SCHOOL_MISMATCH' });
      }
      const publishedRevisionId = programData.publishedRevisionId;
      if (!publishedRevisionId) {
        throw new functions.https.HttpsError('failed-precondition', 'Le programme de cette classe n\'est pas publié.', { businessCode: 'PROGRAM_NOT_PUBLISHED' });
      }

      // 6. Read ClassSubjects from the published revision
      const classSubjectsQuery = await transaction.get(
        db.collection('classSubjects')
          .where('programId', '==', programId)
          .where('revisionId', '==', publishedRevisionId)
      );

      const publishedSubjects = classSubjectsQuery.docs.map(doc => ({ id: doc.id, data: doc.data() }));
      const resolvedSubject = resolvePublishedProgramSubject({
        publishedSubjects,
        requestedSubjectId: cleanSubjectId
      });

      if (resolvedSubject.programId !== programId) {
        throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité du programme.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
      }

      // 7. Read teacherAssignmentSlots
      const slotId = `${cleanSchoolId}__${cleanAcademicYearId}__${cleanClassId}__${cleanSubjectId}__primary`;
      const slotRef = db.collection('teacherAssignmentSlots').doc(slotId);
      const slotSnap = await transaction.get(slotRef);

      // CAS B — slot actif et même teacherStaffId
      if (slotSnap.exists) {
        const slotData = slotSnap.data()!;
        if (slotData.isActive === true && slotData.teacherStaffId === cleanTeacherStaffId) {
          return {
            assigned: false,
            alreadyAssigned: true,
            assignmentId: slotData.assignmentId,
            slotId
          };
        }
      }

      // Read old assignment if exists and isActive
      let oldAssignmentData: admin.firestore.DocumentData | null = null;
      let oldAssignmentRef: admin.firestore.DocumentReference | null = null;
      if (slotSnap.exists) {
        const slotData = slotSnap.data()!;
        if (slotData.isActive === true) {
          const oldAssignmentId = slotData.assignmentId;
          oldAssignmentRef = db.collection('teacherAssignments').doc(oldAssignmentId);
          const oldAssignmentSnap = await transaction.get(oldAssignmentRef);
          if (!oldAssignmentSnap.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité de l\'ancienne affectation.', { businessCode: 'ASSIGNMENT_INTEGRITY_ERROR' });
          }
          oldAssignmentData = oldAssignmentSnap.data()!;
        }
      }

      // Deactivate old assignment if exists and active
      if (oldAssignmentRef && oldAssignmentData && oldAssignmentData.isActive === true) {
        transaction.update(oldAssignmentRef, {
          isActive: false,
          endedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: uid,
          deactivatedAt: nowIso,
          deactivatedBy: uid,
          deactivationReason: 'Remplacement par un nouvel enseignant principal.'
        });
      }

      // Create new assignment document
      const newAssignmentRef = db.collection('teacherAssignments').doc();
      const newAssignmentId = newAssignmentRef.id;

      const newAssignment = {
        id: newAssignmentId,
        schoolId: cleanSchoolId,
        academicYearId: cleanAcademicYearId,
        classId: cleanClassId,
        subjectId: resolvedSubject.canonicalSubjectId,
        teacherStaffId: cleanTeacherStaffId,
        assignmentRole: 'primary',
        sourceProgramId: programId,
        sourcePublishedRevisionId: publishedRevisionId,
        sourceClassSubjectId: resolvedSubject.programSubjectId,
        isActive: true,
        startedAt: nowIso,
        createdAt: nowIso,
        createdBy: uid,
        updatedAt: nowIso,
        updatedBy: uid,
        ...(teacherUserId ? { teacherUserId } : {})
      };

      transaction.create(newAssignmentRef, newAssignment);

      // Create or update the slot
      const newSlot = {
        id: slotId,
        assignmentId: newAssignmentId,
        schoolId: cleanSchoolId,
        academicYearId: cleanAcademicYearId,
        classId: cleanClassId,
        subjectId: resolvedSubject.canonicalSubjectId,
        teacherStaffId: cleanTeacherStaffId,
        assignmentRole: 'primary',
        sourceProgramId: programId,
        sourcePublishedRevisionId: publishedRevisionId,
        sourceClassSubjectId: resolvedSubject.programSubjectId,
        isActive: true,
        updatedAt: nowIso,
        updatedBy: uid,
        ...(teacherUserId ? { teacherUserId } : {})
      };

      transaction.set(slotRef, newSlot, { merge: true });

      return {
        assigned: true,
        alreadyAssigned: false,
        assignmentId: newAssignmentId,
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
