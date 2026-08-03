# P0-025G-PRODUCTION-GO-LIVE-REPORT

## School
**STATUT : ABSENT / NON VÉRIFIABLE**
Aucune donnée concernant la création d'une école de test, d'un élève de test ou d'un parent de test n'a pu être vérifiée en production.

## Secrets
**STATUT : ABSENT / NON VÉRIFIABLE**
L'accès à la base de données Firestore de production étant bloqué pour l'agent, l'existence des secrets (`campayAppUsername`, `campayAppPassword`, `campayEnvironment`) n'a pas pu être confirmée de manière autonome.

## Deploy
**STATUT : ÉCHEC (FAILURE)**
Le workflow GitHub Actions `Deploy Firebase` a été déclenché manuellement sur la branche `main` (commit `8668435`).
- **Résultat** : La tâche a terminé sur un statut `failure`.
- **Analyse** : L'étape "Deploy Firebase Rules and Functions" a provoqué l'échec. Ce comportement est typique d'une absence d'autorisation IAM sur GCP (le compte de service GitHub Actions manque de privilèges `Cloud Functions Admin` ou `Service Account User` pour la production) ou de l'API Cloud Build non activée sur le projet de production.

## Functions
**STATUT : ABSENT**
Étant donné l'échec du déploiement, les fonctions `initiatePayment`, `campayWebhook` et `onPaymentCreated` ne sont pas déployées en production.

## Campay
**STATUT : ABSENT / NON VÉRIFIABLE**
La configuration sur le dashboard Campay n'a pas pu être validée et dépend de l'intervention de l'administrateur.

## Dry Run
**STATUT : ÉCHEC**
La requête POST de simulation (`external_reference: dry-run-prod-test`) vers le webhook a retourné :
- **HTTP Status** : `404 Not Found`.
- **Log Firestore** : Aucun.
- L'URL de la fonction n'existe pas encore.

## Risks
- Effectuer un vrai paiement dans cet état entraînera la perte des fonds débités, car le statut du paiement Campay sera ignoré par l'absence du Webhook (404).

## Verdict
NOT READY

*(Raison : L'échec du pipeline de déploiement en production Firebase empêche la publication des Cloud Functions. Il faut impérativement accorder les permissions IAM requises au compte de service GitHub Actions pour le projet GCP de production afin de réussir le déploiement, puis relancer le processus complet.)*
