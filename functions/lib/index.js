"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPaymentCreated = exports.mockConfirmPayment = exports.initiatePayment = exports.dailySubscriptionCheck = exports.verifySaaSPayment = exports.campayWebhook = exports.createSaaSCheckout = void 0;
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
    const { schoolId, studentId, amount, type, installment, provider, phoneNumber, campayRealEnabled } = data;
    if (!schoolId) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId is required');
    }
    if (provider === 'campay') {
        if (!phoneNumber || typeof phoneNumber !== 'string' || !phoneNumber.startsWith('237') || !/^\d+$/.test(phoneNumber)) {
            throw new functions.https.HttpsError('invalid-argument', 'A valid Cameroonian phone number starting with 237 is required for Campay');
        }
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
    let mode = 'mock';
    let mockPaymentUrl = `https://mock.campay.net/pay/${generatedId}`;
    let message = 'Payment initiated securely (Mock Mode)';
    let secretsValidated = false;
    if (provider === 'campay') {
        // Attempt to read secrets
        const secretSnap = await db.collection('schools').doc(schoolId).collection('secrets').doc('payment').get();
        const secrets = secretSnap.data();
        console.log(`[CAMPAY_AUDIT] secret document found = ${secretSnap.exists}`);
        if (secrets) {
            console.log(`[CAMPAY_AUDIT] username present = ${!!secrets.campayAppUsername}`);
            console.log(`[CAMPAY_AUDIT] password present = ${!!secrets.campayAppPassword}`);
            console.log(`[CAMPAY_AUDIT] environment = ${secrets.campayEnvironment || 'not-set'}`);
        }
        if (secrets && secrets.campayAppUsername && secrets.campayAppPassword) {
            secretsValidated = true;
            if (campayRealEnabled === true) {
                mode = 'campay_sandbox';
                // TODO: Prepare the real API call here.
                // For now, since we only do preparatory work without actually breaking or calling real API,
                // we log securely and set the mode.
                console.log(`[CAMPAY] Real integration triggered for ${generatedId}. Calling API... (Placeholder)`);
                message = 'Real Campay integration not fully activated yet.';
                mockPaymentUrl = '';
            }
            else {
                console.log(`[CAMPAY] Secrets found, but campayRealEnabled is false. Falling back to MOCK.`);
            }
        }
        else {
            console.log(`[CAMPAY] No valid secrets found for school ${schoolId}. Falling back to MOCK.`);
        }
    }
    const transactionData = {
        id: generatedId,
        schoolId,
        userId: context.auth.uid,
        studentId: studentId || null,
        amount,
        type,
        installment: installment || null,
        provider,
        phoneNumber: phoneNumber || null,
        reference: `mock_tx_${Date.now()}`,
        status: 'PENDING',
        providerTransactionId: null,
        providerResponse: null,
        failureReason: null,
        idempotencyKey,
        mode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await transactionRef.set(transactionData);
    return {
        success: true,
        transactionId: generatedId,
        status: 'PENDING',
        mockPaymentUrl,
        mode,
        secretsValidated,
        message
    };
});
// ----------------------------------------------------------------------
// 6. mockConfirmPayment
// Callable function to manually confirm a pending payment in MOCK mode.
// ----------------------------------------------------------------------
exports.mockConfirmPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    const { transactionId } = data;
    if (!transactionId) {
        throw new functions.https.HttpsError('invalid-argument', 'transactionId is required');
    }
    const db = admin.firestore();
    // Verify User Role
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
        throw new functions.https.HttpsError('permission-denied', 'Role not authorized');
    }
    return await db.runTransaction(async (transaction) => {
        const txRef = db.collection('transactions').doc(transactionId);
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Transaction not found');
        }
        const txData = txSnap.data();
        // Check school access
        if (user.role !== 'superAdmin' && user.schoolId !== txData?.schoolId) {
            throw new functions.https.HttpsError('permission-denied', 'School access denied');
        }
        if (txData?.status === 'SUCCESS') {
            return {
                success: true,
                status: 'SUCCESS',
                alreadyConfirmed: true,
                paymentCreated: false,
                message: 'Transaction already confirmed'
            };
        }
        if (txData?.status !== 'PENDING') {
            throw new functions.https.HttpsError('failed-precondition', `Transaction cannot be confirmed. Current status: ${txData?.status}`);
        }
        // Update transaction
        transaction.update(txRef, {
            status: 'SUCCESS',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Create payment document
        const paymentRef = db.collection('payments').doc(transactionId);
        const paymentData = {
            id: transactionId,
            schoolId: txData.schoolId,
            studentId: txData.studentId,
            amount: txData.amount,
            type: txData.type,
            method: 'mobile_money',
            installment: txData.installment || null,
            status: 'completed',
            transactionId: transactionId,
            date: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        transaction.set(paymentRef, paymentData);
        return {
            success: true,
            status: 'SUCCESS',
            alreadyConfirmed: false,
            paymentCreated: true,
            message: 'Payment confirmed successfully'
        };
    });
});
// ----------------------------------------------------------------------
// 7. onPaymentCreated (Trigger)
// Generates an automatic PDF receipt for any successful payment.
// ----------------------------------------------------------------------
exports.onPaymentCreated = functions.firestore
    .document('payments/{paymentId}')
    .onCreate(async (snap, context) => {
    const paymentData = snap.data();
    const paymentId = context.params.paymentId;
    if (!paymentData || !paymentData.schoolId) {
        console.log('Skipping receipt generation: Missing payment data or schoolId');
        return null;
    }
    const schoolId = paymentData.schoolId;
    const db = admin.firestore();
    return await db.runTransaction(async (transaction) => {
        // 1. Idempotency Check
        const receiptRef = db.collection('receipts').doc(paymentId);
        const receiptSnap = await transaction.get(receiptRef);
        if (receiptSnap.exists) {
            console.log(`Receipt already exists for payment ${paymentId}`);
            return null;
        }
        // 2. Stable Counter logic
        const counterRef = db.collection('counters').doc(`receipts_${schoolId}`);
        const counterSnap = await transaction.get(counterRef);
        let nextNum = 1;
        if (counterSnap.exists) {
            const data = counterSnap.data();
            if (data && typeof data.lastReceiptNumber === 'number') {
                nextNum = data.lastReceiptNumber + 1;
            }
        }
        // Update counter
        transaction.set(counterRef, { lastReceiptNumber: nextNum }, { merge: true });
        // 3. Formatting
        const year = new Date().getFullYear();
        const formattedNum = String(nextNum).padStart(4, '0');
        const receiptNumber = `REC-${year}-${formattedNum}`;
        // Helper to remove undefined values
        const cleanUndefined = (obj) => {
            return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
        };
        // 4. Create Receipt Document
        const receiptData = cleanUndefined({
            id: paymentId,
            paymentId: paymentId,
            schoolId: schoolId,
            receiptNumber: receiptNumber,
            studentId: paymentData.studentId || null,
            amount: paymentData.amount || 0,
            type: paymentData.type || paymentData.method || 'PAYMENT',
            method: paymentData.method || 'unknown',
            date: paymentData.date || admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        transaction.set(receiptRef, receiptData);
        console.log(`Successfully created receipt ${receiptNumber} for payment ${paymentId}`);
        return receiptNumber;
    });
});
//# sourceMappingURL=index.js.map