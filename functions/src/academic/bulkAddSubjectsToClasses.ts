import * as functions from 'firebase-functions';

/**
 * Compatibility tombstone. Program mutations are intentionally class-scoped,
 * atomic and audited through updateClassProgramDraft.
 */
export const bulkAddSubjectsToClasses = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.', { businessCode: 'UNAUTHENTICATED' });
  }
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Les mutations groupées de programmes sont désactivées. Utilisez le workflow canonique classe par classe.',
    { businessCode: 'BULK_PROGRAM_MUTATION_DISABLED' },
  );
});
