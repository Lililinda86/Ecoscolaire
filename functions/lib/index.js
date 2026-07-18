"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepZombieImportJobs = exports.approveTuitionDiscount = exports.createTuitionDiscount = exports.recordCashPayment = exports.updateStudentFinancialStatus = exports.enforceStudentSaasLimits = exports.onPaymentCreated = exports.mockConfirmPayment = exports.initiatePayment = exports.dailySubscriptionCheck = exports.verifySaaSPayment = exports.campayWebhook = exports.createSaaSCheckout = void 0;
const functions = require("firebase-functions");
__exportStar(require("./importStudents"), exports);
const admin = require("firebase-admin");
const campayService_1 = require("./services/campayService");
const crypto = require("crypto");
const firestore_1 = require("firebase-admin/firestore");
const discountHelpers_1 = require("./utils/discountHelpers");
// Initialize the Firebase Admin SDK
admin.initializeApp();
const getErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string') {
        return error.message;
    }
    return String(error);
};
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
    const payload = req.body || {};
    const external_reference = payload.external_reference || payload.externalReference || payload.merchant_reference;
    const reference = payload.reference || payload.transaction_reference;
    const db = admin.firestore();
    // 1. Journalisation brute de la réception (avant toute validation)
    await db.collection('campay_logs').add({
        requestType: 'webhook_received_raw',
        payload: payload,
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
    // 2. Validation minimale du payload
    if (!external_reference || !reference) {
        await db.collection('campay_logs').add({
            requestType: 'webhook_aborted',
            reason: 'Missing external_reference or reference in payload',
            payload: payload,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        res.status(200).send('OK');
        return;
    }
    const txRef = db.collection('transactions').doc(external_reference);
    try {
        // 3. Lecture initiale (hors transaction Firestore) pour récupérer le schoolId
        const txInitialSnap = await txRef.get();
        if (!txInitialSnap.exists) {
            await db.collection('campay_logs').add({
                requestType: 'webhook_aborted',
                reason: 'Transaction not found locally',
                external_reference: external_reference,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
            res.status(200).send('OK');
            return;
        }
        const txInitialData = txInitialSnap.data();
        if (txInitialData.status !== 'PENDING') {
            await db.collection('campay_logs').add({
                requestType: 'webhook_duplicate',
                reason: 'Transaction is not PENDING',
                external_reference: external_reference,
                currentStatus: txInitialData.status,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
            res.status(200).send('OK');
            return;
        }
        const schoolId = txInitialData.schoolId;
        // 4. Récupération des secrets
        const secretSnap = await db.collection('schools').doc(schoolId).collection('secrets').doc('payment').get();
        const secrets = secretSnap.data();
        if (!secrets || !secrets.campayAppUsername || !secrets.campayAppPassword) {
            throw new Error(`Missing Campay secrets for school ${schoolId}`);
        }
        // 5. Appel de l'API Campay (Server-to-Server)
        const isSandbox = secrets.campayEnvironment !== 'production';
        const campayService = new campayService_1.CampayService(isSandbox);
        const token = await campayService.login(secrets.campayAppUsername, secrets.campayAppPassword);
        const apiTx = await campayService.getTransactionStatus(token, reference);
        // Journalisation de la réponse API brute
        await db.collection('campay_logs').add({
            requestType: 'api_verification_response',
            external_reference: external_reference,
            apiResponse: apiTx,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        // Extraction robuste des champs (defensive validation)
        const apiAmount = apiTx.amount ?? apiTx.amount_paid ?? apiTx.amount_collected;
        const apiStatus = apiTx.status ?? apiTx.transaction_status;
        const apiExtRef = apiTx.external_reference ?? apiTx.externalReference ?? apiTx.merchant_reference;
        if (apiAmount === undefined || apiStatus === undefined || apiExtRef === undefined) {
            throw new Error(`Critical field missing in Campay API response. Payload: ${JSON.stringify(apiTx)}`);
        }
        // 6. Transaction Firestore finale (Mise à jour sécurisée)
        await db.runTransaction(async (transaction) => {
            const txSnap = await transaction.get(txRef);
            const txData = txSnap.data();
            // Re-vérification idempotence stricte
            if (txData.status !== 'PENDING') {
                return;
            }
            // Validation croisée stricte
            const isAmountMatch = Number(apiAmount) === Number(txData.amount);
            const isExtRefMatch = String(apiExtRef) === String(external_reference);
            const upperStatus = String(apiStatus).toUpperCase();
            if (['SUCCESS', 'SUCCESSFUL'].includes(upperStatus) && isAmountMatch && isExtRefMatch) {
                transaction.update(txRef, {
                    status: 'SUCCESS',
                    providerReference: reference || null,
                    providerResponse: apiTx,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
                const paymentRef = db.collection('payments').doc(external_reference);
                transaction.set(paymentRef, {
                    id: external_reference,
                    schoolId: txData.schoolId,
                    studentId: txData.studentId || null,
                    amount: txData.amount,
                    type: txData.type || 'PAYMENT',
                    installment: txData.installment || null,
                    paymentMethod: 'Mobile Money',
                    provider: 'Campay',
                    providerReference: reference || null,
                    transactionId: external_reference,
                    status: 'completed',
                    date: firestore_1.FieldValue.serverTimestamp(),
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                transaction.set(db.collection('campay_logs').doc(), {
                    requestType: 'webhook_success_verified',
                    external_reference: external_reference,
                    status: 'SUCCESS',
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            else if (['FAILED', 'FAILURE', 'ERROR'].includes(upperStatus)) {
                transaction.update(txRef, {
                    status: 'FAILED',
                    failureReason: apiTx,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
                transaction.set(db.collection('campay_logs').doc(), {
                    requestType: 'webhook_failed_verified',
                    external_reference: external_reference,
                    status: 'FAILED',
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            else {
                transaction.set(db.collection('campay_logs').doc(), {
                    requestType: 'webhook_verification_mismatch',
                    external_reference: external_reference,
                    reason: 'Mismatch in amount, reference, or unknown status',
                    apiTx: apiTx,
                    localTxAmount: txData.amount,
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
        });
    }
    catch (error) {
        await db.collection('campay_logs').add({
            requestType: 'webhook_processing_error',
            external_reference: external_reference,
            error: getErrorMessage(error),
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
    }
    // 7. Toujours renvoyer 200 OK à Campay
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
exports.dailySubscriptionCheck = functions.pubsub.schedule('every day 00:00').onRun(async () => {
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
    const { schoolId, studentId, amount, type, installment, provider, phoneNumber } = data;
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
        if (secrets && secrets.campayAppUsername && secrets.campayAppPassword) {
            secretsValidated = true;
            const isSandbox = secrets.campayEnvironment !== 'production';
            if (isSandbox) {
                mode = 'campay_sandbox';
            }
            else {
                mode = 'campay_production';
            }
            const campayService = new campayService_1.CampayService(isSandbox);
            let token = '';
            try {
                // 1. Login
                token = await campayService.login(secrets.campayAppUsername, secrets.campayAppPassword);
                // 2. Request To Pay
                const description = `Paiement pour ${studentId || 'élève inconnu'}`;
                const response = await campayService.requestToPay(token, amount, phoneNumber, description, generatedId // transactionId as externalReference
                );
                message = 'Payment initiated via Campay Sandbox.';
                mockPaymentUrl = ''; // No mock URL in real mode
                // Log securely
                await db.collection('campay_logs').add({
                    schoolId,
                    transactionId: generatedId,
                    requestType: 'request_to_pay',
                    status: 'SUCCESS',
                    sanitizedRequest: {
                        amount: amount.toString(),
                        from: phoneNumber,
                        description,
                        external_reference: generatedId
                    },
                    sanitizedResponse: response,
                    errorMessage: null,
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            catch (error) {
                // Log error securely
                await db.collection('campay_logs').add({
                    schoolId,
                    transactionId: generatedId,
                    requestType: 'request_to_pay',
                    status: 'FAILED',
                    sanitizedRequest: {
                        amount: amount.toString(),
                        from: phoneNumber,
                        external_reference: generatedId
                    },
                    sanitizedResponse: null,
                    errorMessage: getErrorMessage(error),
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                throw new functions.https.HttpsError('internal', `Campay initiation failed: ${getErrorMessage(error)}`);
            }
            // Removed the else block that was falling back to mock when not sandbox
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
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
    if (process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.NODE_ENV !== 'test') {
        throw new functions.https.HttpsError('failed-precondition', 'mockConfirmPayment is disabled outside test environment');
    }
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
            updatedAt: firestore_1.FieldValue.serverTimestamp()
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
            date: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp()
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
            return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
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
            date: paymentData.date || firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
        transaction.set(receiptRef, receiptData);
        console.log(`Successfully created receipt ${receiptNumber} for payment ${paymentId}`);
        return receiptNumber;
    });
});
// ----------------------------------------------------------------------
// 8. enforceStudentSaasLimits (Trigger)
// Maintains the studentsCount on schools and deletes excess students
// ----------------------------------------------------------------------
exports.enforceStudentSaasLimits = functions.firestore
    .document('students/{studentId}')
    .onWrite(async (change, context) => {
    const db = admin.firestore();
    const studentId = context.params.studentId;
    const isCreate = !change.before.exists && change.after.exists;
    const isDelete = change.before.exists && !change.after.exists;
    if (!isCreate && !isDelete) {
        return null;
    }
    const schoolId = isCreate ? change.after.data()?.schoolId : change.before.data()?.schoolId;
    if (!schoolId)
        return null;
    const schoolRef = db.collection('schools').doc(schoolId);
    return await db.runTransaction(async (transaction) => {
        const schoolSnap = await transaction.get(schoolRef);
        if (!schoolSnap.exists) {
            console.error(`School ${schoolId} not found for student ${studentId}`);
            return null;
        }
        const school = schoolSnap.data();
        let currentCount = school?.studentsCount || 0;
        if (isDelete) {
            currentCount = Math.max(0, currentCount - 1);
            transaction.update(schoolRef, { studentsCount: currentCount });
            return null;
        }
        if (isCreate) {
            currentCount += 1;
            const isInternalSchool = school?.isInternalSchool === true;
            const plan = school?.subscriptionPlan || 'starter';
            let limit = 200;
            if (plan === 'premium' || isInternalSchool)
                limit = Infinity;
            else if (plan === 'pilot' || plan === 'standard')
                limit = 1000;
            else
                limit = 200;
            if (currentCount > limit) {
                console.warn(`[SaaS Limits] School ${schoolId} exceeded limit of ${limit}. Deleting student ${studentId}.`);
                transaction.delete(change.after.ref);
                return null;
            }
            else {
                transaction.update(schoolRef, { studentsCount: currentCount });
                return null;
            }
        }
        return null;
    });
});
// ----------------------------------------------------------------------
// 9. updateStudentFinancialStatus (Trigger)
// Recalculates student tuition/registration/transport balances atomically
// whenever a payment document is created, updated, or deleted.
// ----------------------------------------------------------------------
exports.updateStudentFinancialStatus = functions.firestore
    .document('payments/{paymentId}')
    .onWrite(async (change) => {
    const paymentData = change.after.exists ? change.after.data() : change.before.data();
    if (!paymentData || !paymentData.studentId)
        return null;
    if (!change.before.exists && paymentData.byRecordCashPayment) {
        console.log('Skipping legacy financial status recalculation for atomic payment creation');
        return null;
    }
    const studentId = paymentData.studentId;
    const db = admin.firestore();
    return await db.runTransaction(async (transaction) => {
        const paymentsSnap = await transaction.get(db.collection('payments').where('studentId', '==', studentId));
        const paymentsList = paymentsSnap.docs.map(doc => doc.data());
        const studentRef = db.collection('students').doc(studentId);
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists)
            return null;
        const student = studentSnap.data();
        const registrationFeePaid = paymentsList
            .filter(p => p.type === 'registration_fee' || p.type === 'registration')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        const tuitionPaid = paymentsList
            .filter(p => p.type === 'tuition')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        const transportPaid = paymentsList
            .filter(p => p.type === 'transport')
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        const registrationFeeExpected = student.registrationFeeExpected ?? 15000;
        let registrationFeeStatus = 'unpaid';
        if (registrationFeePaid >= registrationFeeExpected)
            registrationFeeStatus = 'paid';
        else if (registrationFeePaid > 0)
            registrationFeeStatus = 'partial';
        const fallbackExpected = (student.feeT1 ?? 0) + (student.feeT2 ?? 0) + (student.feeT3 ?? 0);
        const tuitionExpected = student.tuitionExpected ?? fallbackExpected;
        let tuitionStatus = 'unpaid';
        if (tuitionExpected > 0 && tuitionPaid >= tuitionExpected)
            tuitionStatus = 'paid';
        else if (tuitionPaid > 0)
            tuitionStatus = 'partial';
        transaction.update(studentRef, {
            registrationFeePaid,
            registrationFeeStatus,
            tuitionPaid,
            tuitionStatus,
            transportPaid
        });
        console.log(`[Finance Trigger] Recalculated balance for student ${studentId}: Reg=${registrationFeePaid}, Tuition=${tuitionPaid}, Transport=${transportPaid}`);
        return null;
    });
});
// ----------------------------------------------------------------------
// 9. recordCashPayment
// Atomically records a cash payment, updates student balances, increments counters,
// and creates an immutable receipt in one Firestore transaction.
// ----------------------------------------------------------------------
// Helper to validate Firestore Document IDs strictly
const isValidFirestoreId = (id) => {
    if (typeof id !== 'string')
        return false;
    const trimmed = id.trim();
    if (trimmed.length === 0 || trimmed.length > 512)
        return false;
    if (trimmed.includes('/'))
        return false;
    if (id !== trimmed)
        return false;
    if (trimmed === '.' || trimmed === '..')
        return false;
    if (Buffer.byteLength(trimmed, 'utf8') > 1500)
        return false;
    return true;
};
// ----------------------------------------------------------------------
// 9. recordCashPayment
// Atomically records a cash payment, updates student balances, increments counters,
// and creates an immutable receipt in one Firestore transaction.
// ----------------------------------------------------------------------
exports.recordCashPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const uid = context.auth.uid;
    const { requestId, schoolId, studentId, amount, type, installment, description, academicYear } = data || {};
    // Input Validation
    if (!requestId || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
        throw new functions.https.HttpsError('invalid-argument', 'requestId must be a string between 16 and 128 characters containing only alphanumeric, underscore, or dash.');
    }
    if (!isValidFirestoreId(schoolId)) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId is invalid.');
    }
    if (!isValidFirestoreId(studentId)) {
        throw new functions.https.HttpsError('invalid-argument', 'studentId is invalid.');
    }
    if (!academicYear || typeof academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(academicYear)) {
        throw new functions.https.HttpsError('invalid-argument', 'academicYear must be in YYYY-YYYY format.');
    }
    const [y1, y2] = academicYear.split('-').map(Number);
    if (y2 !== y1 + 1) {
        throw new functions.https.HttpsError('invalid-argument', 'academicYear second year must be first year + 1.');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'amount must be a positive safe integer.');
    }
    const allowedTypes = ['tuition', 'registration_fee'];
    if (!allowedTypes.includes(type)) {
        throw new functions.https.HttpsError('invalid-argument', 'type must be tuition or registration_fee.');
    }
    if (type === 'tuition') {
        const allowedInstallments = ['T1', 'T2', 'T3'];
        if (!installment || !allowedInstallments.includes(installment)) {
            throw new functions.https.HttpsError('invalid-argument', 'installment must be T1, T2, or T3 for tuition.');
        }
    }
    else if (type === 'registration_fee') {
        if (installment) {
            throw new functions.https.HttpsError('invalid-argument', 'installment must not be provided for registration fee.');
        }
    }
    // Description Validation
    let cleanDescription = null;
    if (description !== undefined && description !== null) {
        if (typeof description !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'Description must be a string.');
        }
        const trimmed = description.trim();
        if (trimmed.length > 0) {
            if (trimmed.length > 500) {
                throw new functions.https.HttpsError('invalid-argument', 'Description exceeds maximum length of 500 characters.');
            }
            cleanDescription = trimmed;
        }
    }
    const db = admin.firestore();
    // Operator Authorization check
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Operator user not found.');
    }
    const user = userSnap.data();
    if (!user || user.isActive !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Operator is inactive.');
    }
    const allowedRoles = ['owner', 'director', 'accountant', 'superAdmin'];
    if (!allowedRoles.includes(user.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Operator role not authorized.');
    }
    if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
        throw new functions.https.HttpsError('permission-denied', 'Operator does not belong to this school.');
    }
    // Collision prevention: derive paymentId deterministically using sha256 JSON array serialization
    const paymentIdentity = JSON.stringify([schoolId, requestId]);
    const paymentHash = crypto
        .createHash('sha256')
        .update(paymentIdentity, 'utf8')
        .digest('hex');
    const paymentId = `pay_${paymentHash}`;
    return await db.runTransaction(async (transaction) => {
        // 1. Idempotency Check
        const paymentRef = db.collection('payments').doc(paymentId);
        const paymentSnap = await transaction.get(paymentRef);
        if (paymentSnap.exists) {
            const existing = paymentSnap.data();
            const hasStoredPaymentId = Object.prototype.hasOwnProperty.call(existing, 'id');
            if (hasStoredPaymentId &&
                (typeof existing.id !== 'string' ||
                    existing.id !== paymentId)) {
                throw new functions.https.HttpsError('failed-precondition', 'Stored Payment ID is inconsistent.');
            }
            const reqInstallment = installment ?? null;
            const payInstallment = existing.installment ?? null;
            if (existing.schoolId !== schoolId ||
                existing.studentId !== studentId ||
                existing.academicYear !== academicYear ||
                existing.type !== type ||
                payInstallment !== reqInstallment ||
                existing.amount !== amount ||
                existing.method !== 'cash' ||
                existing.requestId !== requestId ||
                (existing.description ?? null) !== (cleanDescription ?? null)) {
                throw new functions.https.HttpsError('already-exists', 'A different payment already exists with this requestId.');
            }
            const receiptRef = db.collection('receipts').doc(paymentId);
            const receiptSnap = await transaction.get(receiptRef);
            if (!receiptSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Payment exists but corresponding receipt is missing.');
            }
            const receiptData = receiptSnap.data();
            // 3. CHAMPS COMMUNS OBLIGATOIRES BETWEEN PAYMENT AND RECEIPT
            if ((receiptData.id !== undefined && receiptData.id !== paymentId) ||
                receiptData.paymentId !== paymentId ||
                receiptData.schoolId !== schoolId ||
                receiptData.studentId !== studentId ||
                receiptData.academicYear !== academicYear ||
                receiptData.type !== type ||
                (receiptData.installment ?? null) !== payInstallment ||
                receiptData.amount !== amount ||
                receiptData.method !== 'cash' ||
                receiptData.paymentMethod !== 'cash') {
                throw new functions.https.HttpsError('failed-precondition', 'Receipt and Payment records are inconsistent.');
            }
            // 4. VALIDATION FINANCIÈRE DU RECEIPT
            const expectedAmountVal = receiptData.expectedAmount;
            const previousPaidVal = receiptData.previousPaid;
            const newPaidVal = receiptData.newPaid;
            const remainingBalanceVal = receiptData.remainingBalance;
            if (typeof expectedAmountVal !== 'number' || !Number.isFinite(expectedAmountVal) || !Number.isSafeInteger(expectedAmountVal) || expectedAmountVal <= 0 ||
                typeof previousPaidVal !== 'number' || !Number.isFinite(previousPaidVal) || !Number.isSafeInteger(previousPaidVal) || previousPaidVal < 0 ||
                typeof newPaidVal !== 'number' || !Number.isFinite(newPaidVal) || !Number.isSafeInteger(newPaidVal) || newPaidVal <= 0 ||
                typeof remainingBalanceVal !== 'number' || !Number.isFinite(remainingBalanceVal) || !Number.isSafeInteger(remainingBalanceVal) || remainingBalanceVal < 0 ||
                newPaidVal !== previousPaidVal + amount ||
                remainingBalanceVal !== expectedAmountVal - newPaidVal ||
                newPaidVal > expectedAmountVal) {
                throw new functions.https.HttpsError('failed-precondition', 'Receipt financial values are inconsistent or invalid.');
            }
            // 5. PRÉSENCE STRICTE DES SNAPSHOTS DE RÉDUCTION
            const keys = ['discountId', 'discountCode', 'grossExpectedAmount', 'discountAmount', 'netExpectedAmount'];
            const payHasMap = keys.map(k => Object.prototype.hasOwnProperty.call(existing, k));
            const recHasMap = keys.map(k => Object.prototype.hasOwnProperty.call(receiptData, k));
            const payCount = payHasMap.filter(Boolean).length;
            const recCount = recHasMap.filter(Boolean).length;
            if (payCount !== 0 && payCount !== 5) {
                throw new functions.https.HttpsError('failed-precondition', 'Payment has a partial set of reduction fields.');
            }
            if (recCount !== 0 && recCount !== 5) {
                throw new functions.https.HttpsError('failed-precondition', 'Receipt has a partial set of reduction fields.');
            }
            const payIsReduced = payCount === 5;
            const recIsReduced = recCount === 5;
            if (payIsReduced !== recIsReduced) {
                throw new functions.https.HttpsError('failed-precondition', 'Payment and Receipt reduction states do not match.');
            }
            if (payIsReduced) {
                for (const k of keys) {
                    const val = existing[k];
                    if (val === null || val === undefined) {
                        throw new functions.https.HttpsError('failed-precondition', `Field ${k} is null or undefined in Payment.`);
                    }
                    const recVal = receiptData[k];
                    if (recVal === null || recVal === undefined) {
                        throw new functions.https.HttpsError('failed-precondition', `Field ${k} is null or undefined in Receipt.`);
                    }
                    if (k === 'discountId' || k === 'discountCode') {
                        if (typeof val !== 'string' || typeof recVal !== 'string') {
                            throw new functions.https.HttpsError('failed-precondition', `Field ${k} must be a string.`);
                        }
                    }
                    else {
                        if (typeof val !== 'number' || typeof recVal !== 'number') {
                            throw new functions.https.HttpsError('failed-precondition', `Field ${k} must be a number.`);
                        }
                    }
                }
            }
            // 6. REPLAY RÉDUIT STRICT
            if (payIsReduced) {
                const discountIdVal = existing.discountId;
                const discountCodeVal = existing.discountCode;
                const grossExpectedAmountVal = existing.grossExpectedAmount;
                const discountAmountVal = existing.discountAmount;
                const netExpectedAmountVal = existing.netExpectedAmount;
                if (discountIdVal.trim() !== discountIdVal || discountIdVal.length === 0 ||
                    typeof discountCodeVal !== 'string' || discountCodeVal.trim() === '' || discountCodeVal !== discountCodeVal.trim() ||
                    typeof grossExpectedAmountVal !== 'number' || !Number.isSafeInteger(grossExpectedAmountVal) || grossExpectedAmountVal <= 0 ||
                    typeof discountAmountVal !== 'number' || !Number.isSafeInteger(discountAmountVal) || discountAmountVal <= 0 ||
                    typeof netExpectedAmountVal !== 'number' || !Number.isSafeInteger(netExpectedAmountVal) || netExpectedAmountVal <= 0 ||
                    discountAmountVal >= grossExpectedAmountVal) {
                    throw new functions.https.HttpsError('failed-precondition', 'Reduction snapshot values are invalid.');
                }
                try {
                    const calc = (0, discountHelpers_1.calculateTuitionDiscountAmounts)(grossExpectedAmountVal, discountAmountVal);
                    if (calc.netExpectedAmount !== netExpectedAmountVal) {
                        throw new Error();
                    }
                }
                catch {
                    throw new functions.https.HttpsError('failed-precondition', 'calculateTuitionDiscountAmounts mismatch.');
                }
                if (expectedAmountVal !== netExpectedAmountVal) {
                    throw new functions.https.HttpsError('failed-precondition', 'expectedAmount must equal netExpectedAmount for reduced replay.');
                }
                for (const k of keys) {
                    if (existing[k] !== receiptData[k]) {
                        throw new functions.https.HttpsError('failed-precondition', `Reduction snapshot field ${k} mismatch between Payment and Receipt.`);
                    }
                }
                const financeKeys = ['expectedAmount', 'previousPaid', 'newPaid', 'remainingBalance'];
                for (const fk of financeKeys) {
                    if (!Object.prototype.hasOwnProperty.call(existing, fk)) {
                        throw new functions.https.HttpsError('failed-precondition', `Financial field ${fk} must exist in Payment for reduced replay.`);
                    }
                    if (existing[fk] !== receiptData[fk]) {
                        throw new functions.https.HttpsError('failed-precondition', `Financial field ${fk} mismatch between Payment and Receipt.`);
                    }
                }
                return {
                    paymentId,
                    receiptId: paymentId,
                    receiptNumber: receiptData.receiptNumber || null,
                    amount,
                    previousPaid: previousPaidVal,
                    newPaid: newPaidVal,
                    remainingBalance: remainingBalanceVal,
                    idempotentReplay: true
                };
            }
            else {
                // 7. REPLAY NON RÉDUIT
                const financeKeys = ['expectedAmount', 'previousPaid', 'newPaid', 'remainingBalance'];
                for (const fk of financeKeys) {
                    if (Object.prototype.hasOwnProperty.call(existing, fk)) {
                        if (existing[fk] !== receiptData[fk]) {
                            throw new functions.https.HttpsError('failed-precondition', `Financial field ${fk} mismatch between Payment and Receipt.`);
                        }
                    }
                }
                return {
                    paymentId,
                    receiptId: paymentId,
                    receiptNumber: receiptData.receiptNumber || null,
                    amount,
                    previousPaid: previousPaidVal,
                    newPaid: newPaidVal,
                    remainingBalance: remainingBalanceVal,
                    idempotentReplay: true
                };
            }
        }
        // 2. Fetch School Context
        const schoolRef = db.collection('schools').doc(schoolId);
        const schoolSnap = await transaction.get(schoolRef);
        if (!schoolSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'School not found.');
        }
        const school = schoolSnap.data();
        if (!school.academicYear || typeof school.academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(school.academicYear)) {
            throw new functions.https.HttpsError('failed-precondition', 'Active academic year is not defined or invalid for this school.');
        }
        if (academicYear !== school.academicYear) {
            throw new functions.https.HttpsError('failed-precondition', 'The requested academic year is not the active academic year of the school.');
        }
        // 3. Fetch Student Context
        const studentRef = db.collection('students').doc(studentId);
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Student not found.');
        }
        const student = studentSnap.data();
        if (student.schoolId !== schoolId) {
            throw new functions.https.HttpsError('permission-denied', 'Student does not belong to this school.');
        }
        // 4. Fetch Class Context
        const classId = student.classId || '';
        let className = '';
        let cycle = '';
        if (classId) {
            const classRef = db.collection('classes').doc(classId);
            const classSnap = await transaction.get(classRef);
            if (!classSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Student class not found.');
            }
            const classData = classSnap.data();
            if (classData.schoolId !== schoolId) {
                throw new functions.https.HttpsError('failed-precondition', 'Class schoolId mismatch.');
            }
            className = classData.name || '';
            const rawCycle = classData.level || classData.cycle || '';
            const allowedCycles = ['nursery', 'primary', 'secondary'];
            if (allowedCycles.includes(rawCycle)) {
                cycle = rawCycle;
            }
        }
        // 5. Fetch Tuition Discount Slot if applicable
        let hasValidSlot = false;
        let slotId = '';
        let slotSnap = null;
        let discountSnap = null;
        if (type === 'tuition' && (installment === 'T1' || installment === 'T2' || installment === 'T3')) {
            slotId = (0, discountHelpers_1.makeTuitionDiscountSlotId)({ schoolId, studentId, academicYear, installment });
            const slotRef = db.collection('tuitionDiscountSlots').doc(slotId);
            slotSnap = await transaction.get(slotRef);
            if (slotSnap.exists) {
                const slotData = slotSnap.data();
                if ((slotData.id !== undefined && slotData.id !== slotId) ||
                    slotData.schoolId !== schoolId ||
                    slotData.studentId !== studentId ||
                    slotData.academicYear !== academicYear ||
                    slotData.installment !== installment ||
                    typeof slotData.discountId !== 'string' ||
                    slotData.discountId.trim() === '' ||
                    slotData.discountId !== slotData.discountId.trim()) {
                    throw new functions.https.HttpsError('failed-precondition', 'Slot data is inconsistent or invalid.');
                }
                const discountRef = db.collection('tuitionDiscounts').doc(slotData.discountId);
                discountSnap = await transaction.get(discountRef);
                if (!discountSnap.exists) {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount document not found.');
                }
                const discountData = discountSnap.data();
                const hasStoredDiscountId = Object.prototype.hasOwnProperty.call(discountData, 'id');
                if (hasStoredDiscountId) {
                    if (typeof discountData.id !== 'string' || discountData.id !== slotData.discountId) {
                        throw new functions.https.HttpsError('failed-precondition', 'Discount ID is invalid.');
                    }
                }
                if (discountData.schoolId !== schoolId ||
                    discountData.studentId !== studentId ||
                    discountData.academicYear !== academicYear ||
                    discountData.installment !== installment ||
                    typeof discountData.discountCode !== 'string' ||
                    discountData.discountCode.trim() === '' ||
                    typeof discountData.reason !== 'string' ||
                    discountData.reason.trim() === '' ||
                    typeof discountData.grossExpectedAmount !== 'number' ||
                    !Number.isFinite(discountData.grossExpectedAmount) ||
                    !Number.isSafeInteger(discountData.grossExpectedAmount) ||
                    discountData.grossExpectedAmount <= 0 ||
                    typeof discountData.discountAmount !== 'number' ||
                    !Number.isFinite(discountData.discountAmount) ||
                    !Number.isSafeInteger(discountData.discountAmount) ||
                    discountData.discountAmount <= 0 ||
                    typeof discountData.netExpectedAmount !== 'number' ||
                    !Number.isFinite(discountData.netExpectedAmount) ||
                    !Number.isSafeInteger(discountData.netExpectedAmount) ||
                    discountData.netExpectedAmount <= 0 ||
                    discountData.discountAmount >= discountData.grossExpectedAmount) {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount parameters are invalid.');
                }
                try {
                    const calc = (0, discountHelpers_1.calculateTuitionDiscountAmounts)(discountData.grossExpectedAmount, discountData.discountAmount);
                    if (calc.netExpectedAmount !== discountData.netExpectedAmount) {
                        throw new Error();
                    }
                }
                catch {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount amounts calculation mismatch.');
                }
                const allowedStatuses = ['approved', 'applied'];
                if (!allowedStatuses.includes(discountData.status)) {
                    throw new functions.https.HttpsError('failed-precondition', `New payments are not allowed for status ${discountData.status}.`);
                }
                hasValidSlot = true;
            }
        }
        // 6. Fetch previous payments
        let paymentsSnap;
        if (type === 'registration_fee') {
            paymentsSnap = await transaction.get(db.collection('payments').where('studentId', '==', studentId).where('type', '==', 'registration_fee'));
        }
        else {
            paymentsSnap = await transaction.get(db.collection('payments').where('studentId', '==', studentId).where('type', '==', 'tuition'));
        }
        // 7. Fetch Receipts Counter
        const counterRef = db.collection('counters').doc(`receipts_${schoolId}`);
        const counterSnap = await transaction.get(counterRef);
        // Calculations Phase
        let previousPaid = 0;
        let expectedAmount = 0;
        const globalFees = school.globalFees || { feeT1: 0, feeT2: 0, feeT3: 0 };
        const paymentsList = paymentsSnap.docs.map(doc => doc.data());
        if (hasValidSlot) {
            const discountData = discountSnap.data();
            expectedAmount = discountData.netExpectedAmount;
            for (const p of paymentsList) {
                if (p.schoolId === schoolId && !p.academicYear) {
                    throw new functions.https.HttpsError('failed-precondition', 'Ambiguous legacy payments found without academicYear. Recording blocked.');
                }
            }
            const filteredPayments = paymentsList.filter(p => p.schoolId === schoolId && p.academicYear === academicYear && p.installment === installment && p.type === 'tuition');
            for (const p of filteredPayments) {
                if (typeof p.amount !== 'number' ||
                    !Number.isFinite(p.amount) ||
                    !Number.isSafeInteger(p.amount) ||
                    p.amount <= 0 ||
                    p.discountId !== slotSnap.data().discountId ||
                    p.discountCode !== discountData.discountCode ||
                    p.grossExpectedAmount !== discountData.grossExpectedAmount ||
                    p.discountAmount !== discountData.discountAmount ||
                    p.netExpectedAmount !== discountData.netExpectedAmount ||
                    p.expectedAmount !== discountData.netExpectedAmount) {
                    throw new functions.https.HttpsError('failed-precondition', 'Historical payments are inconsistent or not reduced.');
                }
                if (!Number.isSafeInteger(previousPaid + p.amount)) {
                    throw new functions.https.HttpsError('failed-precondition', 'Safe integer overflow while calculating previousPaid.');
                }
                previousPaid += p.amount;
            }
            const remainingBalance = expectedAmount - previousPaid;
            if (amount > remainingBalance) {
                throw new functions.https.HttpsError('failed-precondition', `Payment amount (${amount}) exceeds remaining balance (${remainingBalance}).`);
            }
            if (discountData.status === 'approved') {
                if (previousPaid !== 0) {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount is approved but previousPaid is not zero.');
                }
            }
            else if (discountData.status === 'applied') {
                if (previousPaid <= 0 || previousPaid >= expectedAmount) {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount is applied but previousPaid is invalid.');
                }
                if (typeof discountData.firstPaymentId !== 'string' || discountData.firstPaymentId.trim() === '') {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount is applied but firstPaymentId is missing.');
                }
                if (!discountData.firstAppliedAt) {
                    throw new functions.https.HttpsError('failed-precondition', 'Discount is applied but firstAppliedAt is missing.');
                }
            }
            const newPaid = previousPaid + amount;
            const newRemaining = expectedAmount - newPaid;
            if (!Number.isSafeInteger(previousPaid) || previousPaid < 0 || previousPaid > expectedAmount ||
                !Number.isSafeInteger(newPaid) || newPaid <= 0 || newPaid > expectedAmount ||
                !Number.isSafeInteger(newRemaining) || newRemaining < 0) {
                throw new functions.https.HttpsError('failed-precondition', 'Financial calculations resulted in unsafe integers or values out of bounds.');
            }
            let lastReceiptNumber = 0;
            if (counterSnap.exists) {
                lastReceiptNumber = counterSnap.data()?.lastReceiptNumber || 0;
            }
            const nextReceiptNumber = lastReceiptNumber + 1;
            transaction.set(counterRef, { lastReceiptNumber: nextReceiptNumber }, { merge: true });
            const currentYear = new Date().getFullYear();
            const formattedNum = String(nextReceiptNumber).padStart(4, '0');
            const receiptNumber = `REC-${currentYear}-${formattedNum}`;
            const paymentData = {
                id: paymentId,
                schoolId,
                studentId,
                amount,
                type,
                installment: installment || null,
                date: new Date().toISOString().split('T')[0],
                description: cleanDescription,
                method: 'cash',
                academicYear,
                createdBy: uid,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                requestId,
                byRecordCashPayment: true,
                expectedAmount,
                previousPaid,
                newPaid,
                remainingBalance: newRemaining,
                discountId: slotSnap.data().discountId,
                discountCode: discountData.discountCode,
                grossExpectedAmount: discountData.grossExpectedAmount,
                discountAmount: discountData.discountAmount,
                netExpectedAmount: discountData.netExpectedAmount
            };
            const cleanUndefined = (obj) => {
                return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
            };
            transaction.set(paymentRef, cleanUndefined(paymentData));
            const studentUpdate = {};
            for (const tp of paymentsList) {
                if (tp.schoolId === schoolId && !tp.academicYear) {
                    throw new functions.https.HttpsError('failed-precondition', 'Ambiguous legacy tuition payments found without academicYear.');
                }
            }
            const totalTuitionPaidForYear = paymentsList
                .filter(p => p.schoolId === schoolId && p.academicYear === academicYear)
                .reduce((sum, p) => sum + (p.amount || 0), 0) + amount;
            const fallbackExpected = (student.feeT1 ?? globalFees.feeT1 ?? 0) + (student.feeT2 ?? globalFees.feeT2 ?? 0) + (student.feeT3 ?? globalFees.feeT3 ?? 0);
            const totalTuitionExpectedForYear = student.tuitionExpected || fallbackExpected;
            studentUpdate.tuitionPaid = totalTuitionPaidForYear;
            studentUpdate.tuitionStatus = totalTuitionPaidForYear >= totalTuitionExpectedForYear ? 'paid' : (totalTuitionPaidForYear > 0 ? 'partial' : 'unpaid');
            transaction.update(studentRef, studentUpdate);
            const discountRef = db.collection('tuitionDiscounts').doc(slotSnap.data().discountId);
            const isFinalPayment = newRemaining === 0;
            if (discountData.status === 'approved') {
                if (isFinalPayment) {
                    transaction.update(discountRef, {
                        status: 'settled',
                        firstAppliedAt: firestore_1.FieldValue.serverTimestamp(),
                        firstPaymentId: paymentId,
                        settledAt: firestore_1.FieldValue.serverTimestamp(),
                        settlementPaymentId: paymentId
                    });
                }
                else {
                    transaction.update(discountRef, {
                        status: 'applied',
                        firstAppliedAt: firestore_1.FieldValue.serverTimestamp(),
                        firstPaymentId: paymentId
                    });
                }
            }
            else if (discountData.status === 'applied') {
                if (isFinalPayment) {
                    transaction.update(discountRef, {
                        status: 'settled',
                        settledAt: firestore_1.FieldValue.serverTimestamp(),
                        settlementPaymentId: paymentId
                    });
                }
            }
            let schoolName = school.name || 'EcoScolaire';
            if (cycle && school.cycleNames && school.cycleNames[cycle]) {
                schoolName = school.cycleNames[cycle];
            }
            const receiptData = {
                id: paymentId,
                paymentId,
                schoolId,
                receiptNumber,
                studentId,
                studentName: student.name || '',
                studentRegistrationNumber: student.matricule || '',
                classId,
                className,
                academicYear,
                schoolName,
                type,
                method: 'cash',
                date: paymentData.date,
                paymentType: type,
                paymentMethod: 'cash',
                paymentDate: paymentData.date,
                amount,
                expectedAmount,
                previousPaid,
                newPaid,
                remainingBalance: newRemaining,
                collectedByUserId: uid,
                collectedByName: user.name || user.email || '',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                installment,
                discountId: slotSnap.data().discountId,
                discountCode: discountData.discountCode,
                grossExpectedAmount: discountData.grossExpectedAmount,
                discountAmount: discountData.discountAmount,
                netExpectedAmount: discountData.netExpectedAmount
            };
            const receiptRef = db.collection('receipts').doc(paymentId);
            transaction.set(receiptRef, cleanUndefined(receiptData));
            return {
                paymentId,
                receiptId: paymentId,
                receiptNumber,
                amount,
                previousPaid,
                newPaid,
                remainingBalance: newRemaining,
                idempotentReplay: false
            };
        }
        else {
            if (type === 'registration_fee') {
                expectedAmount = student.registrationFeeExpected;
                if (!expectedAmount || expectedAmount <= 0) {
                    throw new functions.https.HttpsError('failed-precondition', 'Registration fee expected amount is not defined for this student.');
                }
                for (const p of paymentsList) {
                    if (p.schoolId === schoolId && !p.academicYear) {
                        throw new functions.https.HttpsError('failed-precondition', 'Ambiguous legacy payments found without academicYear. Recording blocked.');
                    }
                }
                previousPaid = paymentsList
                    .filter(p => p.schoolId === schoolId && p.academicYear === academicYear)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
            }
            else if (type === 'tuition') {
                expectedAmount = installment === 'T1' ? (student.feeT1 ?? globalFees.feeT1 ?? 0) : installment === 'T2' ? (student.feeT2 ?? globalFees.feeT2 ?? 0) : (student.feeT3 ?? globalFees.feeT3 ?? 0);
                if (!expectedAmount || expectedAmount <= 0) {
                    throw new functions.https.HttpsError('failed-precondition', `Expected tuition fee for installment ${installment} is not defined.`);
                }
                for (const p of paymentsList) {
                    if (p.schoolId === schoolId && !p.academicYear) {
                        throw new functions.https.HttpsError('failed-precondition', 'Ambiguous legacy payments found without academicYear. Recording blocked.');
                    }
                }
                previousPaid = paymentsList
                    .filter(p => p.schoolId === schoolId && p.academicYear === academicYear && p.installment === installment)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
            }
            const remainingBalance = Math.max(0, expectedAmount - previousPaid);
            if (amount > remainingBalance) {
                throw new functions.https.HttpsError('failed-precondition', `Payment amount (${amount}) exceeds remaining balance (${remainingBalance}).`);
            }
            const newPaid = previousPaid + amount;
            const newRemaining = Math.max(0, expectedAmount - newPaid);
            let lastReceiptNumber = 0;
            if (counterSnap.exists) {
                lastReceiptNumber = counterSnap.data()?.lastReceiptNumber || 0;
            }
            const nextReceiptNumber = lastReceiptNumber + 1;
            transaction.set(counterRef, { lastReceiptNumber: nextReceiptNumber }, { merge: true });
            const currentYear = new Date().getFullYear();
            const formattedNum = String(nextReceiptNumber).padStart(4, '0');
            const receiptNumber = `REC-${currentYear}-${formattedNum}`;
            const paymentData = {
                id: paymentId,
                schoolId,
                studentId,
                amount,
                type,
                installment: installment || null,
                date: new Date().toISOString().split('T')[0],
                description: cleanDescription,
                method: 'cash',
                academicYear,
                createdBy: uid,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                requestId,
                byRecordCashPayment: true
            };
            const cleanUndefined = (obj) => {
                return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
            };
            transaction.set(paymentRef, cleanUndefined(paymentData));
            const studentUpdate = {};
            if (type === 'registration_fee') {
                const totalRegPaid = (student.registrationFeePaid || 0) + amount;
                studentUpdate.registrationFeePaid = totalRegPaid;
                studentUpdate.registrationFeeStatus = totalRegPaid >= expectedAmount ? 'paid' : (totalRegPaid > 0 ? 'partial' : 'unpaid');
            }
            else if (type === 'tuition') {
                for (const tp of paymentsList) {
                    if (tp.schoolId === schoolId && !tp.academicYear) {
                        throw new functions.https.HttpsError('failed-precondition', 'Ambiguous legacy tuition payments found without academicYear.');
                    }
                }
                const totalTuitionPaidForYear = paymentsList
                    .filter(p => p.schoolId === schoolId && p.academicYear === academicYear)
                    .reduce((sum, p) => sum + (p.amount || 0), 0) + amount;
                const fallbackExpected = (student.feeT1 ?? globalFees.feeT1 ?? 0) + (student.feeT2 ?? globalFees.feeT2 ?? 0) + (student.feeT3 ?? globalFees.feeT3 ?? 0);
                const totalTuitionExpectedForYear = student.tuitionExpected || fallbackExpected;
                studentUpdate.tuitionPaid = totalTuitionPaidForYear;
                studentUpdate.tuitionStatus = totalTuitionPaidForYear >= totalTuitionExpectedForYear ? 'paid' : (totalTuitionPaidForYear > 0 ? 'partial' : 'unpaid');
            }
            transaction.update(studentRef, studentUpdate);
            let schoolName = school.name || 'EcoScolaire';
            if (cycle && school.cycleNames && school.cycleNames[cycle]) {
                schoolName = school.cycleNames[cycle];
            }
            const receiptData = {
                id: paymentId,
                paymentId,
                schoolId,
                receiptNumber,
                studentId,
                studentName: student.name || '',
                studentRegistrationNumber: student.matricule || '',
                classId,
                className,
                academicYear,
                schoolName,
                type,
                method: 'cash',
                date: paymentData.date,
                paymentType: type,
                paymentMethod: 'cash',
                paymentDate: paymentData.date,
                amount,
                expectedAmount,
                previousPaid,
                newPaid,
                remainingBalance: newRemaining,
                collectedByUserId: uid,
                collectedByName: user.name || user.email || '',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                ...(type === 'tuition' && installment ? { installment } : {})
            };
            const receiptRef = db.collection('receipts').doc(paymentId);
            transaction.set(receiptRef, cleanUndefined(receiptData));
            return {
                paymentId,
                receiptId: paymentId,
                receiptNumber,
                amount,
                previousPaid,
                newPaid,
                remainingBalance: newRemaining,
                idempotentReplay: false
            };
        }
    });
});
// ----------------------------------------------------------------------
// 10. createTuitionDiscount (Callable)
// ----------------------------------------------------------------------
exports.createTuitionDiscount = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const uid = context.auth.uid;
    const { studentId, installment, discountAmount, reason, requestId } = data || {};
    // Input Validation
    if (typeof studentId !== 'string' || studentId.trim() === '') {
        throw new functions.https.HttpsError('invalid-argument', 'studentId must be a non-empty string.');
    }
    if (!(0, discountHelpers_1.isTuitionInstallment)(installment)) {
        throw new functions.https.HttpsError('invalid-argument', 'installment must be T1, T2, or T3.');
    }
    if (typeof discountAmount !== 'number' || !Number.isFinite(discountAmount) || !Number.isSafeInteger(discountAmount) || discountAmount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'discountAmount must be a positive safe integer.');
    }
    if (typeof reason !== 'string' || reason.trim() === '' || reason.trim().length < 3 || reason.trim().length > 500) {
        throw new functions.https.HttpsError('invalid-argument', 'reason must be a string between 3 and 500 characters.');
    }
    if (typeof requestId !== 'string' || requestId.trim() === '' || requestId.trim().length > 128) {
        throw new functions.https.HttpsError('invalid-argument', 'requestId must be a string under 128 characters.');
    }
    const cleanReason = reason.trim();
    const cleanRequestId = requestId.trim();
    const cleanStudentId = studentId.trim();
    const db = admin.firestore();
    return await db.runTransaction(async (transaction) => {
        // 1. users/{uid}
        const userRef = db.collection('users').doc(uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
            throw new functions.https.HttpsError('permission-denied', 'Operator user not found.');
        }
        const user = userSnap.data();
        if (user.isActive !== true) {
            throw new functions.https.HttpsError('permission-denied', 'Operator is inactive.');
        }
        const allowedRoles = ['owner', 'director', 'superAdmin'];
        if (!allowedRoles.includes(user.role)) {
            throw new functions.https.HttpsError('permission-denied', 'Operator role not authorized for discounts.');
        }
        // 2. students/{studentId}
        const studentRef = db.collection('students').doc(cleanStudentId);
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Student not found.');
        }
        const student = studentSnap.data();
        const schoolId = student.schoolId;
        const academicYear = student.academicYear;
        if (!schoolId || !academicYear) {
            throw new functions.https.HttpsError('failed-precondition', 'Student schoolId or academicYear is missing.');
        }
        if (student.active === false || student.isActive === false) {
            throw new functions.https.HttpsError('failed-precondition', 'Student is inactive.');
        }
        // Role checks with schoolId context
        if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
            throw new functions.https.HttpsError('permission-denied', 'Operator does not belong to this school.');
        }
        // 3. schools/{schoolId}
        const schoolRef = db.collection('schools').doc(schoolId);
        const schoolSnap = await transaction.get(schoolRef);
        if (!schoolSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'School not found.');
        }
        const school = schoolSnap.data();
        // Academic Year validation
        if (!school.academicYear || typeof school.academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(school.academicYear)) {
            throw new functions.https.HttpsError('failed-precondition', 'Active academic year is not defined or invalid for this school.');
        }
        if (academicYear !== school.academicYear) {
            throw new functions.https.HttpsError('failed-precondition', 'The requested academic year is not the active academic year of the school.');
        }
        // School active/subscription status checks
        if (school.active === false || school.isActive === false || school.status === 'inactive') {
            throw new functions.https.HttpsError('failed-precondition', 'School is inactive.');
        }
        if (school.subscriptionStatus && school.subscriptionStatus !== 'active' && school.subscriptionStatus !== 'trialing') {
            throw new functions.https.HttpsError('failed-precondition', 'School subscription is not active.');
        }
        // 4. tuitionDiscounts/{deterministicDiscountId}
        const discountIdentity = JSON.stringify([schoolId, cleanRequestId]);
        const discountHash = crypto.createHash('sha256').update(discountIdentity, 'utf8').digest('hex');
        const discountId = `discount_${discountHash}`;
        const discountRef = db.collection('tuitionDiscounts').doc(discountId);
        const discountSnap = await transaction.get(discountRef);
        if (discountSnap.exists) {
            const existing = discountSnap.data();
            if (existing.schoolId === schoolId &&
                existing.studentId === cleanStudentId &&
                existing.academicYear === academicYear &&
                existing.installment === installment &&
                existing.discountAmount === discountAmount &&
                existing.reason === cleanReason) {
                return {
                    success: true,
                    discountId,
                    discountCode: existing.discountCode,
                    status: existing.status,
                    schoolId: existing.schoolId,
                    studentId: existing.studentId,
                    academicYear: existing.academicYear,
                    installment: existing.installment,
                    grossExpectedAmount: existing.grossExpectedAmount,
                    discountAmount: existing.discountAmount,
                    netExpectedAmount: existing.netExpectedAmount,
                    idempotentReplay: true
                };
            }
            else {
                throw new functions.https.HttpsError('already-exists', 'A different discount already exists with this requestId.');
            }
        }
        // Resolve current tuition fee
        const globalFees = school.globalFees || { feeT1: 0, feeT2: 0, feeT3: 0 };
        const grossExpectedAmount = installment === 'T1'
            ? (student.feeT1 ?? globalFees.feeT1 ?? 0)
            : installment === 'T2'
                ? (student.feeT2 ?? globalFees.feeT2 ?? 0)
                : (student.feeT3 ?? globalFees.feeT3 ?? 0);
        if (typeof grossExpectedAmount !== 'number' ||
            !Number.isFinite(grossExpectedAmount) ||
            !Number.isSafeInteger(grossExpectedAmount) ||
            grossExpectedAmount <= 0) {
            throw new functions.https.HttpsError('failed-precondition', `Expected tuition fee for installment ${installment} is not defined or invalid.`);
        }
        // Validate discount calculation
        let discountAmounts;
        try {
            discountAmounts = (0, discountHelpers_1.calculateTuitionDiscountAmounts)(grossExpectedAmount, discountAmount);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'Calcul de réduction invalide.';
            throw new functions.https.HttpsError('failed-precondition', msg);
        }
        // Academic year starting digits extraction validation
        if (!academicYear || typeof academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(academicYear)) {
            throw new functions.https.HttpsError('failed-precondition', 'Academic year format is invalid.');
        }
        const yearPrefix = academicYear.substring(0, 4);
        // 5. tuitionDiscountCounters/{counterId} (only when Discount does not exist)
        const counterId = (0, discountHelpers_1.makeTuitionDiscountCounterId)({ schoolId, academicYear });
        const counterRef = db.collection('tuitionDiscountCounters').doc(counterId);
        const counterSnap = await transaction.get(counterRef);
        let nextSequence = 1;
        if (counterSnap.exists) {
            const cData = counterSnap.data();
            if (cData) {
                const lastSequence = cData.lastSequence;
                if (typeof lastSequence !== 'number' ||
                    !Number.isFinite(lastSequence) ||
                    !Number.isSafeInteger(lastSequence) ||
                    lastSequence < 0 ||
                    !Number.isSafeInteger(lastSequence + 1)) {
                    throw new functions.https.HttpsError('failed-precondition', 'Counter is malformed.');
                }
                nextSequence = lastSequence + 1;
            }
        }
        // Format code
        const formattedSeq = String(nextSequence).padStart(4, '0');
        const discountCode = `RED-${yearPrefix}-${formattedSeq}`;
        // Writes
        transaction.set(counterRef, { lastSequence: nextSequence }, { merge: true });
        const discountData = {
            id: discountId,
            schoolId,
            studentId: cleanStudentId,
            academicYear,
            discountCode,
            installment,
            grossExpectedAmount,
            discountAmount,
            netExpectedAmount: discountAmounts.netExpectedAmount,
            reason: cleanReason,
            status: 'draft',
            createdByUserId: uid,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        };
        transaction.set(discountRef, discountData);
        return {
            success: true,
            discountId,
            discountCode,
            status: 'draft',
            schoolId,
            studentId: cleanStudentId,
            academicYear,
            installment,
            grossExpectedAmount,
            discountAmount,
            netExpectedAmount: discountAmounts.netExpectedAmount,
            idempotentReplay: false
        };
    });
});
exports.approveTuitionDiscount = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const uid = context.auth.uid;
    const { discountId } = data || {};
    if (!discountId || typeof discountId !== 'string' || discountId.trim() === '') {
        throw new functions.https.HttpsError('invalid-argument', 'discountId is required.');
    }
    const cleanDiscountId = discountId.trim();
    if (cleanDiscountId.length > 512) {
        throw new functions.https.HttpsError('invalid-argument', 'discountId exceeds maximum length.');
    }
    const db = admin.firestore();
    return await db.runTransaction(async (transaction) => {
        // 1. users/{uid}
        const userRef = db.collection('users').doc(uid);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
            throw new functions.https.HttpsError('permission-denied', 'Operator user not found.');
        }
        const user = userSnap.data();
        if (user.isActive !== true) {
            throw new functions.https.HttpsError('permission-denied', 'Operator is inactive.');
        }
        const allowedRoles = ['owner', 'director', 'superAdmin'];
        if (!allowedRoles.includes(user.role)) {
            throw new functions.https.HttpsError('permission-denied', 'Operator role not authorized.');
        }
        // 2. tuitionDiscounts/{discountId}
        const discountRef = db.collection('tuitionDiscounts').doc(cleanDiscountId);
        const discountSnap = await transaction.get(discountRef);
        if (!discountSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Tuition discount not found.');
        }
        const discount = discountSnap.data();
        const hasStoredDiscountId = Object.prototype.hasOwnProperty.call(discount, 'id');
        if (hasStoredDiscountId && (typeof discount.id !== 'string' || discount.id !== cleanDiscountId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Discount ID mismatch.');
        }
        // Snapshot validation
        const { schoolId, studentId, academicYear, discountCode, installment, grossExpectedAmount, discountAmount, netExpectedAmount, reason, status } = discount;
        if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '' ||
            !studentId || typeof studentId !== 'string' || studentId.trim() === '' ||
            !discountCode || typeof discountCode !== 'string' || discountCode.trim() === '' ||
            !reason || typeof reason !== 'string' || reason.trim() === '') {
            throw new functions.https.HttpsError('failed-precondition', 'Discount snapshot is malformed.');
        }
        if (!academicYear || typeof academicYear !== 'string' || !/^\d{4}-\d{4}$/.test(academicYear)) {
            throw new functions.https.HttpsError('failed-precondition', 'Academic year snapshot format is invalid.');
        }
        if (installment !== 'T1' && installment !== 'T2' && installment !== 'T3') {
            throw new functions.https.HttpsError('failed-precondition', 'Installment snapshot is invalid.');
        }
        if (typeof grossExpectedAmount !== 'number' || !Number.isFinite(grossExpectedAmount) || !Number.isSafeInteger(grossExpectedAmount) || grossExpectedAmount <= 0 ||
            typeof discountAmount !== 'number' || !Number.isFinite(discountAmount) || !Number.isSafeInteger(discountAmount) || discountAmount <= 0 ||
            typeof netExpectedAmount !== 'number' || !Number.isFinite(netExpectedAmount) || !Number.isSafeInteger(netExpectedAmount) || netExpectedAmount <= 0) {
            throw new functions.https.HttpsError('failed-precondition', 'Discount snapshot amounts are malformed.');
        }
        if (discountAmount >= grossExpectedAmount) {
            throw new functions.https.HttpsError('failed-precondition', 'Discount amount must be strictly less than gross.');
        }
        let calculatedAmounts;
        try {
            calculatedAmounts = (0, discountHelpers_1.calculateTuitionDiscountAmounts)(grossExpectedAmount, discountAmount);
        }
        catch (e) {
            throw new functions.https.HttpsError('failed-precondition', `Invalid tuition discount amounts calculation: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (calculatedAmounts.netExpectedAmount !== netExpectedAmount) {
            throw new functions.https.HttpsError('failed-precondition', 'Discount snapshot net amount does not match calculated net amount.');
        }
        const recognizedStatuses = ['draft', 'approved', 'applied', 'settled', 'revoked'];
        if (!recognizedStatuses.includes(status)) {
            throw new functions.https.HttpsError('failed-precondition', 'Discount snapshot status is unknown.');
        }
        // Role schoolId authorization check
        if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
            throw new functions.https.HttpsError('permission-denied', 'Operator does not belong to this school.');
        }
        // 3. students/{studentId}
        const studentRef = db.collection('students').doc(studentId);
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Student not found.');
        }
        const student = studentSnap.data();
        if (student.schoolId !== schoolId) {
            throw new functions.https.HttpsError('failed-precondition', 'Student schoolId mismatch.');
        }
        if (student.academicYear !== academicYear) {
            throw new functions.https.HttpsError('failed-precondition', 'Student academicYear mismatch.');
        }
        if (student.active === false || student.isActive === false) {
            throw new functions.https.HttpsError('failed-precondition', 'Student is inactive.');
        }
        // 4. schools/{schoolId}
        const schoolRef = db.collection('schools').doc(schoolId);
        const schoolSnap = await transaction.get(schoolRef);
        if (!schoolSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'School not found.');
        }
        const school = schoolSnap.data();
        if (school.academicYear !== academicYear) {
            throw new functions.https.HttpsError('failed-precondition', 'School academicYear mismatch.');
        }
        if (school.active === false || school.isActive === false || school.status === 'inactive') {
            throw new functions.https.HttpsError('failed-precondition', 'School is inactive.');
        }
        if (school.subscriptionStatus && school.subscriptionStatus !== 'active' && school.subscriptionStatus !== 'trialing') {
            throw new functions.https.HttpsError('failed-precondition', 'School subscription is not active.');
        }
        // 5. tuitionDiscountSlots/{slotId}
        const slotId = (0, discountHelpers_1.makeTuitionDiscountSlotId)({ schoolId, studentId, academicYear, installment });
        const slotRef = db.collection('tuitionDiscountSlots').doc(slotId);
        const slotSnap = await transaction.get(slotRef);
        // Structural Slot Validation (if it exists)
        if (slotSnap.exists) {
            const slotData = slotSnap.data();
            if ((slotData.id !== undefined && slotData.id !== slotId) ||
                slotData.schoolId !== schoolId ||
                slotData.studentId !== studentId ||
                slotData.academicYear !== academicYear ||
                slotData.installment !== installment ||
                !slotData.discountId ||
                typeof slotData.discountId !== 'string' ||
                slotData.discountId.trim() === '') {
                throw new functions.https.HttpsError('failed-precondition', 'Slot document metadata is corrupted or mismatch.');
            }
        }
        // Status / Slot Matrix Checks
        if (status === 'approved') {
            if (!slotSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Discount is approved but slot is missing.');
            }
            const slotData = slotSnap.data();
            if (slotData.discountId === cleanDiscountId) {
                // Case B: Idempotent replay
                return {
                    success: true,
                    discountId: cleanDiscountId,
                    discountCode,
                    slotId,
                    status: 'approved',
                    schoolId,
                    studentId,
                    academicYear,
                    installment,
                    grossExpectedAmount,
                    discountAmount,
                    netExpectedAmount,
                    idempotentReplay: true
                };
            }
            else {
                // Case D: Slot points to another discount
                throw new functions.https.HttpsError('failed-precondition', 'Slot points to a different discount.');
            }
        }
        if (status === 'draft') {
            if (slotSnap.exists) {
                const slotData = slotSnap.data();
                if (slotData.discountId === cleanDiscountId) {
                    // Case E: Draft with slot pointing to the same discount
                    throw new functions.https.HttpsError('failed-precondition', 'Inconsistent state: slot already points to this draft discount.');
                }
                else {
                    // Case F: Slot points to another discount (active)
                    throw new functions.https.HttpsError('already-exists', 'An approved discount already exists for this slot.');
                }
            }
        }
        else {
            // Case G: applied, settled, revoked
            throw new functions.https.HttpsError('failed-precondition', `Discount is in non-approvable status: ${status}`);
        }
        // 6. Payments Tuition validation (only when transitioning from draft to approved)
        const paymentsSnap = await transaction.get(db.collection('payments')
            .where('studentId', '==', studentId)
            .where('type', '==', 'tuition'));
        for (const doc of paymentsSnap.docs) {
            const p = doc.data();
            if (p.schoolId === schoolId &&
                p.academicYear === academicYear &&
                p.installment === installment) {
                const amount = p.amount;
                if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount <= 0) {
                    throw new functions.https.HttpsError('failed-precondition', 'Malformed tuition payment found on this installment.');
                }
                // Valid positive payment exists on this slot
                throw new functions.https.HttpsError('failed-precondition', 'Cannot approve discount: a payment already exists on this installment.');
            }
        }
        // 8. Writes: creation of Slot and update of Discount status
        const newSlot = {
            id: slotId,
            schoolId,
            studentId,
            academicYear,
            installment,
            discountId: cleanDiscountId,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        };
        transaction.set(slotRef, newSlot);
        transaction.update(discountRef, {
            status: 'approved',
            approvedByUserId: uid,
            approvedAt: firestore_1.FieldValue.serverTimestamp()
        });
        return {
            success: true,
            discountId: cleanDiscountId,
            discountCode,
            slotId,
            status: 'approved',
            schoolId,
            studentId,
            academicYear,
            installment,
            grossExpectedAmount,
            discountAmount,
            netExpectedAmount,
            idempotentReplay: false
        };
    });
});
var studentImportSweeper_1 = require("./studentImportSweeper");
Object.defineProperty(exports, "sweepZombieImportJobs", { enumerable: true, get: function () { return studentImportSweeper_1.sweepZombieImportJobs; } });
//# sourceMappingURL=index.js.map