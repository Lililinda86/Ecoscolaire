// @ts-nocheck
// Imports are commented out because npm install hangs on this environment for firebase native dependencies
// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';

const admin = {
  initializeApp: () => {},
  firestore: () => ({})
};
admin.initializeApp();

const functions = {
  https: {
    onCall: (fn: any) => fn,
    onRequest: (fn: any) => fn,
    HttpsError: class HttpsError { constructor(code: string, msg: string) {} }
  },
  pubsub: {
    schedule: () => ({ onRun: (fn: any) => fn })
  }
};

export const createSaaSCheckout = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return { status: 'mock_success', message: 'Not implemented yet' };
});

export const campayWebhook = functions.https.onRequest(async (req: any, res: any) => {
  res.status(200).send('OK');
});

export const verifySaaSPayment = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return { status: 'mock_checked', message: 'Not implemented yet' };
});

export const dailySubscriptionCheck = functions.pubsub.schedule('every day 00:00').onRun(async (context: any) => {
  const db = admin.firestore();
  const now = new Date();
  console.log(`Cron execution at ${now.toISOString()}`);
  return null;
});
