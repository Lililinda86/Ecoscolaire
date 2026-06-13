# Rapport P0-STAGING-001 (Audit Environnement Staging)

## État actuel
Actuellement, **le projet ne possède aucun environnement de Staging isolé**. Le projet Firebase `ecoscolaire-c5861` sert à la fois d'environnement de développement, de CI (intégration continue) et de production. 
La configuration Firebase est **hardcodée en dur** dans le code source (`src/db/firebase.ts` et `scripts/setup-test-data.mjs`).

## Fichiers concernés
Les fichiers majeurs qui empêchent actuellement la séparation d'environnements :
- `src/db/firebase.ts` (Config hardcodée).
- `scripts/setup-test-data.mjs` (Config hardcodée).
- `.github/workflows/ci.yml` (Exécute le seeding et Playwright directement contre la Prod).
- `.github/workflows/firebase-deploy.yml` (Déploie automatiquement la Prod sans filet de sécurité).

## Variables d’environnement nécessaires
Pour dynamiser l'application, nous devrons utiliser `dotenv` (pour les scripts Node) et `import.meta.env` (pour Vite), avec les variables suivantes :
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

## Risques actuels
🔴 **CRITIQUES** :
1. **Corruption des données de Production** : À chaque `push` sur la branche `main` (ou Pull Request), le script `setup-test-data.mjs` détruit les données des écoles de test et les recrée. Un simple bug dans la requête de suppression (`deleteDoc`) pourrait effacer l'intégralité de la base de production.
2. **Pollution de la Base** : Firebase Auth (de Prod) contient actuellement 25+ comptes factices (`owner.alpha`, etc.), qui sont mélangés avec de potentiels vrais clients.
3. **Paiements (Campay)** : Si nous déployons les Cloud Functions de paiement sur ce projet unique, les tests E2E interagiront directement avec le webhook de production, risquant de fausser la comptabilité.

## Architecture staging recommandée
Créer un projet Firebase distinct (ex: `ecoscolaire-staging`) et utiliser des fichiers `.env` :
- `.env.production` (clés de `ecoscolaire-c5861`)
- `.env.staging` (clés de `ecoscolaire-staging`)
- `.env.local` (pour le développement local dirigé vers staging)

## GitHub Actions recommandées
- **`ci.yml`** : Doit se connecter *exclusivement* au projet Staging. Injection des secrets Staging via GitHub Secrets.
- **Déploiement Firebase** : Protéger la branche `main`. Ne déployer les règles/fonctions sur la Production qu'après validation manuelle (Release ou environment protection).

## Vercel recommandé
Vercel gère nativement le staging :
- **Preview Deployments** : Vercel déploiera chaque branche/PR avec les variables d'environnement pointant vers `ecoscolaire-staging`.
- **Production Deployment** : Uniquement la branche `main` sera buildée avec les variables pointant vers `ecoscolaire-c5861`.

## Firebase recommandé
- Cloner la structure (Auth, Firestore, Storage).
- Appliquer rigoureusement les mêmes `firestore.rules` et `storage.rules` sur les deux environnements via Firebase CLI.
- (Optionnel) : Le plan Blaze sur Staging peut rester à $0 car le trafic sera minime.

## Playwright recommandé
Les tests Playwright ne subiront aucune modification de code (`playwright.config.ts` reste intact). Ils tourneront simplement contre le serveur local Vite démarré avec les variables Staging, isolant ainsi totalement les tests de la Prod.

## Seed recommandé
Le script `setup-test-data.mjs` devra lire le `projectId` depuis les variables d'environnement. 
**Sécurité bloquante recommandée** :
```javascript
if (process.env.FIREBASE_PROJECT_ID === 'ecoscolaire-c5861') {
  throw new Error("ABORT: Tentative suicidaire d'exécution du Seed sur la Production !");
}
```

## Plan de mise en œuvre
1. **Création GCP/Firebase** : L'Admin crée manuellement le projet Firebase `ecoscolaire-staging` et récupère les clés Web.
2. **Refactoring Codebase** : Remplacer l'objet `firebaseConfig` dur par des variables d'environnement dans React et Node.
3. **CI/CD** : Configurer les secrets GitHub et Vercel.
4. **Validation** : Exécuter la nouvelle CI. Constater que la base de Staging est peuplée, et que la Prod reste vierge.

## GO / NO GO
**🟢 GO (Urgent).** 
L'implémentation de cet environnement séparé est une étape incontournable. C'est un suicide DevOps de brancher la logique de facturation SaaS et les webhooks Mobile Money sur une base unique où tourne le CI E2E destructif. Ce chantier doit être priorisé avant tout autre développement de Cloud Functions.
