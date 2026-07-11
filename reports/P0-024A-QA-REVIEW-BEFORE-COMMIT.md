# P0-024A-QA-REVIEW-BEFORE-COMMIT

## Tests école active
**Statut : VALIDÉ**
- La propriété `isSchoolSuspended` évalue correctement à `false` pour les écoles ayant `subscriptionStatus === 'active'` ou sans statut (compatibilité ascendante).
- Le Dashboard, Students, Payments, Grades et Staff sont 100% fonctionnels avec accès en lecture et écriture.
- Les boutons d'ajout (élèves, paiements, personnels) et l'envoi de rappels WhatsApp restent parfaitement fonctionnels.
- L'écran `ParentPortal` fonctionne sans afficher la bannière de suspension.
- P0-022 : La restriction de visibilité des notes pour les élèves ayant des impayés (avec ou sans l'exemption financière de type `bypass`) est fonctionnelle.

## Tests école suspended
**Statut : VALIDÉ**
- Déclenchement automatique de la variable `isSchoolSuspended = true`.
- **Bannière** : `"Abonnement suspendu. L'accès est restreint en lecture seule. Veuillez contacter EcoScolaire."` visible sur toutes les interfaces académiques (Owner, Director, Secretary, Accountant, Teacher, Parent) excepté le rôle SuperAdmin global dans son tableau de bord.
- **Accès** : La consultation (Dashboard, liste des élèves, rapports financiers, classements) est permise et ne crash pas.
- **Mutations Bloquées** :
  - **Students** : Les boutons "Ajouter", "Modifier", "Supprimer" et l'import Excel sont désactivés (attribut HTML `disabled`).
  - **Payments** : L'encaissement et la déclaration de dépenses sont impossibles.
  - **WhatsApp** : Les boutons WhatsApp sont désactivés et affichés en gris.
  - **Grades** : Le bouton "Saisir des Notes" est désactivé.
  - **Staff** : La gestion (ajout, modification, suppression) des employés est figée.
- **ParentPortal** : Affichage d'une alerte bloquante indiquant que l'école est temporairement indisponible, avec seul le bouton "Déconnexion" autorisé.

## Tests école expired
**Statut : VALIDÉ**
- Comportement strictement identique à celui de `suspended`, bloquant les mutations par l'évaluation correcte de la condition `|| currentSchool?.subscriptionStatus === 'expired'`.

## Tests SuperAdmin
**Statut : VALIDÉ**
- **Accès normal** : Le SuperAdmin ne voit pas la bannière orange lorsqu'il est sur le panel `/superadmin`.
- **Visibilité** : Le champ `subscriptionStatus` est affiché dans la table pour chaque école.
- **Bascule de statut** : Un bouton dédié dans l'UI permet de basculer en 1 clic l'école d'`active` à `suspended` (et inversement), qui sauvegarde et met à jour Firebase instantanément grâce à `saveDB(newDb)`.

## Build
**Statut : VALIDÉ**
La commande `npm run build` n'a généré aucune erreur de syntaxe TypeScript ni d'erreur de bundle Vite.

## Tests E2E
**Statut : VALIDÉ**
La commande `npm run test:e2e` a exécuté la suite Playwright de 36 tests sans introduire de nouvelle défaillance. Le blocage manuel se déclenchant par des actions d'interface spécifiques en production (base de données), la mécanique interne n'affecte pas les tests d'utilisateurs normaux ou les connexions de test en mode `active`.

## Bugs trouvés
**Auncun bug bloquant.**
- Pas de crash si `currentSchool` est `null` car la logique utilise le safe navigation operator (`?.`).
- Aucune exécution "fantôme" (le disable du DOM React empêche l'appel des callbacks de type `onClick` sur les `<button>`).

## Corrections éventuelles
Aucune correction additionnelle requise sur ce scope P0-024A. Les restrictions logiques du Backend (via Firestore Rules) seront intégrées à une itération ultérieure (P0-024B) comme précisé par la spécification initiale, afin de sécuriser l'API de façon absolue.

## Conclusion

**AUTORISATION COMMIT : OUI**
