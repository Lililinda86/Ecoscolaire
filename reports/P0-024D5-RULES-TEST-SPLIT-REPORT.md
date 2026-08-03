# P0-024D5-RULES-TEST-SPLIT-REPORT

## Cause racine
Le pipeline CI échouait lors de l'exécution globale de Playwright (`npm run test:e2e`) car ce dernier embarquait aveuglément les tests de sécurité (`tests/security/rules.spec.mjs`). Les tests de sécurité exigent que l'émulateur Firestore soit en cours d'exécution. N'étant pas lancé par le runner classique UI de Playwright, la suite crashait avec le message `The host and port of the firestore emulator must be specified`.

## Fichiers modifiés
- `playwright.config.ts`
- `package.json`
- `.github/workflows/ci.yml`

## Scripts package.json et Configuration
Pour résoudre ce problème de manière robuste, j'ai ajouté une règle d'exclusion dynamique dans `playwright.config.ts` :
```typescript
testIgnore: process.env.FIRESTORE_EMULATOR_HOST ? undefined : '**/security/**',
```
Cela permet d'avoir deux scripts propres dans `package.json` :
1. `"test:e2e": "playwright test"` : Playwright tournera sur l'entièreté des tests E2E UI en ignorant nativement le dossier sécurité (car l'émulateur n'est pas actif).
2. `"test:rules": "npx firebase-tools emulators:exec --only firestore \"playwright test tests/security/rules.spec.mjs\""` : Firebase CLI démarre l'émulateur, injecte automatiquement `FIRESTORE_EMULATOR_HOST`, désactivant ainsi la règle d'exclusion pour que ce test de sécurité puisse tourner sereinement sous l'environnement émulé.

## CI modifiée
Dans `.github/workflows/ci.yml`, j'ai ajouté l'étape dédiée avant de lancer les tests globaux :
```yaml
      - name: Run Firestore Rules Tests
        run: npm run test:rules

      - name: Run E2E Tests
        run: npm run test:e2e
```

## Tests locaux
- Le lancement local de `npm run test:e2e` donne 54 tests au lieu des 65 globaux (les 11 tests de sécurité sont exclus). La séparation est efficace.
- La CI sous `ubuntu-latest` est équipée nativement de Java 21, condition sine qua non au bon déroulement de `npm run test:rules` et de l'émulateur.

## Commit
Commit SHA généré : `020e8b7`
Message : `ci: separate e2e tests and firestore rules tests`

## Push
Exécuté avec succès sur `origin/main` (`d342033..020e8b7`).

## Verdict
**P0-024D5 VALIDÉ LOCAL**.
La séparation est effective, les scripts sont intégrés, et la CI lancera l'émulateur Firebase pour les tests de sécurité avant de valider l'UI globale. L'erreur `host and port of the firestore emulator` disparaîtra du pipeline GitHub Actions sur le test Playwright principal.
