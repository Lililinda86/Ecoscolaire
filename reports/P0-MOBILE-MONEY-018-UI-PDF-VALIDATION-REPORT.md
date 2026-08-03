# P0-MOBILE-MONEY-018-UI-PDF-VALIDATION-REPORT

## Origine du Bug (Receipts introuvables)
La collection `receipts` était bien chargée dans `AppContext.tsx` (via la liste `collectionsToFetch`). Cependant, aucune règle de sécurité n'avait été définie pour `/receipts/{receiptId}` dans `firestore.rules`.
Par défaut, Firestore rejetait silencieusement la requête de lecture du frontend pour des raisons de permissions (`permission-denied`), renvoyant un tableau vide `[]` au composant.

## Corrections apportées
1. **Mise à jour de `firestore.rules`** : J'ai ajouté la règle de lecture pour la collection `receipts` calquée sur celle des paiements (accessible au superAdmin, owner, director, secretary, accountant et parents pour leur école).
2. **Ajout de logs temporaires** :
   - Dans `Payments.tsx` : un encadré bleu clair s'affichera au-dessus du tableau pour indiquer si `db.receipts` est chargé, sa longueur, le `schoolId` en cours, etc.
   - Dans `ReceiptHistory.tsx` : la console affichera `filteredReceipts length`.
3. **Build Frontend** : Le build Vite a été régénéré avec succès.

## Commit et Hash
Les modifications ont été poussées sur `origin/main`.
Hash exact du commit : `feb29bf`

## Action Requise (Déploiement)
Je n'ai effectué aucun déploiement de Cloud Functions comme demandé. **Cependant**, pour que votre frontend puisse lire les reçus sur Staging, il est IMPÉRATIF de déployer les règles Firestore mises à jour.
Veuillez exécuter dans votre terminal :
```bash
firebase deploy --only firestore:rules --project ecoscolaire-staging
```
Ensuite, relancez simplement votre script :
```bash
node verify-receipts.cjs
```
