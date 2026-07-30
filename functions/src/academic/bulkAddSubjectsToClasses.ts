import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const bulkAddSubjectsToClasses = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'L\'utilisateur doit être authentifié.');
  }

  const uid = context.auth.uid;
  const { schoolId, academicYearId, classIds, subjectIds } = data || {};

  if (typeof schoolId !== 'string' || !schoolId.trim()) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalide.');
  }
  if (typeof academicYearId !== 'string' || !/^\d{4}-\d{4}$/.test(academicYearId)) {
    throw new functions.https.HttpsError('invalid-argument', 'academicYearId invalide.');
  }
  if (!Array.isArray(classIds) || classIds.length === 0 || classIds.length > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'classIds doit être un tableau non vide (max 50).');
  }
  if (!Array.isArray(subjectIds) || subjectIds.length === 0 || subjectIds.length > 50) {
    throw new functions.https.HttpsError('invalid-argument', 'subjectIds doit être un tableau non vide (max 50).');
  }

  const cleanSchoolId = schoolId.trim();
  const cleanAcademicYearId = academicYearId.trim();
  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  // 1. Autorisations & User
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Utilisateur introuvable.');
  }
  const user = userSnap.data()!;
  if (!user.isActive) {
    throw new functions.https.HttpsError('permission-denied', 'Compte inactif.');
  }
  const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
  if (!allowedRoles.includes(user.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé.');
  }
  if (user.role !== 'superAdmin' && user.schoolId !== cleanSchoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Accès refusé pour cette école.');
  }

  // 2. Load subjects to verify they belong to the school/catalog
  const subjectsSnaps = await Promise.all(
    subjectIds.map((id: string) => db.collection('subjects').doc(id).get())
  );

  const validSubjects = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snap of subjectsSnaps) {
    if (!snap.exists) {
      throw new functions.https.HttpsError('invalid-argument', `Matière introuvable: ${snap.id}`);
    }
    const subjData = snap.data()!;
    if (subjData.schoolId && subjData.schoolId !== cleanSchoolId) {
       throw new functions.https.HttpsError('permission-denied', 'Tentative accès cross-tenant (matière).');
    }
    validSubjects.set(snap.id, subjData);
  }

  const results = {
    classesProcessed: 0,
    totalSubjectsAdded: 0,
    totalDuplicatesIgnored: 0,
    details: [] as Record<string, unknown>[]
  };

  // Process classes sequentially in transactions to ensure atomicity per class
  for (const classId of classIds) {
    results.classesProcessed++;
    const cleanClassId = classId.trim();
    const classResult = {
      classId: cleanClassId,
      status: 'success',
      added: 0,
      ignored: 0,
      error: null as string | null
    };

    try {
      await db.runTransaction(async (transaction) => {
        // A. Read class
        const classRef = db.collection('classes').doc(cleanClassId);
        const classSnap = await transaction.get(classRef);
        if (!classSnap.exists) {
          throw new Error('CLASS_NOT_FOUND');
        }
        const classData = classSnap.data()!;
        if (classData.schoolId !== cleanSchoolId) {
          throw new Error('CROSS_TENANT_CLASS');
        }

        const classSection = classData.section || classData.type || 'francophone';

        let classCycle = classData.cycle || classData.level || 'primaire';
        if (classCycle === 'nursery') classCycle = 'maternelle';
        if (classCycle === 'primary') classCycle = 'primaire';
        if (classCycle === 'secondary') classCycle = 'secondaire';

        const programId = `${cleanSchoolId}__${cleanAcademicYearId}__${cleanClassId}`;
        const programRef = db.collection('classPrograms').doc(programId);
        const programSnap = await transaction.get(programRef);
        const program = programSnap.exists ? programSnap.data()! : null;

        let draftRevisionId = '';
        let draftRevisionNumber = 1;
        let needsNewDraft = false;

        if (!program) {
          draftRevisionId = `${programId}__v1`;
          draftRevisionNumber = 1;
        } else {
          const hasValidDraft =
            program.hasUnpublishedChanges === true &&
            typeof program.draftRevisionId === 'string' &&
            program.draftRevisionId !== '' &&
            (program.publishedRevisionId === undefined || program.draftRevisionId !== program.publishedRevisionId);

          if (hasValidDraft) {
            draftRevisionId = program.draftRevisionId;
            draftRevisionNumber = program.draftRevisionNumber;
          } else {
            draftRevisionNumber = (program.publishedRevisionNumber || 0) + 1;
            draftRevisionId = `${programId}__v${draftRevisionNumber}`;
            needsNewDraft = true;
          }
        }

        // READ 2: previous published subjects (if cloning is needed)
        let previousSubjectsDocs: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
        if (needsNewDraft && program && program.publishedRevisionId) {
          const previousSubjectsSnap = await transaction.get(
            db.collection('classSubjects')
              .where('programId', '==', programId)
              .where('revisionId', '==', program.publishedRevisionId)
          );
          previousSubjectsDocs = previousSubjectsSnap.docs;
        }

        // READ 3: current draft subjects (for displayOrder and checking duplicates)
        const currentSubjectsSnap = await transaction.get(
           db.collection('classSubjects')
             .where('programId', '==', programId)
             .where('revisionId', '==', draftRevisionId)
        );

        let displayOrderOffset = currentSubjectsSnap.size;
        if (needsNewDraft && program && program.publishedRevisionId) {
           displayOrderOffset = previousSubjectsDocs.length;
        }

        const existingSubjectDocs = new Map<string, FirebaseFirestore.DocumentData>();
        for (const doc of currentSubjectsSnap.docs) {
           const data = doc.data();
           if (data) existingSubjectDocs.set(data.subjectId, data);
        }
        if (needsNewDraft && program && program.publishedRevisionId) {
           for (const doc of previousSubjectsDocs) {
             const data = doc.data();
             if (data) existingSubjectDocs.set(data.subjectId, data);
           }
        }

        // WRITES START HERE
        if (!program) {
          transaction.create(programRef, {
            id: programId,
            schoolId: cleanSchoolId,
            academicYearId: cleanAcademicYearId,
            classId: cleanClassId,
            status: 'draft',
            draftRevisionId,
            draftRevisionNumber,
            hasUnpublishedChanges: true,
            createdBy: uid,
            createdAt: nowIso,
            updatedBy: uid,
            updatedAt: nowIso
          });
        } else if (needsNewDraft) {
          transaction.update(programRef, {
            draftRevisionId,
            draftRevisionNumber,
            hasUnpublishedChanges: true,
            updatedAt: nowIso,
            updatedBy: uid
          });

          for (const doc of previousSubjectsDocs) {
            const prevSubj = doc.data();
            if (!prevSubj) continue;
            const newCsId = `${draftRevisionId}__${prevSubj.subjectId}`;
            const newCsRef = db.collection('classSubjects').doc(newCsId);
            transaction.set(newCsRef, {
              ...prevSubj,
              id: newCsId,
              revisionId: draftRevisionId,
              revisionNumber: draftRevisionNumber,
              updatedAt: nowIso,
              updatedBy: uid
            });
          }
        }

        for (const subjId of subjectIds) {
          const subjData = validSubjects.get(subjId)!;
          if (subjData.section && subjData.section !== 'all' && subjData.section !== classSection) {
             throw new Error(`INCOMPATIBLE_SUBJECT_${subjData.name || subjId}`);
          }
          if (subjData.cycles && subjData.cycles.length > 0) {
             const hasMatch = subjData.cycles.some((c: string) => {
               const mapped = c === 'nursery' ? 'maternelle' : c === 'primary' ? 'primaire' : c === 'secondary' ? 'secondaire' : c;
               return mapped === classCycle;
             });
             if (!hasMatch) throw new Error(`INCOMPATIBLE_SUBJECT_${subjData.name || subjId}`);
          }

          const csId = `${draftRevisionId}__${subjId}`;
          const csRef = db.collection('classSubjects').doc(csId);

          if (existingSubjectDocs.has(subjId)) {
             const existingCs = existingSubjectDocs.get(subjId)!;
             if (!existingCs.isActive) {
                // Was inactive, reactivate it
                transaction.update(csRef, {
                  isActive: true,
                  updatedAt: nowIso,
                  updatedBy: uid
                });
                classResult.added++;
             } else {
                classResult.ignored++;
             }
          } else {
            transaction.set(csRef, {
              id: csId,
              programId,
              schoolId: cleanSchoolId,
              classId: cleanClassId,
              academicYearId: cleanAcademicYearId,
              subjectId: subjId,
              revisionId: draftRevisionId,
              revisionNumber: draftRevisionNumber,
              subjectNameSnapshot: subjData.name,
              subjectCodeSnapshot: subjData.code || null,
              isRequired: true,
              isActive: true,
              displayOrder: displayOrderOffset++,
              createdAt: nowIso,
              createdBy: uid,
              updatedAt: nowIso,
              updatedBy: uid
            });
            classResult.added++;
          }
        }
      });

      results.totalSubjectsAdded += classResult.added;
      results.totalDuplicatesIgnored += classResult.ignored;

    } catch (e: unknown) {
      classResult.status = 'error';
      classResult.error = e instanceof Error ? e.message : String(e);
    }
    results.details.push(classResult);
  }

  return results;
});
