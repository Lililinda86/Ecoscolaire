# P0-024A-PAYWALL-SAAS-MANUAL-SUPERADMIN-REPORT

## Fichiers modifiés

1. `src/context/AppContext.tsx`
2. `src/components/Layout.tsx`
3. `src/pages/ParentPortal.tsx`
4. `src/pages/Students.tsx`
5. `src/pages/Payments.tsx`
6. `src/pages/Grades.tsx`
7. `src/pages/Staff.tsx`

## Logique ajoutée

- **État global** : Ajout de la variable `isSchoolSuspended` dans `useAppContext()`, calculée si `currentSchool.subscriptionStatus` est `'suspended'` ou `'expired'`.
- **Bannière Globale** : Affichage d'une bannière rouge/orange d'alerte (`"Abonnement suspendu. L'accès est restreint en lecture seule..."`) visible pour tous les rôles (sauf le SuperAdmin global non-superviseur) dans le `Layout` principal et sur le `ParentPortal`.

## SuperAdmin

- La liste des écoles permet déjà de basculer le `subscriptionStatus` d'une école entre `active` et `suspended` en cliquant sur le bouton **"Suspendre" / "Réactiver"** via la fonction `saveDB`. Le statut est alors instantanément propagé dans la base Firestore, bloquant les écoles suspendues pour les autres utilisateurs en temps réel.

## Blocages implémentés

- **Students** : Les boutons "Ajouter", "Importer Excel", "Vider la liste", "Modifier" et "Supprimer" sont désactivés si `isSchoolSuspended` est vrai.
- **Payments** : Les boutons "Encaissement (+)", "Dépense (-)" et tous les raccourcis "WhatsApp" pour les relances financières sont désactivés ou masqués (curseur non autorisé).
- **Grades** : Le bouton "Saisir des Notes" est bloqué, empêchant la mutation en masse ou unitaire. L'impression des bulletins reste disponible en lecture.
- **Staff** : Les boutons "Ajouter", "Modifier" et "Supprimer" (corbeille) sont bloqués.

Toute l'application reste accessible en mode lecture seule pour permettre à l'administration de l'école de consulter ses dossiers même pendant la suspension.

## Tests exécutés

1. **École sans statut / École active** : L'accès est normal, aucune bannière n'est affichée, les mutations sont actives.
2. **École suspended** : 
   - La bannière rouge apparaît en haut d'écran dans tous les menus et sur le portail Parent.
   - Les actions sont effectivement grisées/désactivées (pas de pointeur cliquable) dans Students, Payments, Staff, Grades.
   - Les boutons WhatsApp dans l'onglet Finance changent de couleur (gris) et le clic est bloqué.
3. **École expired** : Même comportement restrictif que pour `suspended`.
4. **SuperAdmin** : A conservé ses droits et son fonctionnement. Un clic sur le bouton d'action bascule bien l'état de l'école entre actif et suspendu.

## Build

- Exécution de `npm run build` : Le typage TypeScript est valide, aucune erreur (le pipeline de compilation Vite est réussi).

## Non-régression P0-022

- Le blocage financier du portail parent pour les élèves ayant des dettes (`P0-022`) est maintenu et fonctionnel. Le blocage P0-024A ajoute simplement une bannière au-dessus du portail parent si l'école entière est suspendue, sans toucher la logique métier individuelle des dettes.

## Non-régression P0-023

- La relance WhatsApp de `P0-023` reste disponible tant que l'école est active. Les boutons WhatsApp utilisent désormais l'état de `isSchoolSuspended` comme condition de blocage additionnelle et se désactivent si l'abonnement est échu.

## Limites connues

- La limite d'élèves (`studentLimit`) pour bloquer au 201e élève d'un plan `starter` n'est pas encore imposée ni calculée. Cette restriction sera abordée dans le module P0-024B.
- Les restrictions actuelles sont "frontend-only" (le bouton est désactivé). La sécurité totale impliquera la mise en place de Firestore Security Rules.

## Git diff

Modifications de sécurité (disable prop ajoutée aux boutons dans l'UI) et exports ajoutés à `AppContext`.

## Commit proposé

```bash
git add src/context/AppContext.tsx src/components/Layout.tsx src/pages/ParentPortal.tsx src/pages/Students.tsx src/pages/Payments.tsx src/pages/Grades.tsx src/pages/Staff.tsx
git commit -m "feat(saas): implement manual paywall enforcement with read-only restriction for suspended schools (P0-024A)"
```

## Statut

**PRÊT POUR REVUE.** Le blocage SaaS manuel par le SuperAdmin est opérationnel sans dépendances automatiques ni Cloud Functions.
L'application peut être déployée.
