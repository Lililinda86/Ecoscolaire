import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { CampayService } from './services/campayService';

// Initialize the Firebase Admin SDK
admin.initializeApp();

// ----------------------------------------------------------------------
// 1. createSaaSCheckout
// Callable function to initiate a payment securely from the frontend.
// ----------------------------------------------------------------------
export const createSaaSCheckout = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return { status: 'mock_success', message: 'Not implemented yet' };
});

// ----------------------------------------------------------------------
// 2. campayWebhook
// HTTP function to receive status updates from Campay.
// ----------------------------------------------------------------------
export const campayWebhook = functions.https.onRequest(async (req, res) => {
  const payload = req.body || {};
  const { status, reference, external_reference, amount } = payload;
  const db = admin.firestore();

  // 2. Journalisation initiale
  await db.collection('campay_logs').add({
    requestType: 'webhook_received',
    payload: payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 3. Validation minimale
  if (!external_reference || !status) {
    await db.collection('campay_logs').add({
      requestType: 'webhook_failed',
      reason: 'Missing external_reference or status',
      payload: payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).send('OK');
    return;
  }

  const txRef = db.collection('transactions').doc(external_reference);

  try {
    await db.runTransaction(async (transaction) => {
      // 4. Recherche transaction
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists) {
        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_failed_not_found',
          external_reference: external_reference,
          payload: payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      const txData = txSnap.data()!;

      // 5. Règle idempotence
      if (txData.status !== 'PENDING') {
        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_duplicate',
          external_reference: external_reference,
          currentStatus: txData.status,
          payload: payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }

      const upperStatus = String(status).toUpperCase();

      // 6 & 7. Succès ou Echec
      if (['SUCCESS', 'SUCCESSFUL'].includes(upperStatus)) {
        transaction.update(txRef, {
          status: 'SUCCESS',
          providerReference: reference || null,
          providerResponse: payload,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const paymentRef = db.collection('payments').doc(external_reference);
        transaction.set(paymentRef, {
          id: external_reference,
          schoolId: txData.schoolId,
          studentId: txData.studentId || null,
          amount: txData.amount || amount,
          type: txData.type || 'PAYMENT',
          installment: txData.installment || null,
          paymentMethod: 'Mobile Money',
          provider: 'Campay',
          providerReference: reference || null,
          transactionId: external_reference,
          status: 'completed',
          date: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_processed',
          status: 'SUCCESS',
          external_reference: external_reference,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (['FAILED', 'FAILURE', 'ERROR'].includes(upperStatus)) {
        transaction.update(txRef, {
          status: 'FAILED',
          failureReason: payload,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_processed',
          status: 'FAILED',
          external_reference: external_reference,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_failed',
          reason: `Unhandled status: ${status}`,
          external_reference: external_reference,
          payload: payload,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });
  } catch (error: any) {
    await db.collection('campay_logs').add({
      requestType: 'webhook_failed',
      reason: 'Transaction error',
      error: error.message,
      external_reference: external_reference,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // 9. Réponse Campay finale
  res.status(200).send('OK');
});

// ----------------------------------------------------------------------
// 3. verifySaaSPayment
// Callable function to manually poll the payment status if webhook failed.
// ----------------------------------------------------------------------
export const verifySaaSPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  return { status: 'mock_checked', message: 'Not implemented yet' };
});

// ----------------------------------------------------------------------
// 4. dailySubscriptionCheck
// Scheduled function (Cron) running daily at midnight to suspend expired schools.
// ----------------------------------------------------------------------
export const dailySubscriptionCheck = functions.pubsub.schedule('every day 00:00').onRun(async (context) => {
  const now = new Date();
  console.log(`Cron execution at ${now.toISOString()}`);
  return null;
});

// ----------------------------------------------------------------------
// 5. initiatePayment
// Callable function to securely initiate Mobile Money payments
// ----------------------------------------------------------------------
export const initiatePayment = functions.https.onCall(async (data, context) => {
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
  
  let mode: 'mock' | 'campay_sandbox' = 'mock';
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
      if (secrets.campayEnvironment === 'sandbox') {
        mode = 'campay_sandbox';
        const campayService = new CampayService(true); // force sandbox for now
        let token = '';
        
        try {
          // 1. Login
          token = await campayService.login(secrets.campayAppUsername, secrets.campayAppPassword);
          
          // 2. Request To Pay
          const description = `Paiement pour ${studentId || 'élève inconnu'}`;
          const response = await campayService.requestToPay(
            token,
            amount,
            phoneNumber,
            description,
            generatedId // transactionId as externalReference
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
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
        } catch (error: any) {
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
            errorMessage: error.message,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          throw new functions.https.HttpsError('internal', `Campay initiation failed: ${error.message}`);
        }
      } else {
        console.log(`[CAMPAY] Secrets found, but campayEnvironment is not sandbox. Falling back to MOCK.`);
      }
    } else {
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
export const mockConfirmPayment = functions.https.onCall(async (data, context) => {
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
export const onPaymentCreated = functions.firestore
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
      const cleanUndefined = (obj: any) => {
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
