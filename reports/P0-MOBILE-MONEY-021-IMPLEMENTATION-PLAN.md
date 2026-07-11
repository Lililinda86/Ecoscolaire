# P0-MOBILE-MONEY-021-IMPLEMENTATION-PLAN

## 1. Réception callback Campay
- **Endpoint** : La fonction existante `campayWebhook` (`functions.https.onRequest`) sera implémentée.
- **Validation du payload** :
  - Vérification de la présence de `req.body.reference` (Référence Campay unique).
  - Vérification de la présence de `req.body.external_reference` (Notre `transactionId` Firebase).
  - Récupération du `req.body.status` (qui peut être `SUCCESSFUL`, `FAILED`, etc.).
- **Sécurité optionnelle / HMAC** : Selon la documentation Campay, un header de signature peut être validé. Si activé, il sera traité, sinon on se fiera à l'existence de notre `external_reference` en base.

## 2. Mise à jour Firestore (Atomicité stricte)
La fonction exécutera une transaction Firestore (`db.runTransaction`) en ciblant `db.collection('transactions').doc(payload.external_reference)`.

- Lecture du document : si introuvable, abandon immédiat.
- **Vérification d'idempotence** : Si `status !== 'PENDING'`, abandon (retourner HTTP 200 à Campay).
- **Mise à jour** :
  - Si `payload.status === "SUCCESSFUL"` :
    - La transaction passe à `SUCCESS`.
    - `providerTransactionId` prend la valeur de `payload.reference`.
    - `providerResponse` stocke le payload complet brut.
  - Si `payload.status === "FAILED"` :
    - La transaction passe à `FAILED`.
    - `failureReason` stocke la cause extraite du payload.

## 3. Création payment
**Uniquement si le statut webhook est SUCCESSFUL.**
Durant la même transaction Firestore, un nouveau document sera écrit dans la collection `payments` avec l'identifiant exact de la transaction (`external_reference`). Ses champs (`amount`, `schoolId`, `studentId`, `method`) seront copiés de la transaction existante, imitant parfaitement le flux MOCK.

## 4. Génération reçu
**Aucune ligne de code ne sera ajoutée pour cela.**
Le trigger existant `onPaymentCreated` intercepte automatiquement toute création dans `payments`. Il générera le numéro (ex: `REC-2026-0002`), créera le reçu dans la collection `receipts` et mettra à jour les compteurs sans aucune duplication de logique.

## 5. Dashboard Finance
**Aucune ligne de code ne sera ajoutée pour cela.**
Le dashboard écoute dynamiquement (via `AppContext`) les collections `payments`, `receipts` et `transactions`. Dès que Firestore synchronise les changements, les indicateurs clés (Encaissé, En attente) s'ajusteront instantanément côté client.

## 6. Sécurité et Logs
- **Idempotence & Doublons** : Assurée par le blocage `if (txData.status !== 'PENDING')` de `db.runTransaction`. Il est impossible de créer deux fois un document `payment` pour la même transaction.
- **Références invalides** : Une référence `external_reference` introuvable sera tracée (`webhook_failed_not_found`) dans les `campay_logs` et ignorée.
- **`campay_logs`** :
  - Ajout d'un enregistrement `requestType: "webhook_received"` avec le payload.
  - Si traitement réussi : ajout d'un log `requestType: "webhook_processed"`.
  - Si échec technique ou erreur de validation : `requestType: "webhook_failed"`.
