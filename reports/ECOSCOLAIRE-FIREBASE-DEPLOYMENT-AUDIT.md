# ECOSCOLAIRE-FIREBASE-DEPLOYMENT-AUDIT

## Méthode actuelle de déploiement
Après analyse des fichiers de configuration et de l'historique du projet, il apparaît que le projet utilise **deux méthodes distinctes** selon les composants :
1. **Firestore Rules** : Déployées automatiquement via **GitHub Actions** lors des push sur la branche `main`.
2. **Cloud Functions** : Déployées de manière **manuelle** par le développeur. L'agent AI n'a jamais pu les déployer localement pour cause de terminal non-authentifié (cf. rapports historiques P0-MOBILE-MONEY).

## Workflows GitHub
Deux workflows contrôlent le CI/CD dans `.github/workflows/` :

* **`ci.yml`** : Exécuté sur push/PR vers `main`. 
  - Il s'occupe du build frontend, des tests Playwright E2E, et **déploie les Firestore Rules vers l'environnement Staging**.
  - Il crée un fichier temporaire `staging-service-account.json` injecté via un secret GitHub.
  - Commande exécutée : `npx firebase-tools deploy --only firestore:rules --project ecoscolaire-staging --non-interactive`

* **`firebase-deploy.yml`** : Exécuté sur push vers `main`.
  - Authentification GCP via Workload Identity Federation.
  - **Déploie les Firestore Rules vers l'environnement Production**.
  - Commande exécutée : `firebase deploy --only firestore --project ecoscolaire-c5861 --non-interactive`

**Critique** : Aucun de ces deux workflows n'inclut le déploiement des Cloud Functions (`firebase deploy --only functions`).

## Secrets requis
Les secrets GitHub actuellement exploités par les workflows sont :
* `STAGING_FIREBASE_SERVICE_ACCOUNT` (utilisé par `ci.yml` comme `GOOGLE_APPLICATION_CREDENTIALS`)
* Les variables de configuration web (`STAGING_FIREBASE_API_KEY`, `STAGING_FIREBASE_AUTH_DOMAIN`, `STAGING_FIREBASE_PROJECT_ID`, etc.)
* `WORKLOAD_IDENTITY_PROVIDER` (utilisé par `firebase-deploy.yml` pour la prod)
* `SERVICE_ACCOUNT` (utilisé par `firebase-deploy.yml` pour la prod)

## État Cloud Functions
L'audit des rapports passés (ex: `P0-MOBILE-MONEY-018-STAGING-VALIDATION-REPORT.md`, `P0-MOBILE-MONEY-016-MOCK-WEBHOOK-IMPLEMENTATION-REPORT.md`) prouve que les fonctions comme `Campay`, `initiatePayment`, `campayWebhook` et `mockConfirmPayment` **n'ont jamais été déployées par l'agent ou le CI/CD**. 
L'agent a toujours été bloqué par l'erreur `Failed to authenticate`, et s'en est remis à l'instruction : *"Vous pouvez procéder au déploiement des fonctions (`firebase deploy --only functions...`)"*. 
C'est donc le propriétaire du projet (toi) qui exécute manuellement cette commande sur son terminal authentifié.

## Méthode recommandée
Pour éviter les désynchronisations (comme ce fut le cas pour P0-024C avec les règles déployées mais pas la fonction associée), il est fortement recommandé d'**automatiser le déploiement des Cloud Functions via GitHub Actions**.
Il suffirait d'ajouter la commande `npx firebase-tools deploy --only functions --project ecoscolaire-staging --non-interactive` dans le fichier `ci.yml`, juste après le déploiement des Firestore Rules, en utilisant le même Service Account.

## Verdict
DEPLOIEMENT MANUEL
