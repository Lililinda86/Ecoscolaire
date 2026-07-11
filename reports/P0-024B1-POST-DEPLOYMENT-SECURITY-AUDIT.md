# P0-024B1-POST-DEPLOYMENT-SECURITY-AUDIT

## Contenu exact de `firestore.rules`
Le fichier `firestore.rules` local a été mis à jour.
**Preuve de la présence réelle des fonctions (lignes 31 à 66)** :
```javascript
    function isUpdatingSaasFields() {
      return request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'subscriptionPlan', 'subscriptionStatus', 'subscriptionStartDate', 
        'subscriptionEndDate', 'subscriptionRenewalDate', 'nextPaymentDate', 
        'isInternalSchool', 'studentLimit', 'billingStatus', 'billingCycle', 'trialEndsAt'
      ]);
    }

    function isUpdatingSensitiveUserFields() {
      return request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'role', 'schoolId', 'schoolIds', 'active', 'status', 'permissions', 'studentIds'
      ]);
    }
```
L'intégration restrictive sur `/schools/{schoolId}` et `/users/{userId}` est présente localement.

## Commits contenant ces modifications
**AUCUN COMMIT NE CONTIENT ENCORE CES MODIFICATIONS.**
*Preuve :* L'exécution de `git status` montre que `firestore.rules` est `modified` (non stagé) et le dossier `tests/security/` est `Untracked files`. Aucun `git commit` n'a été fait pour P0-024B1 comme convenu par les règles de non-validation (absence de tests live prouvés).

## Fichiers de test sécurité réellement présents
Les fichiers existent physiquement dans le dépôt local :
* `tests/security/rules.spec.mjs` (Suite Emulateur)
* `tests/security/rules-test-live.mjs` (Script Live Staging)

## Tests exécutables aujourd'hui
Le test **`tests/security/rules-test-live.mjs`** est prêt à être exécuté aujourd'hui. Il ne requiert pas l'Emulateur Java. Il nécessite uniquement que l'environnement (ou toi localement) valide le `firebase login` et déploie les règles sur `staging` en amont.

## Commande pour prouver la protection SaaS (owner)
La commande exacte est :
```bash
node tests/security/rules-test-live.mjs
```
*Preuve :* Ce script contient l'assertion exacte :
```javascript
  // Owner modifie subscriptionPlan -> refusé
  await expectPermissionDenied('Owner modifie subscriptionPlan', 
    updateDoc(doc(db, 'schools', 'school-alpha-001'), { subscriptionPlan: "premium" })
  );
```

## Commande pour prouver la protection User (auto-promotion superAdmin)
La commande exacte est identique :
```bash
node tests/security/rules-test-live.mjs
```
*Preuve :* Ce script contient l'assertion exacte pour bloquer l'auto-promotion et la modification des champs critiques :
```javascript
  // Utilisateur normal (ou owner) modifie son propre rôle -> refusé
  await expectPermissionDenied('Owner modifie son propre rôle', 
    updateDoc(doc(db, 'users', ownerUid), { role: "superAdmin" })
  );
```

---

**Conclusion de l'audit** :
Les protections sont écrites et les outils de test sont présents, MAIS elles ne sont **ni committées ni vérifiées sur le serveur Firebase Staging**. 
Pour clôturer définitivement P0-024B1, tu dois impérativement exécuter manuellement :
1. `firebase deploy --only firestore:rules --project ecoscolaire-staging`
2. `node tests/security/rules-test-live.mjs`

Une fois que ces tests passent en conditions réelles de ton côté, tu pourras donner l'ordre officiel de `COMMIT` et nous passerons à la fonctionnalité P0-024B (limite d'élèves).
