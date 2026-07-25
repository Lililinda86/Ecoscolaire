import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DEFAULT_SUBJECT_CATALOG } from './defaultSubjectCatalog';

export function normalizeSubjectText(value: string): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/’/g, "'") // typography apostrophe
    .replace(/–|—/g, '-') // typography dashes
    .replace(/\s+/g, ' ') // multiple spaces
    .replace(/^[^\w\d]+|[^\w\d]+$/g, ''); // periphery punctuation
}

export const seedDefaultSubjectCatalog = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId } = data || {};

  if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'schoolId doit être une chaîne non vide valide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  const cleanSchoolId = schoolId.trim();
  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Read operator profile
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Utilisateur opérateur introuvable.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      const operator = userSnap.data()!;
      if (operator.isActive !== true) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Compte opérateur inactif.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
      if (!allowedRoles.includes(operator.role)) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Rôle non autorisé à gérer le catalogue.',
          { businessCode: 'PERMISSION_DENIED' }
        );
      }
      if (operator.role !== 'superAdmin' && operator.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'L\'opérateur n\'appartient pas à l\'école demandée.',
          { businessCode: 'SCHOOL_MISMATCH' }
        );
      }

      // 2. Read all existing subjects for this school
      const subjectsQuery = db.collection('subjects').where('schoolId', '==', cleanSchoolId);
      const querySnap = await transaction.get(subjectsQuery);
      const existingSubjects = querySnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })) as admin.firestore.DocumentData[];

      // 3. Read ALL candidate deterministic documents (All reads MUST precede all writes)
      const detSnapsMap = new Map<string, admin.firestore.DocumentSnapshot>();
      for (const candidate of DEFAULT_SUBJECT_CATALOG) {
        const detId = `${cleanSchoolId}__subject__${candidate.internalCode.toLowerCase()}`;
        const detRef = db.collection('subjects').doc(detId);
        const detSnap = await transaction.get(detRef);
        detSnapsMap.set(detId, detSnap);
      }

      // 4. Now process candidate subjects (writes only below this point)
      let createdCount = 0;
      let skippedCount = 0;
      let existingByCodeCount = 0;
      let existingByAliasCount = 0;
      const createdSubjectIds: string[] = [];

      for (const candidate of DEFAULT_SUBJECT_CATALOG) {
        const detId = `${cleanSchoolId}__subject__${candidate.internalCode.toLowerCase()}`;
        const detSnap = detSnapsMap.get(detId)!;
        const detRef = db.collection('subjects').doc(detId);

        // Check if deterministic doc exists
        if (detSnap.exists) {
          const existingDet = detSnap.data()!;
          // Verify compatibility
          const normExistingName = normalizeSubjectText(existingDet.name || '');
          const normCandidateName = normalizeSubjectText(candidate.name);
          const hasCommonCycle = candidate.cycles.some((c) => (existingDet.cycles || []).includes(c));
          const sameSection = existingDet.section === candidate.section;

          if (sameSection && hasCommonCycle && (normExistingName === normCandidateName || (candidate.aliases || []).map(normalizeSubjectText).includes(normExistingName))) {
            skippedCount++;
            existingByCodeCount++;
            continue;
          } else {
            throw new functions.https.HttpsError(
              'failed-precondition',
              `Une matière existante utilise l'identifiant ${detId} avec des informations incompatibles.`,
              { businessCode: 'SUBJECT_SEED_CONFLICT' }
            );
          }
        }

        // Check by code or name/alias in all existing subjects
        let isDuplicate = false;
        let duplicateReason: 'code' | 'alias' | null = null;

        for (const existing of existingSubjects) {
          const sameCode = existing.code && existing.code.trim().toLowerCase() === candidate.code.trim().toLowerCase();

          if (sameCode) {
            const sameSection = existing.section === candidate.section;
            const hasCommonCycle = candidate.cycles.some((c) => (existing.cycles || []).includes(c));
            const normExistingName = normalizeSubjectText(existing.name || '');
            const normCandidateName = normalizeSubjectText(candidate.name);
            const isNameOrAliasMatch = normExistingName === normCandidateName || (candidate.aliases || []).map(normalizeSubjectText).includes(normExistingName);

            if (sameSection && hasCommonCycle && isNameOrAliasMatch) {
              isDuplicate = true;
              duplicateReason = 'code';
              break;
            } else {
              throw new functions.https.HttpsError(
                'failed-precondition',
                `Une matière existante utilise le code ${candidate.code} avec des informations incompatibles.`,
                { businessCode: 'SUBJECT_SEED_CONFLICT' }
              );
            }
          }

          const sameSection = existing.section === candidate.section;
          const hasCommonCycle = candidate.cycles.some((c) => (existing.cycles || []).includes(c));
          if (sameSection && hasCommonCycle) {
            const normExistingName = normalizeSubjectText(existing.name || '');
            const normCandidateName = normalizeSubjectText(candidate.name);
            const isNameOrAliasMatch = normExistingName === normCandidateName || (candidate.aliases || []).map(normalizeSubjectText).includes(normExistingName);

            if (isNameOrAliasMatch) {
              isDuplicate = true;
              duplicateReason = 'alias';
              break;
            }
          }
        }

        if (isDuplicate) {
          skippedCount++;
          if (duplicateReason === 'code') {
            existingByCodeCount++;
          } else {
            existingByAliasCount++;
          }
          continue;
        }

        // If not duplicate, create it transactionally
        const newSubject = {
          id: detId,
          schoolId: cleanSchoolId,
          code: candidate.code,
          name: candidate.name,
          section: candidate.section,
          cycles: candidate.cycles,
          category: candidate.category,
          isActive: true,
          createdAt: nowIso,
          createdBy: uid,
          updatedAt: nowIso,
          updatedBy: uid
        };

        transaction.create(detRef, newSubject);
        createdCount++;
        createdSubjectIds.push(detId);
      }

      return {
        seedVersion: 'cameroon-bilingual-v1',
        totalCandidates: DEFAULT_SUBJECT_CATALOG.length,
        createdCount,
        skippedCount,
        existingByCodeCount,
        existingByAliasCount,
        createdSubjectIds
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
