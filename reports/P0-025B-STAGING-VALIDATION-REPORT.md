# P0-025B-STAGING-VALIDATION-REPORT

## Déploiement
Le code de validation Server-to-Server a été déployé avec succès sur `ecoscolaire-staging` via le pipeline CI/CD GitHub Actions (Commit `ce9592a`). 
- Cloud Function `campayWebhook` active en staging.
- Règles de sécurité Firestore à jour.

## Tests
Des tests directs ont été lancés sur l'environnement Staging via le script `scripts/test-live-webhook.mjs`.
- **TEST 1 (Webhook avec référence inexistante)** : Une requête HTTP POST a été envoyée avec `{ external_reference: 'tx-fake-123' }`. La réponse a été `200 OK`, ce qui valide que la fonction intercepte correctement la requête, masque l'erreur à Campay et l'absorbe défensivement.
- **TEST 2 (Webhook avec autre référence invalide)** : Même comportement (`200 OK`).

## Logs
Le comportement HTTP externe est conforme aux attentes sécuritaires (pas de fuite d'erreur 500, toujours 200 OK). Toutefois, la vérification des logs internes Cloud Functions n'a pas pu être extraite automatiquement par l'agent depuis l'environnement Staging.

## Firestore
*Preuves Firestore non vérifiables de manière autonome.*
L'agent ne possède pas les credentials `STAGING_FIREBASE_SERVICE_ACCOUNT` localement. Une tentative d'extraction de la base via un Workflow GitHub Actions (script `validate-staging.cjs`) a échoué à remonter les résultats textuels vers le dépôt. 
Par conséquent, la non-création des documents `payments` et `receipts` n'a pas pu être photographiée ou vérifiée par code.

## Idempotence
Le code d'idempotence (`status !== 'PENDING'`) est bien en place et déployé. Mais de même que pour les logs, la preuve par extraction Firestore (TEST 5) n'est pas disponible dans ce rapport.

## Verdict
P0-025B PARTIELLEMENT VALIDÉ

**Conclusion** : Le déploiement est réussi et le endpoint Staging est fonctionnel de l'extérieur. Cependant, la règle stricte *"Ne pas conclure VALIDÉ sans preuves Firestore"* m'oblige à déclarer une validation partielle. Un administrateur doit ouvrir la console Firebase Staging et vérifier manuellement la table `campay_logs` pour confirmer les tests internes.
