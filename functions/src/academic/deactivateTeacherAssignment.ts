import * as functions from 'firebase-functions';

/** Compatibility endpoint; all lifecycle mutations now use manageTeacherAssignment. */
export const deactivateTeacherAssignment = functions.https.onCall(async () => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Ce point d’entrée a été remplacé par manageTeacherAssignment.',
    { businessCode: 'LEGACY_ENDPOINT_DISABLED' },
  );
});
