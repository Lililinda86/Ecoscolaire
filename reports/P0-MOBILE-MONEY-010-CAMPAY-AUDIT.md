# P0-MOBILE-MONEY-010-CAMPAY-AUDIT

## État actuel MOCK
- Le flux UI est valide.
- Le Callable gère correctement la vérification IAM, les vérifications d'école et de rôle.
- La transaction est bien insérée avec le statut `PENDING`.
- Le paiement final n'est PAS créé prématurément.
- **Lacune identifiée :** Le payload frontend actuel n'envoie pas le numéro de téléphone (`phoneNumber`), qui est exigé par Campay.

## Données nécessaires Campay
Pour l'endpoint `/api/collect/` :
- `amount` : Le montant (déjà dans le payload).
- `currency` : La devise (généralement `XAF`, à récupérer des `settings` de l'école).
- `from` : **Le numéro de téléphone Mobile Money (à ajouter au payload Frontend).**
- `description` : Un libellé explicite (ex: `Frais scolarité T1 - Élève1`).
- `external_reference` : L'ID Firebase de la transaction générée, indispensable pour faire le lien au retour du webhook.

## Secrets nécessaires
- **Où les stocker :** Firestore, collection imbriquée `/schools/{schoolId}/secrets/payment`.
- **Accès Frontend :** Totalement interdit par les `firestore.rules` (`allow read: if false;`).
- **Accès Backend :** L'Admin SDK de Firebase Functions contourne les règles et peut lire le document en toute sécurité.
- **Champs requis :** `campayAppUsername`, `campayAppPassword`, et optionnellement le `webhookSecret` de Campay si configuré par école.

## Architecture initiatePayment réelle
1. Recevoir le `phoneNumber` dans les arguments `data`.
2. Valider l'utilisateur, l'école, les droits (déjà fait).
3. Générer l'ID de transaction (déjà fait).
4. Lire `/schools/{schoolId}/secrets/payment` pour récupérer `AppUsername` et `AppPassword`.
5. Appeler `POST https://demo.campay.net/api/token/` pour obtenir le Bearer Token Campay.
6. Appeler `POST https://demo.campay.net/api/collect/` avec le Bearer, le montant, le numéro de téléphone et l'`external_reference` (ID de transaction Firestore).
7. Récupérer le `reference` (ID Campay) retourné par l'API.
8. Enregistrer la transaction Firestore (PENDING) avec `providerTransactionId = reference`.
9. Retourner le succès au Frontend.

## Architecture campayWebhook
1. Point d'entrée : `functions.https.onRequest(async (req, res))`.
2. Valider l'authenticité de la requête (Campay envoie un header `Signature` qu'il faut hacher en HMAC SHA256, ou simplement s'assurer que l'URL est secrète).
3. Lire le corps JSON envoyé par Campay (il contient `status`, `reference`, `external_reference`).
4. Effectuer une transaction Firestore (`db.runTransaction()`) pour garantir l'atomicité :
   - Lire la transaction ciblée par `external_reference`.
   - Si elle n'existe pas ou n'est plus `PENDING`, ignorer et renvoyer `200 OK` (évite les boucles).

## Modèle transaction final
Le document `/transactions/{id}` doit inclure :
- `status`: `PENDING` | `SUCCESS` | `FAILED`.
- `providerTransactionId`: Identifiant unique Campay.
- `failureReason`: Si Campay retourne FAILED, y inscrire la raison ("Fonds insuffisants", etc.).

## Création payment après confirmation
À l'intérieur de la transaction Firestore de `campayWebhook`, si `status == 'SUCCESSFUL'` (selon la nomenclature Campay) :
1. Modifier le `status` de `/transactions/{id}` à `SUCCESS`.
2. Créer le document de reçu officiel dans `/payments/{paymentId}` (avec `amount`, `studentId`, `type`, `method: 'mobile_money'`).
3. (Optionnel) Mettre à jour l'entité de l'étudiant (ex: `feeT1` si c'est de la scolarité).

## Sécurité
- **Double Paiement :** Bloqué par la condition `if (txData.status !== 'PENDING')` dans le Webhook (idempotence).
- **Faux Webhooks :** Campay recommande de vérifier la signature des webhooks. Cela nécessite de configurer une URL de webhook statique dans l'interface Campay et d'obtenir la clé secrète associée.
- **Fuite de secrets :** Les clés API ne seront JAMAIS envoyées au frontend.

## Risques
1. **Numéro de téléphone :** Le Frontend ne transmet actuellement pas le numéro saisi au backend.
2. **Timeouts :** L'API Campay peut être lente. Il faut configurer un timeout suffisant sur la Callable (ex: 60s).
3. **Cold Starts :** Les Callable Gen1 peuvent mettre quelques secondes à démarrer, le loader UI doit l'anticiper.

## Plan d'implémentation
1. **Frontend :** Modifier `src/pages/Payments.tsx` pour inclure `phoneNumber` dans le payload `httpsCallable`.
2. **Backend (initiate) :** Intégrer Axios ou Fetch, récupérer le secret Firestore, appeler l'API `/token` puis `/collect`.
3. **Backend (webhook) :** Écrire la logique d'écoute HTTP, de vérification de signature et d'insertion atomique dans `/payments`.
4. **Console Campay :** Configurer l'URL du webhook de staging (`https://us-central1-ecoscolaire-staging.cloudfunctions.net/campayWebhook`).

## GO / NO GO
**GO !**
L'architecture logicielle est robuste. Le blocage réseau étant résolu, le terrain est propre et prêt pour l'intégration de la logique métier réelle avec l'API Campay. 
(En attente de vos instructions pour commencer les modifications).
