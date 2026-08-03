# P0-MOBILE-MONEY-019-FINANCE-DASHBOARD-REPORT

## Fichiers modifiés
- `[NEW] src/components/FinanceDashboard.tsx` : Composant principal du tableau de bord affichant les KPIs, avec sélection de période (Aujourd'hui, 7 jours, 30 jours) et bouton d'export CSV.
- `[NEW] src/components/ReceiptAudit.tsx` : Composant dédié à l'audit comptable et la détection d'anomalies de réconciliation.
- `[MODIFY] src/pages/Payments.tsx` : Ajout de l'onglet `Finance Mobile Money` et intégration du composant `FinanceDashboard`. Accessible uniquement aux rôles administratifs (superAdmin, owner, director, accountant).
- `[NEW] verify-finance-dashboard.cjs` : Script E2E Playwright pour tester les KPIs, l'Audit et l'Export CSV.

## KPI
Les KPI suivants ont été implémentés avec filtrage dynamique par période :
- **Total Encaissé CASH** (basé sur les paiements locaux)
- **Total Encaissé Mobile Money**
- **Transactions SUCCESS, PENDING, FAILED** (issues de l'API Campay)
- **Reçus Générés** (issues de la collection `receipts`)

## Contrôles comptables
L'audit croise automatiquement `db.payments`, `db.transactions` et `db.receipts` pour remonter 4 types d'alertes :
1. **Paiement SUCCESS sans reçu** (Avertissement)
2. **Reçu sans paiement** (Avertissement)
3. **Doublon receiptNumber** (Critique)
4. **Paiement SUCCESS sans schoolId** (Critique)
Le résultat est un tableau affiché en bas du Dashboard, qui affiche "Aucune anomalie comptable détectée" si la base est intègre.

## Export CSV
Une fonction native (sans librairie externe) permet de télécharger au clic un fichier CSV (`finance_export_<period>.csv`) contenant :
`Date, Élève, Classe, Montant, Méthode, Transaction ID, Numéro Reçu, Statut`

## Tests
Le script `verify-finance-dashboard.cjs` se connecte en tant que `owner`, navigue vers l'onglet Finance, vérifie la présence de tous les KPIs, du bloc d'audit, et intercepte le téléchargement du fichier CSV pour confirmer son bon fonctionnement. Le test passe avec succès.

## Build
Le build `npm run build` a été exécuté. Le résultat est vert (sans erreurs TypeScript ni Vite).

## GO / NO GO STAGING
Les modifications sont disponibles sur la branche `main`.
Hash exact du commit : **`d4c9e6f`**

> [!TIP]
> **GO STAGING accordé de mon côté.** Vous pouvez lancer un `git pull origin main` et tester directement sur votre environnement staging. Aucun déploiement Cloud Functions n'a été fait et aucun appel Firestore additionnel n'a été ajouté au frontend.
