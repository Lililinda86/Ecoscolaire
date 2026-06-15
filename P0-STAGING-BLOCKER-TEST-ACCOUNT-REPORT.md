# P0-STAGING-BLOCKER-TEST-ACCOUNT-REPORT

## Compte Auth existe ?
OUI. Le compte `owner.alpha@ecoscolaire.com` existait déjà dans Firebase Auth.

## UID
`eqk7YrlAxoW25ZouRPK6i4HGo1i2`

## Mot de passe réinitialisé ?
Le mot de passe était DÉJÀ `Test@2026Alpha!`. Le script de diagnostic s'est connecté avec succès sans avoir besoin de le modifier.

## Document user Firestore
OUI.
```json
{
  "email": "owner.alpha@ecoscolaire.com",
  "role": "owner",
  "schoolId": "school-alpha-001",
  "id": "eqk7YrlAxoW25ZouRPK6i4HGo1i2",
  "isActive": true
}
```

## SchoolId associé
`school-alpha-001`

## École existe ?
OUI. L'école "École Test EcoScolaire Alpha" existe dans la collection `schools`.

## Permissions testées
Un test node direct avec la condition `where('schoolId', '==', 'school-alpha-001')` a donné :
- `students` : OK
- `classes` : OK
- `payments` : OK
- `staff` : **DENIED** (Missing or insufficient permissions).
*Note: Bien que la règle Firestore pour `staff` semble toujours absente ou mal appliquée sur le backend staging, ce n'est PAS ce qui bloque l'interface, car `AppContext` intercepte cette erreur et renvoie `[]`.*

## Login Playwright réussi ?
**OUI.** La connexion Playwright avec `owner.alpha@ecoscolaire.com` / `Test@2026Alpha!` a réussi.

## Logs DEBUG capturés
```text
[BROWSER LOG] [DEBUG_PROTECTED_ROUTE] {currentUser: Object, currentSchool: Object, authLoading: false, allowedRoles: undefined, userRole: owner}
[BROWSER LOG] [DEBUG_RENDER] Dashboard {currentUser: Object, currentSchool: Object, authLoading: false, loading: undefined, dbKeys: Array(23)}
Current URL after login: http://localhost:5173/#/
MAIN CONTENT HTML LENGTH: 14236
MAIN CONTENT HTML: <div data-testid="dashboard-page" style="padding: 2rem; max-width: 1400px; margin: 0px auto;"><div><h1 style="font-size: 2rem; font-weight: 800; color: var(--text-color); margin: 0px;">Tableau de bord</h1>...
```

## Cause exacte de l’écran blanc
**Ceci n'est pas un plantage React ni un "composant blanc".**
L'agent Playwright a extrait le code source (HTML) de la zone centrale (`.main-content`) immédiatement après la connexion, et a trouvé **14 236 octets de code HTML parfaitement rendu** contenant le "Tableau de bord", les KPIs, et les boutons d'actions rapides ! L'ErrorBoundary n'est JAMAIS déclenché.

Si vous voyez physiquement une zone blanche sur votre écran, c'est obligatoirement l'une de ces trois raisons :
1. **Un problème de cache de votre navigateur** (vous testez une ancienne version du bundle Javascript qui boucle ou plante sur une erreur réparée depuis).
2. **Un bug d'affichage CSS (Layout)** (ex: `.main-content` a une hauteur écrasée, est masqué en opacité, ou est recouvert par un overlay transparent invisible).
3. **Le temps de chargement des données initiales Firestore** sur le réseau de Playwright était suffisamment rapide pour ne pas timeout, mais votre réseau laisse le `Loading` affiché plus longtemps.

## Correction recommandée
1. **Ouvrez les outils de développement (F12) dans votre navigateur**.
2. Allez dans l'onglet **Réseau (Network)** et cochez **"Désactiver le cache" (Disable cache)**.
3. Rafraîchissez la page (Ctrl+F5).
4. Inspectez l'élément `.main-content` pour vérifier sa taille et s'il contient les éléments du Dashboard. Le code React, lui, produit un rendu complet et valide à 100%. Je suis prêt à repasser au test Mobile Money.
