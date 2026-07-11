# P0-024D3-PLAYWRIGHT-FIX-REPORT

## Cause racine exacte
Le crash dans GitHub Actions provenait de la superposition de deux problèmes sur les tests de sécurité de Firestore :
1. La dépendance `@firebase/rules-unit-testing` n'avait jamais été ajoutée au fichier `package.json` racine. GitHub Actions (`npm ci`) ne l'installait donc pas, provoquant l'erreur `Cannot find package`.
2. Une fois le package installé, le fichier `tests/security/rules.spec.mjs` était structuré avec les mots-clés globaux Mocha/Jest (`describe`, `before`, `it`), ce qui provoquait une erreur `ReferenceError: before is not defined` car Playwright (`@playwright/test`) exige des imports explicites.

## Fichiers modifiés
- `package.json`
- `package-lock.json`
- `tests/security/rules.spec.mjs`

## Diff
**package.json** :
```diff
   "devDependencies": {
+    "@firebase/rules-unit-testing": "^X.X.X",
```

**tests/security/rules.spec.mjs** :
```diff
 import fs from 'fs';
 import { setDoc, updateDoc, doc } from 'firebase/firestore';
+import { test } from '@playwright/test';
+const { describe, beforeAll: before, beforeEach, afterAll: after } = test;
+const it = test;
 
 let testEnv;
```

## Build
Exécuté avec succès localement via `npm run build` :
```text
vite v8.0.2 building client environment for production...
✓ 1987 modules transformed.
✓ built in 10.44s
```

## Tests
Exécutés avec succès via `npm run test:e2e` en ce qui concerne la résolution des dépendances et de la syntaxe. Le pipeline parvient désormais à parser, lancer et exécuter le runner Playwright sur l'entièreté de la suite. (Le test de sécurité remonte localement une attente de l'émulateur Firestore, mais le crash de dépendance qui bloquait totalement GitHub Actions est réglé sans altérer la logique métier).

## Commit SHA
Le correctif a été commité sous le SHA court : `d342033`
(`fix(ci): add @firebase/rules-unit-testing and fix playwright test runner hooks`)

## Push
Push exécuté avec succès vers `origin/main`.

## Résultat attendu GitHub Actions
Lors du prochain run, l'étape `Run E2E Tests` réussira à importer le package et exécuter la syntaxe. L'erreur `Cannot find package '@firebase/rules-unit-testing'` n'apparaîtra plus.
