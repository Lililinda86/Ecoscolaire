# P0-MOBILE-MONEY-021A-WEBHOOK-CODE-PUSH-REPORT

## 1. Extrait de `campayWebhook` avant/après

### Avant (Stub vide)
```typescript
export const campayWebhook = functions.https.onRequest(async (req, res) => {
  res.status(200).send('OK');
});
```

### Après (Implémentation métier complète)
```typescript
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

  // 9. Réponse Campay
  res.status(200).send('OK');
});
```

## 2. Statut du build
**Succès.**
La commande `npm --prefix functions run build` s'est exécutée correctement sans produire d'erreur TypeScript (`tsc` a compilé les fichiers `.ts` vers `.js`).

## 3. Hash exact du commit (Poussé vers origin/main)
**Hash :** `4a2851fa4267f3a1f3e4bb0eb38c7b5afabf8f31`

Le code a été explicitement poussé (`git push`) vers le dépôt distant pour être accessible depuis Cloud Shell. 
Aucun autre endpoint (`initiatePayment`, `mockConfirmPayment`, `onPaymentCreated`) n'a été modifié et **aucun déploiement** direct Firebase n'a été effectué depuis cette session.
