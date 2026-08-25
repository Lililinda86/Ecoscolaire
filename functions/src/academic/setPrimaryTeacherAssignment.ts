import * as functions from 'firebase-functions';

/**
 * Compatibility endpoint kept so staging deploys do not attempt an implicit deletion.
 * The old contract enforced one teacher per class/subject and bypassed the DRAFT lifecycle.
 */
export const setPrimaryTeacherAssignment = functions.https.onCall(async () => {
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Ce point d’entrée a été remplacé par manageTeacherAssignment.',
    { businessCode: 'LEGACY_ENDPOINT_DISABLED' },
  );
});
