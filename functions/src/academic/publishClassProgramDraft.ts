import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { computeDraftStateToken, DraftSubjectInput } from './draftStateToken';
import { resolveAcademicYear, resolveClassProgram } from './academicResolvers';

export const publishClassProgramDraft = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId, academicYearId, classId, expectedDraftRevisionId, expectedDraftStateToken } = data || {};

  // 1. Parameter validation
  if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'schoolId doit être une chaîne non vide valide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  if (typeof academicYearId !== 'string' || academicYearId.trim() === '' || academicYearId.includes('/') || academicYearId.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'academicYearId invalide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  if (typeof classId !== 'string' || classId.trim() === '' || classId.includes('/') || classId.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'classId doit être une chaîne non vide valide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  if (typeof expectedDraftRevisionId !== 'string' || expectedDraftRevisionId.trim() === '' || expectedDraftRevisionId.includes('/')) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'expectedDraftRevisionId doit être une chaîne non vide valide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  if (typeof expectedDraftStateToken !== 'string' || !/^[0-9a-f]{64}$/.test(expectedDraftStateToken)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'expectedDraftStateToken doit être un hash SHA-256 de 64 caractères hexadécimaux minuscules.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  const cleanSchoolId = schoolId.trim();
  const cleanAcademicYearId = academicYearId.trim();
  const cleanClassId = classId.trim();

  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read operator user profile
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Utilisateur opérateur introuvable.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      const user = userSnap.data()!;
      if (user.isActive !== true) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Compte utilisateur inactif.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
      if (!allowedRoles.includes(user.role)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Rôle non autorisé à gérer les programmes.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      if (user.role !== 'superAdmin' && user.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'L\'opérateur n\'appartient pas à l\'école demandée.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }

      // 2. Read class document
      const classRef = db.collection('classes').doc(cleanClassId);
      const classSnap = await transaction.get(classRef);
      if (!classSnap.exists) {
        throw new functions.https.HttpsError(
          'not-found',
          'Classe introuvable.',
          { businessCode: 'CLASS_NOT_FOUND' }
        );
      }
      const classData = classSnap.data()!;
      if (classData.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'La classe n\'appartient pas à l\'école spécifiée.',
          { businessCode: 'INVALID_ARGUMENT' }
        );
      }

      // 3. Resolve Academic Year and Class Program
      const resolvedYear = await resolveAcademicYear(transaction, db, cleanSchoolId, cleanAcademicYearId);
      const resolvedProgram = await resolveClassProgram(transaction, db, cleanSchoolId, cleanClassId, resolvedYear);

      if (!resolvedProgram) {
        throw new functions.https.HttpsError(
          'not-found',
          'Programme introuvable.',
          { businessCode: 'PROGRAM_NOT_FOUND' }
        );
      }

      const programId = resolvedProgram.id;
      const programRef = db.collection('classPrograms').doc(programId);
      const program = resolvedProgram.data;

      if (!expectedDraftRevisionId.startsWith(`${programId}__v`)) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'expectedDraftRevisionId ne correspond pas au programme spécifié.',
          { businessCode: 'INVALID_ARGUMENT' }
        );
      }

      // 3.5 Optimistic Locking check (revision ID) before query
      if (expectedDraftRevisionId !== program.draftRevisionId) {
        throw new functions.https.HttpsError(
          'aborted',
          'Le brouillon a changé depuis son chargement. Rechargez le programme avant de le publier.',
          { businessCode: 'DRAFT_CHANGED' }
        );
      }

      // 4. Read ClassSubjects for current expected revision to compute token and validate
      const subjectsQuery = db.collection('classSubjects')
        .where('programId', '==', programId)
        .where('revisionId', '==', expectedDraftRevisionId);
      const subjectsSnap = await transaction.get(subjectsQuery);

      const subjects = subjectsSnap.docs.map(docSnap => {
        const d = docSnap.data();
        const expectedDocId = `${expectedDraftRevisionId}__${d.subjectId}`;

        // Comprehensive integrity checks
        if (
          docSnap.id !== expectedDocId ||
          d.id !== expectedDocId ||
          d.programId !== programId ||
          d.schoolId !== cleanSchoolId ||
          d.classId !== cleanClassId ||
          d.academicYearId !== cleanAcademicYearId ||
          d.revisionId !== expectedDraftRevisionId ||
          typeof d.revisionNumber !== 'number' ||
          d.revisionNumber < 1 ||
          typeof d.subjectId !== 'string' || d.subjectId.trim() === '' ||
          typeof d.subjectNameSnapshot !== 'string' || d.subjectNameSnapshot.trim() === '' ||
          typeof d.isRequired !== 'boolean' ||
          typeof d.isActive !== 'boolean' ||
          typeof d.displayOrder !== 'number' || d.displayOrder < 0 || !Number.isInteger(d.displayOrder)
        ) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Incohérence de données détectée dans les matières.',
            { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
          );
        }

        if (d.isActive) {
          if (d.coefficient === undefined || d.coefficient === null) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Le coefficient est obligatoire pour les matières actives.',
              { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
            );
          }
          if (typeof d.coefficient !== 'number' || d.coefficient <= 0 || isNaN(d.coefficient)) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Coefficient invalide détecté.',
              { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
            );
          }

          if (d.weeklyHours === undefined || d.weeklyHours === null) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Le volume horaire est obligatoire pour les matières actives.',
              { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
            );
          }
          if (typeof d.weeklyHours !== 'number' || d.weeklyHours <= 0 || isNaN(d.weeklyHours)) {
            throw new functions.https.HttpsError(
              'failed-precondition',
              'Heures hebdomadaires invalides détectées.',
              { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
            );
          }
        } else {
          // Si inactive, on s'assure juste que s'il y a une valeur, elle est valide
          if (d.coefficient !== undefined && d.coefficient !== null) {
            if (typeof d.coefficient !== 'number' || d.coefficient <= 0 || isNaN(d.coefficient)) {
              throw new functions.https.HttpsError(
                'failed-precondition',
                'Coefficient invalide détecté.',
                { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
              );
            }
          }
          if (d.weeklyHours !== undefined && d.weeklyHours !== null) {
            if (typeof d.weeklyHours !== 'number' || d.weeklyHours <= 0 || isNaN(d.weeklyHours)) {
              throw new functions.https.HttpsError(
                'failed-precondition',
                'Heures hebdomadaires invalides détectées.',
                { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
              );
            }
          }
        }

        return d;
      });

      // Subject counts & duplicates checks
      if (subjects.length === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Le programme ne contient aucune matière.',
          { businessCode: 'PROGRAM_NOT_READY' }
        );
      }

      const activeSubjects = subjects.filter(s => s.isActive);
      if (activeSubjects.length === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Le programme doit contenir au moins une matière active.',
          { businessCode: 'NO_ACTIVE_SUBJECT' }
        );
      }

      const seenSubjectIds = new Set<string>();
      for (const s of subjects) {
        if (seenSubjectIds.has(s.subjectId)) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Matière dupliquée détectée dans le programme.',
            { businessCode: 'DUPLICATE_SUBJECT' }
          );
        }
        seenSubjectIds.add(s.subjectId);
      }

      // Compute actual token
      const actualDraftStateToken = computeDraftStateToken(subjects as unknown as DraftSubjectInput[]);

      // 5. Idempotency Check (Retry already published)
      const isAlreadyPublished =
        program.status === 'published' &&
        program.hasUnpublishedChanges === false &&
        program.publishedRevisionId === expectedDraftRevisionId &&
        program.draftRevisionId === expectedDraftRevisionId &&
        program.publishedRevisionNumber === program.draftRevisionNumber &&
        program.publishedAt !== undefined &&
        program.publishedBy !== undefined;

      if (isAlreadyPublished) {
        if (expectedDraftStateToken !== actualDraftStateToken) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Incohérence d\'état du brouillon publié.',
            { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
          );
        }
        return {
          programId,
          publishedRevisionId: expectedDraftRevisionId,
          publishedRevisionNumber: program.publishedRevisionNumber,
          published: false,
          alreadyPublished: true,
          activeSubjectCount: activeSubjects.length,
          inactiveSubjectCount: subjects.length - activeSubjects.length,
          publishedDraftStateToken: actualDraftStateToken
        };
      }

      // If program claims to have no unpublished changes but doesn't match above, it's an integrity error
      if (program.hasUnpublishedChanges === false) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Le programme n\'a pas de modifications en attente de publication.',
          { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
        );
      }

      // 6. Optimistic Locking check (state token)

      if (expectedDraftStateToken !== actualDraftStateToken) {
        throw new functions.https.HttpsError(
          'aborted',
          'Le brouillon a changé depuis son chargement. Rechargez le programme avant de le publier.',
          { businessCode: 'DRAFT_CHANGED' }
        );
      }

      // 7. Validate program state flow invariants
      const isFirstPublication =
        program.status === 'draft' &&
        program.publishedRevisionId === undefined &&
        program.publishedRevisionNumber === undefined &&
        program.draftRevisionNumber === 1;

      const isSubsequentPublication =
        program.status === 'published' &&
        typeof program.publishedRevisionId === 'string' &&
        program.publishedRevisionId !== '' &&
        typeof program.publishedRevisionNumber === 'number' &&
        program.publishedRevisionNumber >= 1 &&
        program.draftRevisionId !== program.publishedRevisionId &&
        program.draftRevisionNumber > program.publishedRevisionNumber;

      if (!isFirstPublication && !isSubsequentPublication) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Incohérence structurelle détectée sur l\'état du programme.',
          { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
        );
      }

      // 8. Execute update of parent ClassProgram
      transaction.update(programRef, {
        status: 'published',
        publishedRevisionId: expectedDraftRevisionId,
        publishedRevisionNumber: program.draftRevisionNumber,
        hasUnpublishedChanges: false,
        publishedAt: nowIso,
        publishedBy: uid,
        updatedAt: nowIso,
        updatedBy: uid
      });

      return {
        programId,
        publishedRevisionId: expectedDraftRevisionId,
        publishedRevisionNumber: program.draftRevisionNumber,
        published: true,
        alreadyPublished: false,
        activeSubjectCount: activeSubjects.length,
        inactiveSubjectCount: subjects.length - activeSubjects.length,
        publishedDraftStateToken: actualDraftStateToken
      };
    });
  } catch (error: unknown) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    const errMessage = error instanceof Error ? error.message : 'Une erreur interne est survenue.';
    throw new functions.https.HttpsError(
      'internal',
      errMessage,
      { businessCode: 'INTERNAL_ERROR' }
    );
  }
});
