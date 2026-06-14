"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiatePayment = exports.dailySubscriptionCheck = exports.verifySaaSPayment = exports.campayWebhook = exports.createSaaSCheckout = void 0;
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
// ----------------------------------------------------------------------
// 5. initiatePayment
// Callable function to securely initiate Mobile Money payments
// ----------------------------------------------------------------------
exports.initiatePayment = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const { schoolId, studentId, amount, type, installment, provider } = data;
    if (!schoolId) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId is required');
    }
    if (typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Amount must be greater than 0');
    }
    if (provider !== 'campay' && provider !== 'flutterwave') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid provider');
    }
    const db = admin.firestore();
    // 1. Fetch user to check role and school access
    const userSnap = await db.collection('users').doc(context.auth.uid).get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'User not found');
    }
    const user = userSnap.data();
    if (!user || user.isActive !== true) {
        throw new functions.https.HttpsError('permission-denied', 'User is inactive or missing');
    }
    const allowedRoles = ['parent', 'owner', 'director', 'accountant', 'superAdmin'];
    if (!allowedRoles.includes(user.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Role not authorized for payments');
    }
    if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
        throw new functions.https.HttpsError('permission-denied', 'School access denied');
    }
    // 2. If studentId is provided, check if student belongs to the school
    if (studentId) {
        const studentSnap = await db.collection('students').doc(studentId).get();
        if (!studentSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Student not found');
        }
        const student = studentSnap.data();
        if (student?.schoolId !== schoolId) {
            throw new functions.https.HttpsError('permission-denied', 'Student does not belong to this school');
        }
    }
    // 3. Create transaction
    const transactionRef = db.collection('transactions').doc();
    const generatedId = transactionRef.id;
    const idempotencyKey = `idemp_${generatedId}`;
    const transactionData = {
        id: generatedId,
        schoolId,
        userId: context.auth.uid,
        studentId: studentId || null,
        amount,
        type,
        installment: installment || null,
        provider,
        reference: `mock_tx_${Date.now()}`,
        status: 'PENDING',
        providerTransactionId: null,
        providerResponse: null,
        failureReason: null,
        idempotencyKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await transactionRef.set(transactionData);
    return {
        success: true,
        transactionId: generatedId,
        status: 'PENDING',
        mockPaymentUrl: `https://mock.campay.net/pay/${generatedId}`,
        message: 'Payment initiated securely (Mock Mode)'
    };
});
//# sourceMappingURL=index.js.map