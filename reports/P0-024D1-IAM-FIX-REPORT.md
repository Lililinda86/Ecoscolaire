# P0-024D1-IAM-FIX-REPORT

## Cause racine
L'échec du déploiement Firebase Functions s'explique par deux limites de permissions strictes rencontrées par le Service Account lors de l'exécution de `firebase-tools` :
1. **`Failed to set IAM Policy`** : Firebase tente de configurer les droits d'invocation publics ou spécifiques sur les fonctions HTTP (`createSaaSCheckout`, `verifySaaSPayment`). Le rôle actuel `roles/cloudfunctions.developer` permet de déployer le code, mais n'inclut pas la permission `cloudfunctions.functions.setIamPolicy`.
2. **`cloudscheduler.jobs.update HTTP 403`** : Le code contient manifestement des fonctions planifiées (Scheduled Functions via `pubsub.schedule`). Firebase doit donc interagir avec l'API Cloud Scheduler pour créer ou mettre à jour les tâches planifiées, ce qui est rejeté faute de permissions.

## Permissions manquantes
Pour respecter le principe du moindre privilège tout en permettant à Firebase CLI d'opérer, il manque les rôles standards suivants :
- **`roles/cloudfunctions.admin`** : Remplace ou complète le rôle *Developer* car il inclut spécifiquement le droit de modifier les politiques IAM des fonctions.
- **`roles/cloudscheduler.admin`** : Requis pour créer, mettre à jour et supprimer les jobs Cloud Scheduler liés aux fonctions planifiées.

*(Note : Si vos fonctions sont en Gen 2, Cloud Run est utilisé sous le capot. `roles/run.admin` pourrait également être nécessaire pour gérer les politiques IAM de Cloud Run).*

## Commandes gcloud
Voici les commandes exactes à exécuter dans votre terminal (authentifié avec un compte ayant les droits d'administration sur GCP) pour attribuer ces rôles au compte de service.

Remplacez `[SERVICE_ACCOUNT_EMAIL]` par l'email exact de votre compte de service Staging.

```bash
# Permet de définir les stratégies IAM sur les fonctions (Rend les endpoints HTTPS appelables)
gcloud projects add-iam-policy-binding ecoscolaire-staging \
  --member="serviceAccount:[SERVICE_ACCOUNT_EMAIL]" \
  --role="roles/cloudfunctions.admin"

# Permet de gérer les tâches planifiées (Scheduled Functions)
gcloud projects add-iam-policy-binding ecoscolaire-staging \
  --member="serviceAccount:[SERVICE_ACCOUNT_EMAIL]" \
  --role="roles/cloudscheduler.admin"
```

## Validation attendue
Une fois ces rôles appliqués, la relance du job GitHub Actions (`Re-run failed jobs`) devrait franchir l'étape `Deploy Firestore Rules and Functions to Staging` avec un statut **success**. Les fonctions seront déployées, les tâches planifiées mises à jour, et la base de données de test (Seed) pourra enfin s'exécuter.

## Risques
Les rôles suggérés sont limités à Cloud Functions et Cloud Scheduler. Il n'y a pas d'escalade de privilèges vers d'autres services critiques (Compute Engine, SQL, etc.). Le principe du moindre privilège est respecté dans le cadre d'un déploiement CI/CD backend automatisé.

## Verdict
IAM MANQUANT
