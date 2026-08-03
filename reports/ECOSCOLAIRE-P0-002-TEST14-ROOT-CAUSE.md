# ECOSCOLAIRE - P0-002 - AUDIT CIBLÉ DU TEST 14 (ROOT CAUSE)

## 1. Données inspectées

Lors de l'audit de l'exécution du Test 14 (`Lecture notes enfant autorisé`), les données suivantes ont été inspectées au moment de l'injection :

*   **Document `users` (Parent)** : Créé manuellement via `setDoc` dans le script de test : `{ role: 'parent', email: '...', schoolId: '...', inviteId: '...', studentIds: ['alpha-student-1'] }`. **Note cruciale : le champ `active: true` (ou `isActive: true`) est absent.**
*   **Document `parent_invitations`** : Configuré avec les bons `studentIds` et un `status: 'pending'`.
*   **Document `grades`** : Requêté correctement via `query(collection(db, 'grades'), where('schoolId', '==', s), where('studentId', 'in', [targetStudentId]))`.

---

## 2. Règle Firestore impliquée

Le refus (`PERMISSION_DENIED`) n'est pas causé par une règle spécifique aux notes, mais par la fonction utilitaire globale `isActive()` évaluée en amont :

```javascript
function isActive() {
  let data = getUserData();
  return data.active == true || data.isActive == true;
}
```

Cette fonction est appelée dans la règle de lecture de la collection `grades` :

```javascript
match /grades/{gradeId} {
  allow read: if isAuthenticated() && isActive() && (
    isSuperAdmin() || 
    ((isOwner() || isDirector() || isSecretary() || isTeacher()) && hasSchoolAccess(resource.data.schoolId)) ||
    (isParent() && hasSchoolAccess(resource.data.schoolId)) 
  );
  // ...
}
```

Puisque le document utilisateur du parent généré par le test ne contient ni `active: true` ni `isActive: true`, la fonction `isActive()` renvoie `false`. L'accès est donc immédiatement rejeté.

---

## 3. Preuve du scénario rejoué

Pour vérifier cette hypothèse, le Test 14 a été isolé et rejoué en deux étapes.

### Exécution 1 : Test original (sans `active: true`)
```
Setting up user sBtq7QJRZ4UyNroFXDywXfPOavF3 without active: true
User created. Attempting to get grades...
❌ ECHEC OPERATION: Missing or insufficient permissions.
```

### Exécution 2 : Test corrigé (ajout de `active: true` dans le payload de test)
```
Setting up user zeafu8NlhiUOYMwp9g1YHw3Egrz1 WITH active: true
User created. Attempting to get grades...
Successfully read grades!
✅ SUCCES OPERATION
```

---

## 4. Analyse causale

La cause racine de l'échec du Test 14 est une **donnée de test incomplète**. 
Dans le code de test automatisé, l'insertion du profil parent omet le champ `active: true`. En production, ce champ est normalement défini lors de la création d'un utilisateur, mais puisque le test injecte les données directement dans Firestore (`setDoc`), cette omission provoque le rejet de la requête par la fonction de sécurité `isActive()` des règles Firestore. Le correctif P0-002 n'est pas en cause.

---

## CONCLUSION

**B. Données de test invalides.**
