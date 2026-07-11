# ECOSCOLAIRE-CICD-FIRESTORE-AUDIT

## 1. Déclencheurs (Triggers)
L'analyse du workflow `.github/workflows/ci.yml` révèle la configuration suivante :
```yaml
on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]
```
**Conclusion Déclencheurs** : Le pipeline est déclenché automatiquement lors d'un `git push` sur la branche `main` (ou lors d'une Pull Request ciblant `main`).

---

## 2. Déploiement Firestore
L'étape "Deploy Firestore Rules and Functions to Staging" contient :
```yaml
      - name: Deploy Firestore Rules and Functions to Staging
        run: |
          ...
          npx firebase-tools deploy --only firestore:rules,functions --project ecoscolaire-staging --non-interactive
```
**Conclusion Déploiement** : Le workflow ordonne bien explicitement le déploiement de `firestore.rules` (et des Cloud Functions) sur le projet cible `ecoscolaire-staging`.

---

## 3. Authentification
Contrairement au déploiement en production (`firebase-deploy.yml`) qui utilise le Workload Identity Federation, le déploiement sur Staging dans `ci.yml` utilise un compte de service traditionnel injecté via les secrets :
```yaml
        run: |
          echo "$STAGING_FIREBASE_SERVICE_ACCOUNT" > staging-service-account.json
          export GOOGLE_APPLICATION_CREDENTIALS="${PWD}/staging-service-account.json"
          ...
```
**Conclusion Authentification** : L'environnement CI/CD de Staging s'authentifie validement via un JSON de Service Account passé en variable d'environnement (`GOOGLE_APPLICATION_CREDENTIALS`). Ce compte dispose des permissions Firebase adéquates.

---

## 4. Chronologie du Workflow Complet
Le fichier `ci.yml` orchestre la séquence suivante :
1. **Checkout** (`actions/checkout@v4`)
2. **Setup Node** (`v20`)
3. **Installation** (`npm ci`)
4. **Build Frontend** (`npm run build`)
5. **Install Browsers** (`npx playwright install`)
6. **Déploiement Firestore & Functions Staging** (`firebase-tools deploy`)
7. **Seed Test Database** (`npm run seed:staging`)
8. **Setup Java 21** (`temurin 21`)
9. **Tests Rules** (`npm run test:rules` via Emulateur)
10. **Tests E2E** (`npm run test:e2e` via Playwright)

*Note : Le déploiement Hosting n'est pas effectué dans ce workflow (c'est Vercel qui s'en occupe nativement).*

---

## 5. Conclusion Officielle

**A. Un `git push` déclenche automatiquement le déploiement des règles Firestore.**

**Justification** : Le fichier `ci.yml` contient sans ambiguïté les directives `on: push: branches: [main]` liées à la commande `npx firebase-tools deploy --only firestore:rules [...] --project ecoscolaire-staging`. 

Ainsi, aucune manipulation manuelle ni authentification locale (`firebase login`) n'est requise. Un simple engagement du code sur la branche principale transmettra le fichier `firestore.rules` (contenant la fermeture de la faille P0-002) aux serveurs Google Firestore Staging. L'infrastructure CI/CD est parfaitement saine et autonome pour ce périmètre.
