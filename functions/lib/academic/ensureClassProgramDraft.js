"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureClassProgramDraft = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
exports.ensureClassProgramDraft = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'L\'utilisateur doit être authentifié.', { businessCode: 'UNAUTHENTICATED' });
    }
    const uid = context.auth.uid;
    const { schoolId, academicYearId, classId } = data || {};
    // 1. Argument validation
    if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    if (typeof academicYearId !== 'string' || !/^\d{4}-\d{4}$/.test(academicYearId)) {
        throw new functions.https.HttpsError('invalid-argument', 'academicYearId doit respecter le format YYYY-YYYY.', { businessCode: 'INVALID_ARGUMENT' });
    }
    if (typeof classId !== 'string' || classId.trim() === '' || classId.includes('/') || classId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'classId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    const cleanSchoolId = schoolId.trim();
    const cleanAcademicYearId = academicYearId.trim();
    const cleanClassId = classId.trim();
    const programId = `${cleanSchoolId}__${cleanAcademicYearId}__${cleanClassId}`;
    const db = admin.firestore();
    const nowIso = new Date().toISOString();
    try {
        return await db.runTransaction(async (transaction) => {
            // 1. Read operator user profile
            const userRef = db.collection('users').doc(uid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) {
                throw new functions.https.HttpsError('permission-denied', 'Utilisateur opérateur introuvable.', { businessCode: 'PERMISSION_DENIED' });
            }
            const user = userSnap.data();
            if (user.isActive !== true) {
                throw new functions.https.HttpsError('permission-denied', 'Compte utilisateur inactif.', { businessCode: 'PERMISSION_DENIED' });
            }
            const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
            if (!allowedRoles.includes(user.role)) {
                throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé à gérer les programmes.', { businessCode: 'PERMISSION_DENIED' });
            }
            if (user.role !== 'superAdmin' && user.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('permission-denied', 'L\'opérateur n\'appartient pas à l\'école demandée.', { businessCode: 'PERMISSION_DENIED' });
            }
            // 2. Read class document
            const classRef = db.collection('classes').doc(cleanClassId);
            const classSnap = await transaction.get(classRef);
            if (!classSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Classe introuvable.', { businessCode: 'CLASS_NOT_FOUND' });
            }
            const classData = classSnap.data();
            if (classData.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('invalid-argument', 'La classe n\'appartient pas à l\'école spécifiée.', { businessCode: 'INVALID_ARGUMENT' });
            }
            // 3. Read ClassProgram document
            const programRef = db.collection('classPrograms').doc(programId);
            const programSnap = await transaction.get(programRef);
            // Case A: Program does not exist
            if (!programSnap.exists) {
                const initialDraftRevisionNumber = 1;
                const initialDraftRevisionId = `${programId}__v${initialDraftRevisionNumber}`;
                // Orphan check / Collision check on revision & subjects
                const targetSubjectsQuery = db.collection('classSubjects')
                    .where('programId', '==', programId);
                const targetSubjectsSnap = await transaction.get(targetSubjectsQuery);
                if (!targetSubjectsSnap.empty) {
                    throw new functions.https.HttpsError('failed-precondition', 'Des matières orphelines existent déjà pour ce programme.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
                }
                const newProgramPayload = {
                    id: programId,
                    schoolId: cleanSchoolId,
                    academicYearId: cleanAcademicYearId,
                    classId: cleanClassId,
                    status: 'draft',
                    draftRevisionId: initialDraftRevisionId,
                    draftRevisionNumber: initialDraftRevisionNumber,
                    hasUnpublishedChanges: true,
                    createdBy: uid,
                    createdAt: nowIso,
                    updatedBy: uid,
                    updatedAt: nowIso
                };
                transaction.create(programRef, newProgramPayload);
                return {
                    programId,
                    draftRevisionId: initialDraftRevisionId,
                    draftRevisionNumber: initialDraftRevisionNumber,
                    created: true,
                    clonedSubjectCount: 0,
                    mode: 'initial'
                };
            }
            const program = programSnap.data();
            // Case B/D: Brouillon actif existant (avec ou sans version publiée)
            const hasValidDraft = program.hasUnpublishedChanges === true &&
                typeof program.draftRevisionId === 'string' &&
                program.draftRevisionId !== '' &&
                typeof program.draftRevisionNumber === 'number' &&
                program.draftRevisionNumber >= 1 &&
                program.draftRevisionId === `${programId}__v${program.draftRevisionNumber}` &&
                (program.publishedRevisionId === undefined || program.draftRevisionId !== program.publishedRevisionId);
            if (program.hasUnpublishedChanges === true && !hasValidDraft) {
                throw new functions.https.HttpsError('failed-precondition', 'Le programme présente un brouillon incohérent.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
            }
            if (hasValidDraft) {
                return {
                    programId,
                    draftRevisionId: program.draftRevisionId,
                    draftRevisionNumber: program.draftRevisionNumber,
                    created: false,
                    clonedSubjectCount: 0,
                    mode: 'existing-draft'
                };
            }
            // If program has not been published yet but has no draft and is not published
            if ((!program.publishedRevisionId ||
                typeof program.publishedRevisionId !== 'string' ||
                program.publishedRevisionId.trim() === '') &&
                program.status === 'draft') {
                // If it's draft status with no active draft ID, let's create v1 draft revision.
                const initialDraftRevisionNumber = 1;
                const initialDraftRevisionId = `${programId}__v${initialDraftRevisionNumber}`;
                transaction.update(programRef, {
                    draftRevisionId: initialDraftRevisionId,
                    draftRevisionNumber: initialDraftRevisionNumber,
                    hasUnpublishedChanges: true,
                    updatedAt: nowIso,
                    updatedBy: uid
                });
                return {
                    programId,
                    draftRevisionId: initialDraftRevisionId,
                    draftRevisionNumber: initialDraftRevisionNumber,
                    created: true,
                    clonedSubjectCount: 0,
                    mode: 'initial'
                };
            }
            // Verify published but no draft state
            const isPublishedWithoutDraft = program.status === 'published' &&
                program.hasUnpublishedChanges === false &&
                typeof program.publishedRevisionId === 'string' &&
                program.publishedRevisionId !== '' &&
                typeof program.publishedRevisionNumber === 'number' &&
                program.publishedRevisionNumber >= 1 &&
                program.draftRevisionId === program.publishedRevisionId &&
                program.draftRevisionNumber === program.publishedRevisionNumber;
            if (!isPublishedWithoutDraft) {
                throw new functions.https.HttpsError('failed-precondition', 'Le programme présente une révision incohérente.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
            }
            // 5. Calculate new revision IDs
            const newDraftRevisionNumber = program.publishedRevisionNumber + 1;
            const newDraftRevisionId = `${programId}__v${newDraftRevisionNumber}`;
            // 6. Read target subjects (collision check)
            const targetSubjectsQuery = db.collection('classSubjects')
                .where('programId', '==', programId)
                .where('revisionId', '==', newDraftRevisionId);
            const targetSubjectsSnap = await transaction.get(targetSubjectsQuery);
            if (!targetSubjectsSnap.empty) {
                throw new functions.https.HttpsError('aborted', 'La révision cible existe déjà.', { businessCode: 'REVISION_CONFLICT' });
            }
            // 7. Read published subjects to clone
            const publishedSubjectsQuery = db.collection('classSubjects')
                .where('programId', '==', programId)
                .where('revisionId', '==', program.publishedRevisionId);
            const publishedSubjectsSnap = await transaction.get(publishedSubjectsQuery);
            const seenSubjectIds = new Set();
            const publishedSubjects = publishedSubjectsSnap.docs.map(docSnap => {
                const data = docSnap.data();
                if (data.programId !== programId ||
                    data.schoolId !== cleanSchoolId ||
                    data.classId !== program.classId ||
                    data.academicYearId !== program.academicYearId ||
                    data.revisionId !== program.publishedRevisionId ||
                    data.revisionNumber !== program.publishedRevisionNumber) {
                    throw new functions.https.HttpsError('failed-precondition', 'Incohérence de données détectée dans les matières publiées.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
                }
                if (seenSubjectIds.has(data.subjectId)) {
                    throw new functions.https.HttpsError('failed-precondition', 'Matière dupliquée détectée dans la révision publiée.', { businessCode: 'PROGRAM_INTEGRITY_ERROR' });
                }
                seenSubjectIds.add(data.subjectId);
                return data;
            });
            // 8. Size checks (500 maximum transaction limit margin)
            const MAX_CLONED_SUBJECTS = 200;
            if (publishedSubjects.length > MAX_CLONED_SUBJECTS) {
                throw new functions.https.HttpsError('resource-exhausted', 'Le programme contient trop de matières à cloner.', { businessCode: 'PROGRAM_TOO_LARGE' });
            }
            // 9. Clone published subjects
            for (const subj of publishedSubjects) {
                const newClassSubjectId = `${newDraftRevisionId}__${subj.subjectId}`;
                const newRef = db.collection('classSubjects').doc(newClassSubjectId);
                const payload = {
                    id: newClassSubjectId,
                    programId,
                    schoolId: cleanSchoolId,
                    classId: program.classId,
                    academicYearId: program.academicYearId,
                    subjectId: subj.subjectId,
                    revisionId: newDraftRevisionId,
                    revisionNumber: newDraftRevisionNumber,
                    subjectNameSnapshot: subj.subjectNameSnapshot,
                    isRequired: subj.isRequired,
                    displayOrder: subj.displayOrder,
                    isActive: subj.isActive,
                    createdAt: nowIso,
                    createdBy: uid,
                    updatedAt: nowIso,
                    updatedBy: uid
                };
                if (subj.subjectCodeSnapshot !== undefined) {
                    payload.subjectCodeSnapshot = subj.subjectCodeSnapshot;
                }
                if (subj.coefficient !== undefined) {
                    payload.coefficient = subj.coefficient;
                }
                if (subj.weeklyHours !== undefined) {
                    payload.weeklyHours = subj.weeklyHours;
                }
                transaction.create(newRef, payload);
            }
            // 10. Update parent ClassProgram
            transaction.update(programRef, {
                draftRevisionId: newDraftRevisionId,
                draftRevisionNumber: newDraftRevisionNumber,
                hasUnpublishedChanges: true,
                updatedAt: nowIso,
                updatedBy: uid
            });
            return {
                programId,
                draftRevisionId: newDraftRevisionId,
                draftRevisionNumber: newDraftRevisionNumber,
                created: true,
                clonedSubjectCount: publishedSubjects.length,
                mode: 'cloned-from-published'
            };
        });
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        const errMessage = error instanceof Error ? error.message : 'Une erreur interne est survenue.';
        throw new functions.https.HttpsError('internal', errMessage, { businessCode: 'INTERNAL_ERROR' });
    }
});
//# sourceMappingURL=ensureClassProgramDraft.js.map