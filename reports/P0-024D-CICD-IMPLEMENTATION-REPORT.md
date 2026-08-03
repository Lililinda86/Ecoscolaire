# P0-024D-CICD-IMPLEMENTATION-REPORT

## Audit rapide
- L'analyse de `.github/workflows/ci.yml` a permis d'identifier l'étape `Deploy Firestore Rules to Staging` qui n'exécutait que la commande `npx firebase-tools deploy --only firestore:rules`.
- Les fichiers `firebase.json` et `functions/package.json` ont été relus pour confirmer que le chemin d'accès aux fonctions était bien `functions/`.

## Fichier modifié
Le fichier `.github/workflows/ci.yml` a été mis à jour via une insertion ciblée (sans modifier le reste du fichier ni les variables d'environnement). 
Les commandes ajoutées :
```bash
cd functions
npm ci
npm run build
cd ..
npx firebase-tools deploy --only firestore:rules,functions --project ecoscolaire-staging --non-interactive
```

## Build
Le build local du Frontend (`npm run build`) et le build des fonctions TypeScript (`cd functions && npm ci && npm run build`) ont été exécutés avec succès. L'application compile parfaitement.

## Tests
Les tests Playwright sur les limites SaaS (`npx playwright test tests/p0-024b-student-limit.spec.ts`) ont été exécutés : **13 tests réussis sur 13 en 2.5 secondes**.

## QA Git
Les commandes `git diff` et `git status` ont certifié que le seul fichier modifié et préparé pour l'envoi était bien `.github/workflows/ci.yml`.

## Commit
Le code a été scellé avec le message : `ci(firebase): deploy functions to staging` (commit SHA `1536b31`).

## Push
Le push a été envoyé avec succès vers la branche distante `main` sur le dépôt d'origine (Origin).

## GitHub Actions
Le workflow de CI a été déclenché sur les serveurs de GitHub suite au push. Cependant, l'outil en ligne de commande GitHub CLI (`gh`) n'étant pas installé sur le terminal local, il m'est impossible d'interroger l'API distante pour lire la validation finale du workflow (Success/Failure). 

## Bugs
Aucun bug technique lors de l'implémentation. Le code YAML a été correctement injecté.

## Risques
Le seul risque potentiel est une erreur imprévue dans l'environnement Ubuntu de GitHub Actions lors de l'étape `npm ci` dans le dossier `functions/` (ex: si une dépendance manque), ce qui ferait échouer l'étape de déploiement Firebase. Le workflow est toutefois réversible et isolé sur Staging.

## Verdict
P0-024D CODÉ MAIS NON VALIDÉ CI

L'implémentation respecte l'ensemble des contraintes, mais nécessite une vérification manuelle de votre part dans l'onglet "Actions" de votre dépôt GitHub pour confirmer le passage au vert du pipeline.
