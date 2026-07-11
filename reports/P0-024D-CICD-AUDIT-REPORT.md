# P0-024D-CICD-AUDIT-REPORT

## État actuel
À ce jour, le pipeline d'intégration et de déploiement continu (CI/CD) gère exclusivement le Front-end et les règles Firestore (`firestore:rules` et index). **Aucune automatisation n'est en place pour les Cloud Functions**, ni sur l'environnement Staging, ni sur l'environnement de Production. C'est l'origine exacte de l'incident P0-024C, où le développeur a déployé les Rules via un `push` mais a oublié/échoué de déployer manuellement la Cloud Function correspondante.

## Workflows détectés
1. **`ci.yml`** : 
   - Déclenché sur `pull_request` et `push` vers `main`.
   - Compile le frontend et exécute les tests Playwright.
   - **Déploie les Firestore Rules vers `ecoscolaire-staging`**.
   - Injecte les données de seed.
2. **`firebase-deploy.yml`** : 
   - Déclenché sur `push` vers `main`.
   - **Déploie les bases de données (Rules et index) vers `ecoscolaire-c5861` (Production)**.
   - Utilise Workload Identity Federation pour l'authentification (hautement sécurisé).

## Secrets détectés
- Staging : `STAGING_FIREBASE_SERVICE_ACCOUNT` (Fichier JSON classique, injecté temporairement).
- Production : `WORKLOAD_IDENTITY_PROVIDER` et `SERVICE_ACCOUNT` (Fédération d'identité OIDC Google Cloud, excellente pratique).
- Variables d'environnement de l'application (clés API, domaine auth, etc.).

## Risques
L'automatisation aveugle des Cloud Functions implique plusieurs dangers majeurs :
- **Risques de suppression de fonctions** : Si une erreur TypeScript silencieuse survient (ex: `lib/index.js` vide) et que Firebase CLI déploie, l'option `--only functions` supprime toutes les fonctions GCP non présentes dans le build.
- **Risques de downtime** : Firebase coupe temporairement la réception du trafic lors du remplacement d'une fonction HTTP. Pousser à chaque `commit` en production engendrerait des micro-coupures de service inutiles.
- **Risques de coût Firebase** : Le build des fonctions via Cloud Build a un coût à chaque exécution. Le faire tourner à chaque push mineur n'est pas économique.
- **Risques de rollback** : GitHub Actions ne permet pas de "rollback" natif. En cas de crash en production, il faut commit un correctif ou "Revert" le PR, puis attendre le temps long du pipeline CI pour que le correctif s'applique.

## Option recommandée
**Option C : Déploiement staging uniquement, puis validation manuelle avant prod.**

C'est le parfait compromis :
- Le workflow `ci.yml` déploie les Rules **ET** les Functions vers `staging`. Ainsi, les tests E2E Playwright tournent toujours sur un environnement 100% synchronisé avec le code source (plus de fausse joie ni de bugs de désynchronisation).
- La production (`firebase-deploy.yml`) continue de déployer uniquement le Frontend et les Rules en auto (pas d'impact sur le runtime Node.js existant). Le déploiement des fonctions en production restera une action ciblée, décidée par le DevOps après validation de la recette Staging (soit en local, soit via un workflow GitHub déclenché par un tag de release type `v1.2.0`).

## Plan d'implémentation
1. **Dans `ci.yml` :**
   - Ajouter une étape d'installation des dépendances (`npm ci`) dans le dossier `functions/`.
   - Ajouter une étape de compilation (`npm run build`) explicite du code TypeScript dans `functions/` avant le déploiement (pour éviter le problème de `$RESOURCE_DIR` sur divers environnements).
   - Modifier l'étape de déploiement de staging pour inclure les fonctions : 
     `npx firebase-tools deploy --only firestore:rules,functions --project ecoscolaire-staging --non-interactive`
2. **Dans `firebase-deploy.yml` :**
   - Ne rien toucher pour le moment. La production reste protégée des déploiements frénétiques de fonctions.

## Verdict
PRÊT POUR IMPLÉMENTATION
