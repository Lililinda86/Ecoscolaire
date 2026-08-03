# P0-MOBILE-MONEY-021-WEBHOOK-AUDIT-REPORT

## Cloud Functions
Les fonctions Cloud actuellement implémentées dans `functions/src/index.ts` sont :
- **`initiatePayment`** : Lignes 52 à 226. Elle gère la création de la transaction `PENDING` et l'appel initial à Campay via `CampayService`.
- **`campayWebhook`** : Lignes 20 à 25. C'est actuellement un endpoint "vide" (renvoie simplement 200 OK) destiné à réceptionner le vrai webhook Campay.
- **`mockConfirmPayment`** : Lignes 232 à 321. Elle simule la confirmation manuelle pour le mode MOCK.
- **`onPaymentCreated`** : Lignes 327 à 393. C'est le trigger Firestore chargé de générer le PDF de reçu, activé par l'écriture dans la collection `payments`.

## Firestore
- **`transactions`** : Reçoit initialement la transaction au statut `PENDING` générée par `initiatePayment`. Contient `amount`, `schoolId`, `studentId`, `type`, `phoneNumber`, etc.
- **`payments`** : Cible finale lorsqu'un paiement est confirmé. C'est la création d'un document ici qui déclenche `onPaymentCreated`.
- **`receipts`** : Alimentée automatiquement par `onPaymentCreated` sans intervention externe.
- **`campay_logs`** : Utilisée pour tracer les communications (ex: `request_to_pay`, statut SUCCESS, etc.).
- **`counters`** : Utilisée par le trigger pour incrémenter de façon atomique les numéros de reçus (`lastReceiptNumber`).

## Paiement Campay
- **`external_reference`** : Le code source de `initiatePayment` injecte explicitement notre `transactionId` généré en tant que `external_reference` lors de l'appel à Campay (ligne 145 : `generatedId // transactionId as externalReference`).
- **`transactionId`** : Il s'agit de l'identifiant unique du document dans la collection `transactions` (`db.collection('transactions').doc().id`).
- **`Référence Campay`** : Lors du test récent, Campay a retourné `73a5ab75-ab5c-41cf-8bce-ff64fd0d1e0e` en tant que référence côté opérateur (visible dans les logs `sanitizedResponse.reference`).
- **Mécanisme PENDING** : La transaction est créée via `await transactionRef.set(transactionData)` avec un statut figé à `PENDING` (lignes 205 et 215) avant d'appeler l'API de paiement.

## Webhook Campay
Il existe une route `campayWebhook` (`functions.https.onRequest`) prête à l'emploi. Cependant, elle ne gère pour l'instant aucun callback ni aucun statut (c'est une coquille vide `res.status(200).send('OK');`). Elle doit être implémentée dans la phase suivante.
