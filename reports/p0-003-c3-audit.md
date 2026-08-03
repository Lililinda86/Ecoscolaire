# Rapport d'Audit Pré-Déploiement - P0-003-C3 (Cloud Functions)

Ce rapport évalue la préparation du projet au déploiement automatisé des Firebase Cloud Functions via GitHub Actions.

## 📋 Statut Global : 🔴 NO GO (Bloquants identifiés)

Le déploiement tel quel échouera dans la CI à cause de problèmes de configuration, de dépendances manquantes et de permissions GCP.

### 1. Contenu du dossier `functions/`
- **Présents :** `lib/`, `src/`, `package.json`, `tsconfig.json`.
- **Manquants :** `package-lock.json`, `.eslintrc.js` (ou `.eslintrc.json`, bien que `eslint` soit dans les dépendances, sa configuration semble absente si elle n'est pas à la racine).

### 2. & 3. `functions/package.json` et `package-lock.json`
- **Absence du `package-lock.json` :** C'est un point bloquant majeur pour la CI. Sans ce fichier, `npm ci` échouera, et `npm install` n'est pas déterministe (risque de casser la prod lors d'une mise à jour mineure d'un package).

### 4. Version Node.js
- Le `package.json` des fonctions stipule `"node": "22"`.
- **Incohérence :** Le pipeline GitHub Actions actuel utilise `node-version: '20'`. De plus, Node 22 vient tout juste d'être supporté par Firebase. Il est plus prudent et stable d'utiliser Node 20 (`"node": "20"`), qui est la version LTS standard pour Firebase Functions.

### 5. `firebase.json` (Functions Block)
- Le bloc est standard et correct.
- `predeploy` exécute `"npm run lint"` et `"npm run build"`. (Attention : si la configuration ESLint est manquante, le `lint` échouera et bloquera le déploiement).

### 6. Compatibilité Firebase Functions v1 / v2
- **Constat :** Le code utilise **Gen 1** (`functions.https.onCall`, `functions.pubsub.schedule`).
- Les dépendances (`firebase-functions: ^5.0.0`) supportent Gen 2, mais le code ne l'utilise pas.
- **Risque :** Gen 1 est fonctionnel, mais Google pousse vers Gen 2 (Cloud Run). Pour l'instant, c'est compatible, mais il est recommandé de migrer vers Gen 2 (`firebase-functions/v2/https`) pour de meilleures performances et le support prolongé de Node 20+.

### 7. Rôles IAM nécessaires pour GitHub Actions (WIF)
Le compte de service `github-actions-sa` doit posséder les rôles suivants sur Google Cloud :
- `Cloud Functions Admin` (ou Développeur)
- `Service Account User` (pour attacher le compte de service d'exécution aux fonctions)
- **Bloquant potentiel :** Comme il y a une fonction planifiée (`pubsub.schedule`), Firebase va créer un Job Cloud Scheduler. Le compte WIF doit donc aussi avoir : `Cloud Scheduler Admin`.

### 8. Besoin du Plan Blaze
- **Bloquant absolu :** Le déploiement de Cloud Functions Node 10+ et l'utilisation de Cloud Scheduler (pour la fonction quotidienne) exigent que le projet Firebase `ecoscolaire-c5861` soit sur le plan **Pay-as-you-go (Blaze)**. Si le projet est sur le plan Spark gratuit, le déploiement retournera une erreur HTTP 400.

### 9. Risques de déploiement réel
- **Échec CI :** `npm ci` impossible sans `package-lock.json`.
- **Échec Lint :** Le script `lint` peut échouer sans config ESLint locale.
- **Échec IAM :** Manque probable des rôles IAM `Cloud Scheduler Admin` et `Service Account User`.
- **Échec Facturation :** Plan Spark actif.

---

## 🛠️ Plan d’Implémentation Recommandé (C3 en Étapes Sûres)

Si l'objectif est de sécuriser le déploiement C3 sans tout casser, voici le plan d'action recommandé à valider pour la prochaine phase :

1. **Fiabilisation locale :**
   - Rétrograder `"node": "22"` vers `"node": "20"` dans `functions/package.json`.
   - Lancer un `npm install` dans le dossier `functions/` pour générer le `package-lock.json`.
   - Vérifier ou ajouter le fichier `.eslintrc.js` pour que le lint passe.
2. **Infrastructure GCP :**
   - Vérifier l'activation du Plan Blaze sur Firebase.
   - Ajouter les rôles IAM (`Cloud Scheduler Admin`, `Cloud Functions Admin`, `Service Account User`) au compte de service GitHub Actions.
3. **Mise à jour CI/CD (`firebase-deploy.yml`) :**
   - Ajouter une étape pour installer les dépendances des fonctions avant le déploiement :
     ```yaml
     - name: Install Functions Dependencies
       working-directory: ./functions
       run: npm ci
     ```
4. **Déploiement :**
   - Pousser les modifications sur `main`.
   - Surveiller l'action `Deploy Firebase` qui déploiera désormais les règles Firestore + Cloud Functions.
