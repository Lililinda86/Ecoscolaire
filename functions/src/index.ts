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
  const external_reference = payload.external_reference || payload.externalReference || payload.merchant_reference;
  const reference = payload.reference || payload.transaction_reference;
  const db = admin.firestore();

  // 1. Journalisation brute de la réception (avant toute validation)
  await db.collection('campay_logs').add({
    requestType: 'webhook_received_raw',
    payload: payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 2. Validation minimale du payload
  if (!external_reference || !reference) {
    await db.collection('campay_logs').add({
      requestType: 'webhook_aborted',
      reason: 'Missing external_reference or reference in payload',
      payload: payload,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
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
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.status(200).send('OK');
      return;
    }

    const txInitialData = txInitialSnap.data()!;
    if (txInitialData.status !== 'PENDING') {
      await db.collection('campay_logs').add({
        requestType: 'webhook_duplicate',
        reason: 'Transaction is not PENDING',
        external_reference: external_reference,
        currentStatus: txInitialData.status,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
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
    const campayService = new CampayService(isSandbox);
    const token = await campayService.login(secrets.campayAppUsername, secrets.campayAppPassword);
    
    const apiTx = await campayService.getTransactionStatus(token, reference);

    // Journalisation de la réponse API brute
    await db.collection('campay_logs').add({
      requestType: 'api_verification_response',
      external_reference: external_reference,
      apiResponse: apiTx,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
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
      const txData = txSnap.data()!;

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
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
          date: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_success_verified',
          external_reference: external_reference,
          status: 'SUCCESS',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (['FAILED', 'FAILURE', 'ERROR'].includes(upperStatus)) {
        transaction.update(txRef, {
          status: 'FAILED',
          failureReason: apiTx,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_failed_verified',
          external_reference: external_reference,
          status: 'FAILED',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        transaction.set(db.collection('campay_logs').doc(), {
          requestType: 'webhook_verification_mismatch',
          external_reference: external_reference,
          reason: 'Mismatch in amount, reference, or unknown status',
          apiTx: apiTx,
          localTxAmount: txData.amount,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });

  } catch (error: any) {
    await db.collection('campay_logs').add({
      requestType: 'webhook_processing_error',
      external_reference: external_reference,
      error: error.message,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // 7. Toujours renvoyer 200 OK à Campay
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
  
  let mode: 'mock' | 'campay_sandbox' | 'campay_production' = 'mock';
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
      } else {
        mode = 'campay_production';
      }
      const campayService = new CampayService(isSandbox);
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
      // Removed the else block that was falling back to mock when not sandbox
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

// ----------------------------------------------------------------------
// 8. enforceStudentSaasLimits (Trigger)
// Maintains the studentsCount on schools and deletes excess students
// ----------------------------------------------------------------------
export const enforceStudentSaasLimits = functions.firestore
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
    if (!schoolId) return null;

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
        if (plan === 'premium' || isInternalSchool) limit = Infinity;
        else if (plan === 'pilot' || plan === 'standard') limit = 1000;
        else limit = 200;

        if (currentCount > limit) {
          console.warn(`[SaaS Limits] School ${schoolId} exceeded limit of ${limit}. Deleting student ${studentId}.`);
          transaction.delete(change.after.ref);
          return null;
        } else {
          transaction.update(schoolRef, { studentsCount: currentCount });
          return null;
        }
      }
      return null;
    });
  });
