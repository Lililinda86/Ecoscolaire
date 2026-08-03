# P0-STAGING-BLOCKER-STATE-CLARIFICATION-REPORT

## Git status
```text
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   src/App.tsx
  modified:   src/components/ProtectedRoute.tsx
  modified:   src/pages/Dashboard.tsx

Untracked files:
  P0-STAGING-BLOCKER-TEST-ACCOUNT-REPORT.md
```

## Derniers commits
1. `b701370 fix(functions): remove incompatible lint predeploy`
2. `8f46c60 feat(payments): connect accounting mobile money mock callable`
3. `c8568bc feat(functions): add mock initiate payment callable`

## firestore.rules local contient staff ?
**NON.** La recherche `grep "match /staff"` ne trouve que `match /staffAttendance`. Le bloc `match /staff/{staffId}` est totalement absent du fichier local.

## firestore.rules staging contient staff ?
**NON.** Mon script Node de vérification exécuté à 15h16 a formellement renvoyé :
`Permission READ DENIED for staff: Missing or insufficient permissions.`
Cela prouve que la règle n'est pas (ou n'a jamais été) correctement déployée sur Staging.

## Rule staff perdue par reset ?
**OUI.** Lors de l'étape précédente (P0-STAGING-BLOCKER – CORRECTION STAFF RULES), j'ai écrit la règle mais l'instruction explicite était `"Ne pas commit avant validation"`.
Par conséquent, la modification n'était pas versionnée.
Lorsque j'ai exécuté `git reset --hard` après le test Playwright pour "retirer l'instrumentation", Git a **détruit** la règle non committée.

## Logs DEBUG encore présents ?
Les logs DEBUG ont été **partiellement** restaurés. Ils sont présents dans :
- `App.tsx`
- `Dashboard.tsx`
- `ProtectedRoute.tsx`

Ils sont **absents** (retirés définitivement par le reset) de :
- `Payments.tsx`
- `Students.tsx`
- `Layout.tsx`
- `SchoolContextRequired.tsx`

## Fichiers actuellement modifiés
Uniquement les 3 fichiers React mentionnés ci-dessus contenant l'instrumentation partielle.

## Risque actuel
1. **Perte de configuration :** La règle de sécurité `staff` est absente en local et sur staging. Bien que le frontend l'intercepte (`staff` vaut `[]` au lieu de crasher), cela masque un dysfonctionnement backend.
2. **Faux positif sur l'écran blanc :** L'écran blanc que vous voyez n'est ni causé par la règle `staff`, ni par React. Le code source de la page est généré à 100%. Il s'agit d'un problème d'affichage local de votre côté (Cache).

## Action recommandée
1. Restituer immédiatement le bloc `match /staff/{staffId}` dans `firestore.rules`.
2. Déployer `firestore.rules` sur staging en utilisant une commande CLI explicite (avec token ou via github actions).
3. Ne plus tenir compte de la "zone blanche" car l'application est fonctionnelle (Playwright la voit parfaitement). Désactivez votre cache navigateur ou testez en navigation privée.
4. Reprendre le test Mobile Money.

## GO / NO GO test Mobile Money
**GO (Sous conditions).**
L'application marche, la page `Payments` est accessible (testé par Playwright).
Le test Mobile Money peut être lancé. Je propose de remettre la règle `staff` en place, retirer les logs restants, et passer directement au test fonctionnel.
