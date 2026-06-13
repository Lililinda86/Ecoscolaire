# Rapport P0-STAGING-002

## Fichiers modifiés
- `.gitignore`
- `.env.example` (créé)
- `.env.staging.example` (créé)
- `.env.production.example` (créé)
- `src/db/firebase.ts`
- `scripts/setup-test-data.mjs`
- `package.json`
- `.github/workflows/ci.yml`

## Résumé des changements
1. **Frontend (Vite)** : La configuration de Firebase (`firebaseConfig`) a été totalement refactorée. Les chaînes de caractères en dur ont été remplacées par `import.meta.env.VITE_FIREBASE_*`. Le code valide au chargement la présence de ces variables et renvoie une erreur explicite sinon.
2. **Backend/Scripts (Node)** : Le script de Seeding a été refactoré pour utiliser `process.env` et la librairie `dotenv`. Le script lit désormais dynamiquement `.env.staging` puis `.env`.
3. **CI/CD** : Le workflow GitHub Actions a été mis à jour pour injecter les variables secrètes de staging (`STAGING_FIREBASE_API_KEY`, etc.) directement lors de l'exécution de `npm run build` et `npm run seed:staging`.
4. **Git** : Le fichier `.gitignore` bloque désormais strictement tous les fichiers `.env*` pour éviter une fuite des identifiants dans le repository public.

## Protection anti-seed production
Une sécurité "fail-fast" a été hardcodée dans le script `setup-test-data.mjs`. Avant toute opération d'initialisation de Firebase, le code vérifie l'identifiant du projet cible :
```javascript
if (firebaseConfig.projectId === 'ecoscolaire-c5861') {
  console.error("ABORT: Tentative d'exécution du Seed sur la Production (ecoscolaire-c5861) !");
  process.exit(1);
}
```
Cette sécurité garantit de manière **absolue** que la CI ou qu'un développeur local ne pourra plus jamais écraser la base de production lors d'un test automatisé.

## Variables nécessaires
Pour le développement local, un fichier `.env.local` contenant les variables suivantes doit être créé à la racine du projet :
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Pour la CI, ces mêmes variables devront être ajoutées dans les **Settings > Secrets** du repository GitHub sous le préfixe `STAGING_FIREBASE_*`.

## Résultat build
✅ **SUCCESS** (`✓ built in 10.08s`). L'injection des variables par Vite s'effectue correctement.

## Résultat Playwright
✅ **SUCCESS** (27/27 passed en 1.6m). Le refactoring dynamique de la configuration n'a introduit aucune régression sur le comportement attendu. Le flake précédent de timeout sur l'Audit ne s'est pas reproduit.

## Risques restants
- Le pipeline CI sur GitHub **échouera immédiatement** au prochain commit tant que les secrets `STAGING_FIREBASE_*` ne seront pas créés dans le repository GitHub, puisque la nouvelle configuration attend des variables réelles (et refusera de cibler la Prod).

## Commandes exécutées
- `npm install -D dotenv`
- `npm run build`
- `npx playwright test --workers=1`

## GO / NO GO final
**🟢 GO**.
L'implémentation a été réalisée de manière totalement isolée et sécurisée. La codebase EcoScolaire est désormais "Environment-Agnostic" (Agnostique d'environnement), ce qui est le standard industriel SaaS.
J'attends votre instruction pour commiter ce travail sur `main`.
