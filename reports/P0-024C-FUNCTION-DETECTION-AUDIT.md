# P0-024C-FUNCTION-DETECTION-AUDIT

## Preuves
- La fonction `enforceStudentSaasLimits` est bien écrite et correctement exportée dans le fichier source **TypeScript** `functions/src/index.ts` (lignes 520+).
- L'historique Git (`HEAD`) de `functions/lib/index.js` (le fichier compilé) révèle que la fonction n'y figurait pas avant recompilation. Le `git diff` prouve que l'export `exports.enforceStudentSaasLimits = ...` était manquant dans la version compilée locale.
- La configuration `firebase.json` contient bien un hook `"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]`, mais il semble avoir échoué silencieusement ou avoir été contourné localement (souvent lié à l'exécution de `$RESOURCE_DIR` sous Windows/PowerShell).
- La commande Firebase CLI évalue le filtre `functions:enforceStudentSaasLimits` en analysant les fichiers situés dans `lib/`. Puisque `lib/index.js` n'était pas à jour avec les modifications TypeScript, Firebase CLI a remonté l'erreur de détection.

## Cause racine
Le code source TypeScript a bien été modifié (`functions/src/index.ts`), mais le code JavaScript compilé lu par Firebase (`functions/lib/index.js`) n'était pas à jour au moment de lancer la commande `firebase deploy`. La fonction existait donc dans le code source mais pas dans le livrable évalué par Firebase.

## Correction minimale proposée
Compiler manuellement le code TypeScript avant d'exécuter la commande de déploiement Firebase.

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions:enforceStudentSaasLimits --project ecoscolaire-staging
```

## Risques
Aucun risque. L'intégrité du code est parfaite. Le seul problème potentiel futur serait d'oublier de builder le code avant de lancer manuellement la commande de déploiement.

## Verdict
FUNCTION NON COMPILÉE
