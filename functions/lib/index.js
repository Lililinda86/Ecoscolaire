"use strict";
// @ts-nocheck
// Imports are commented out because npm install hangs on this environment for firebase native dependencies
// import * as functions from 'firebase-functions';
// import * as admin from 'firebase-admin';
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailySubscriptionCheck = exports.verifySaaSPayment = exports.campayWebhook = exports.createSaaSCheckout = void 0;
const admin = {
    initializeApp: () => { },
    firestore: () => ({})
};
admin.initializeApp();
const functions = {
    https: {
        onCall: (fn) => fn,
        onRequest: (fn) => fn,
        HttpsError: class HttpsError {
            constructor(code, msg) { }
        }
    },
    pubsub: {
        schedule: () => ({ onRun: (fn) => fn })
    }
};
exports.createSaaSCheckout = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return { status: 'mock_success', message: 'Not implemented yet' };
});
exports.campayWebhook = functions.https.onRequest(async (req, res) => {
    res.status(200).send('OK');
});
exports.verifySaaSPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return { status: 'mock_checked', message: 'Not implemented yet' };
});
exports.dailySubscriptionCheck = functions.pubsub.schedule('every day 00:00').onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    console.log(`Cron execution at ${now.toISOString()}`);
    return null;
});
//# sourceMappingURL=index.js.map