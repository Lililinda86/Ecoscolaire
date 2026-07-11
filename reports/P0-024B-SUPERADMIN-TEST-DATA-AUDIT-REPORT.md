# P0-024B-SUPERADMIN-TEST-DATA-AUDIT-REPORT

## Preuves collectées
1. **Audit de code de test** : Analyse du script `tests/p0-024b-live-validation.spec.ts`.
2. **Audit Base de données (Firebase Client SDK)** : Le script `scripts/audit-p0-024b-test-schools.cjs` a confirmé la présence exacte de 7 écoles (dont les 5 de test) dans la base Firestore staging.
3. **Audit UI Playwright (Capture textuelle et visuelle)** : Le script `tests/p0-024b-audit-superadmin-ui.spec.ts` a simulé la connexion SuperAdmin et capturé le contenu du tableau (visible sur `/#/superadmin`).

## Projet Firebase production
La production (`https://ecoscolaire-ghd6.vercel.app`) se connecte bien à la base staging, via les variables d'environnement issues de `.env.staging` injectées au build Vercel.

## Projet Firebase utilisé par le seed
Le script de seeding `scripts/create-p0-024b-test-data.cjs` a utilisé le même projet Firestore (`ecoscolaire-staging`), en utilisant l'authentification client du compte `superadmin.test@ecoscolaire.com`.

## Écoles trouvées en Firestore
L'interrogation directe via le script d'audit a certifié :
- `school-test-starter-199` (ECO TEST STARTER 199)
- `school-test-starter-200` (ECO TEST STARTER 200)
- `school-test-pilot` (ECO TEST PILOT 1000)
- `school-test-standard` (ECO TEST STANDARD 1000)
- `school-test-premium` (ECO TEST PREMIUM)

## Écoles visibles dans UI SuperAdmin
La capture de l'UI Playwright certifie que toutes les écoles sont parfaitement visibles dans l'interface lorsque l'on est sur la bonne route (`/#/superadmin`) :
```text
=== SCHOOLS VISIBLE IN UI ===
ALPHA001 | École Test EcoScolaire Alpha | STARTER ...
BETA002 | École Test EcoScolaire Beta ...
SCHOOL-TEST-PILOT | ECO TEST PILOT 1000 | PILOT | ACTIVE ...
SCHOOL-TEST-PREMIUM | ECO TEST PREMIUM | PREMIUM | ACTIVE ...
SCHOOL-TEST-STANDARD | ECO TEST STANDARD 1000 | STANDARD | ACTIVE ...
SCHOOL-TEST-STARTER-199 | ECO TEST STARTER 199 | STARTER | ACTIVE ...
SCHOOL-TEST-STARTER-200 | ECO TEST STARTER 200 | STARTER | ACTIVE ...
```

## Analyse du mismatch
L'hypothèse précédente incriminant un "Cache PWA / Vercel" était **fausse**. Il n'y a aucun mismatch entre Firebase et le rendu UI du SuperAdmin.

## Cause racine
L'échec rapporté lors de l'exécution précédente provient d'**une erreur dans le code du script E2E Playwright** (`tests/p0-024b-live-validation.spec.ts`), spécifiquement à la ligne 40 :
```typescript
await page.goto('https://ecoscolaire-ghd6.vercel.app/#/dashboard');
```
Le script déviait volontairement la navigation vers la route `/#/dashboard` (réservée au Dashboard d'une école spécifique pour des rôles restreints) au lieu de rester sur la route `/#/superadmin`, causant l'indisponibilité immédiate de la liste des écoles, provoquant un Timeout sur l'assertion de visibilité.

## Correction proposée
Modifier le script de test `tests/p0-024b-live-validation.spec.ts` pour qu'il retourne sur `/#/superadmin` (et non `/#/dashboard`) avant de chercher l'école dans la liste, puis relancer la validation post-déploiement.

## Risques
Aucun risque sur le produit ou les données. Le risque principal est méthodologique (faux positifs de QA dûs à des tests E2E mal routés).

## Verdict
**CAUSE NON IDENTIFIÉE** *(parmi les causes techniques énumérées comme Cache, Firestore, ou Mismatch. Il s'agit d'une erreur humaine dans la conception du script de test)*.
