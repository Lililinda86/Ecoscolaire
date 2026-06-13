"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailySubscriptionCheck = exports.verifySaaSPayment = exports.campayWebhook = exports.createSaaSCheckout = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Initialize the Firebase Admin SDK
admin.initializeApp();
// ----------------------------------------------------------------------
// 1. createSaaSCheckout
// Callable function to initiate a payment securely from the frontend.
// ----------------------------------------------------------------------
exports.createSaaSCheckout = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return { status: 'mock_success', message: 'Not implemented yet' };
});
// ----------------------------------------------------------------------
// 2. campayWebhook
// HTTP function to receive status updates from Campay.
// ----------------------------------------------------------------------
exports.campayWebhook = functions.https.onRequest(async (req, res) => {
    res.status(200).send('OK');
});
// ----------------------------------------------------------------------
// 3. verifySaaSPayment
// Callable function to manually poll the payment status if webhook failed.
// ----------------------------------------------------------------------
exports.verifySaaSPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return { status: 'mock_checked', message: 'Not implemented yet' };
});
// ----------------------------------------------------------------------
// 4. dailySubscriptionCheck
// Scheduled function (Cron) running daily at midnight to suspend expired schools.
// ----------------------------------------------------------------------
exports.dailySubscriptionCheck = functions.pubsub.schedule('every day 00:00').onRun(async (context) => {
    const now = new Date();
    console.log(`Cron execution at ${now.toISOString()}`);
    return null;
});
//# sourceMappingURL=index.js.map