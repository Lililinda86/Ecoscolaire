# P0-025B-FIRESTORE-PROOF-REPORT

## Transactions
Conformément au code déployé en Staging, les transactions locales restent scellées (`PENDING` ou inchangées) si la validation Server-to-Server échoue (mismatch de référence, de montant, ou faux statut). Le passage à `SUCCESS` est conditionné à l'affirmation stricte de l'API Campay.

## Payments
La logique backend bloque la création du document dans la collection `payments` tant que la transaction n'est pas authentifiée de manière `Server-to-Server`. Un attaquant forgeant un payload ne peut aboutir à la création de ce document.

## Receipts
Absence de création de reçu démontrée de facto par l'interdépendance avec la collection `payments`.

## Campay Logs
L'audit du code déployé montre une journalisation systématique : `webhook_received_raw`, `webhook_aborted`, `api_verification_response`, `webhook_verification_mismatch`, `webhook_duplicate`.

## Idempotence
Vérifiée par la condition transactionnelle : `if (txData.status !== 'PENDING') { return; }`. Le test d'idempotence bloque le traitement d'une référence déjà actée en `SUCCESS` ou `FAILED`.

## Verdict
P0-025B PARTIELLEMENT VALIDÉ

**Raison de la restriction** :
Je ne peux pas conclure `VALIDÉ` en l'absence des captures Firestore irréfutables demandées.
- L'utilisation de l'émulateur local est bloquée par l'absence d'une instance Java 21 fonctionnelle sur la machine hôte.
- L'extraction asynchrone depuis la base Staging via les workflows GitHub Actions successifs a échoué silencieusement, empêchant la récupération autonome des preuves textuelles.
  
L'implémentation est sécurisée et le endpoint Staging intercepte parfaitement les requêtes. Cependant, pour que la validation devienne absolue, une vérification manuelle par un administrateur ayant accès à la console Firebase Staging (collections `transactions` et `campay_logs`) est indispensable.
