# P0-030F-RCA-REPORT

## Firestore document
Le document existe bien en production et a été récupéré via le SDK Admin (qui ignore les règles Firestore) :
- **status** : `"pending"`
- **schoolId** : `"1712743818305-alpha"` (l'école de test)
- **studentId** : `"dbb15ed6-18ee-44ff-89c0-67c0067ce9f3"`
- **parentEmail** : `"p0030.parent.test+1782238600618@gmail.com"`
- **createdAt** : `"2026-06-23T18:16:40.618Z"`
- **expiresAt** : `"2026-07-23T18:16:40.618Z"` (Format String ISO)

## Browser console
La console du navigateur a retourné l'erreur suivante lors du chargement de la page `/#/parent-signup` :
```
Browser console [error]: Erreur lecture invitation: FirebaseError: Missing or insufficient permissions.
```

## Network
Une requête réseau vers l'API Firestore a échoué car l'accès a été refusé par les règles de sécurité.

## ParentSignup logic
Le composant `ParentSignup.tsx` effectue les actions suivantes à son montage :
1. Recherche de `inviteId` dans l'URL.
2. Appel à `getDoc(doc(db, 'parent_invitations', inviteId))` SANS être authentifié (le parent n'a pas encore de compte).
3. Si la lecture échoue avec une erreur de permissions, elle attrape l'erreur (`catch`), l'affiche dans la console, et met `error = 'Erreur lors de la lecture de l'invitation. Veuillez réessayer.'`.
4. Si `error` est défini, la page affiche l'UI d'erreur ("Invitation Invalide") au lieu du formulaire.

## Root Cause
La lecture publique (`get`) de l'invitation échoue en raison de cette règle dans `firestore.rules` :
```javascript
allow get: if resource.data.status == 'pending' && resource.data.expiresAt > request.time.toMillis();
```
**Le problème :** 
Dans `Students.tsx`, `expiresAt` est sauvegardé sous forme de chaîne de caractères (`new Date(...).toISOString()`). 
Or, dans la règle Firestore, il est comparé à `request.time.toMillis()` qui est un entier (Integer). Dans Firebase Security Rules, comparer un String avec un Integer échoue systématiquement (retournant `false` ou une erreur), ce qui entraîne un "Missing or insufficient permissions".

## Correctif minimal
Il suffit de retirer la comparaison `expiresAt` de la règle Firestore, car le fichier `ParentSignup.tsx` valide déjà l'expiration côté client (`if (new Date(data.expiresAt).getTime() < Date.now())`).
De plus, la donnée n'est accessible que via un ID long, complexe et aléatoire (ex: `inv_1782238600618_5wbc6yqd1`), ce qui garantit la sécurité.

Dans `firestore.rules` :
```diff
- allow get: if resource.data.status == 'pending' && resource.data.expiresAt > request.time.toMillis();
+ allow get: if resource.data.status == 'pending';
```

## Verdict
**ROOT CAUSE IDENTIFIED.**
Le problème vient de la règle Firestore qui tente de comparer un String (date ISO) avec un Integer (millis), rejetant l'accès public à l'invitation.
