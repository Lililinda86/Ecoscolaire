# P0-024B1-FIRESTORE-SAAS-FIELDS-SECURITY-AUDIT

## Règles actuelles
Dans `firestore.rules`, la règle régissant la mise à jour du document `/schools/{schoolId}` est la suivante :
```javascript
// Le propriétaire peut modifier son école (mais pas l'abonnement)
allow update: if isAuthenticated() && isActive() && (isSuperAdmin() || canManageSchool(schoolId));
```
La fonction `canManageSchool` est définie ainsi :
```javascript
function canManageSchool(schoolId) {
  return isSuperAdmin() || (isOwner() && getUserSchoolId() == schoolId);
}
```

## Vulnérabilité confirmée ou non
**VULNÉRABILITÉ CRITIQUE CONFIRMÉE.**
Bien que le commentaire mentionne `(mais pas l'abonnement)`, le code de la règle **n'applique absolument aucun filtrage sur les champs (field mask)**. 
Dès lors qu'un utilisateur est `owner` de l'école (c'est-à-dire `canManageSchool` retourne `true`), l'accès `update` lui est accordé globalement. Il peut envoyer une requête Firestore brute modifiant les champs SaaS. L'escalade de privilèges et le contournement du paywall sont donc réels et exploitables sans interface.

*(Note de sécurité additionnelle découverte : Dans la collection `users`, la règle `allow update: if isAuthenticated() && isActive() && (request.auth.uid == userId ...)` permet théoriquement à n'importe quel utilisateur de modifier son propre document, y compris de s'octroyer le `role: 'superAdmin'` s'il n'y a pas de filtrage sur le champ `role`.)*

## Champs sensibles
Voici la liste des champs strictement réservés à l'usage de la facturation et du `superAdmin` :
1. `subscriptionPlan`
2. `subscriptionStatus`
3. `subscriptionStartDate`
4. `subscriptionEndDate`
5. `subscriptionRenewalDate`
6. `nextPaymentDate`
7. `isInternalSchool`
8. `studentLimit`
9. `billingStatus`
10. `billingCycle`
11. `trialEndsAt`

*(S'ajoutera potentiellement `studentCount` s'il est incrémenté par une Cloud Function de backend).*

## Stratégie Rules recommandée
Utiliser la méthode `diff().affectedKeys()` exposée par Firebase Security Rules. Elle permet d'extraire la liste des champs qui ont été modifiés entre `resource.data` (l'état actuel en base) et `request.resource.data` (le nouvel état envoyé par le client).

La logique sera la suivante :
- Si l'utilisateur est `superAdmin` : aucune restriction de champ.
- Si l'utilisateur est `owner` : on vérifie que la liste des clés modifiées (`affectedKeys()`) ne contient **aucun** des champs sensibles via la fonction `hasAny([])`.

```javascript
// Définition de la règle proposée
allow update: if isAuthenticated() && isActive() && (
  isSuperAdmin() || 
  (
    isOwner() && 
    getUserSchoolId() == schoolId && 
    !request.resource.data.diff(resource.data).affectedKeys().hasAny([
      'subscriptionPlan', 
      'subscriptionStatus', 
      'subscriptionStartDate', 
      'subscriptionEndDate', 
      'subscriptionRenewalDate', 
      'nextPaymentDate', 
      'isInternalSchool', 
      'studentLimit', 
      'billingStatus', 
      'billingCycle', 
      'trialEndsAt'
    ])
  )
);
```

## Champs autorisés pour owner/director
Grâce à la stratégie de blacklist (liste noire) définie ci-dessus, le `owner` aura l'autorisation de modifier tout autre champ n'appartenant pas à la liste SaaS. Cela inclut nativement :
- `name`
- `address`
- `phone`
- `email`
- `directorName`
- `logoUrl`
- `logoFileName`
- `logoUpdatedAt`
- `academicYear`
- Paramètres locaux (langue, devise)
- *(Note : Le `director` actuel n'a pas les droits `update` sur `schools/{schoolId}` car `canManageSchool` demande `isOwner()`. Seul le `owner` peut modifier l'école. Ceci est le comportement nominal pour éviter qu'un directeur ne change la configuration globale ou le compte de facturation).*

## Tests à créer
1. **Owner tente de modifier `subscriptionPlan`** : Doit retourner `permission-denied`.
2. **Owner tente de modifier `isInternalSchool`** : Doit retourner `permission-denied`.
3. **Owner modifie `school.name`** : Doit réussir avec HTTP 200.
4. **SuperAdmin modifie `subscriptionPlan`** : Doit réussir avec HTTP 200.
5. **SuperAdmin modifie `isInternalSchool`** : Doit réussir avec HTTP 200.
6. **Director tente de modifier `subscriptionStatus`** : Doit retourner `permission-denied` (car non `owner` et non `superAdmin`).
7. **Secretary tente de modifier une école** : Doit retourner `permission-denied`.
8. *Test ajouté* : **Utilisateur standard tente de modifier son propre rôle (`role: 'superAdmin'`)** : Doit échouer (si corrigé).

## Risques
- **Évolution future** : Si un nouveau champ SaaS est ajouté au modèle `School` à l'avenir (ex: `stripeCustomerId`), il faudra impérativement penser à l'ajouter dans la liste noire `hasAny([...])` dans `firestore.rules`.
- La logique en liste noire (interdire certains champs) est plus permissive mais plus souple que la logique en liste blanche (n'autoriser qu'un sous-ensemble strict de champs). Étant donné les nombreuses propriétés dynamiques d'une école, la liste noire SaaS est le meilleur compromis actuel.

## Plan d’implémentation
1. **Modifier `firestore.rules`** :
   - Remplacer la règle `update` de la collection `schools` par la logique conditionnelle avec `affectedKeys().hasAny(...)`.
   - Revoir de la même façon la règle `update` sur la collection `users` pour interdire l'auto-élévation de `role` et d'autres statuts critiques (`active`, `studentIds`, `schoolId`).
2. **Écrire les tests** : Créer ou mettre à jour un fichier `tests/permissions.spec.ts` ou Firebase Emulator Tests pour valider que ces appels sont interceptés.
3. **Déployer** : Exécuter le déploiement exclusif de Firebase Rules : `firebase deploy --only firestore:rules`.
4. **Valider en production** : Tenter une modification frauduleuse depuis la console navigateur en se connectant comme `owner`.
