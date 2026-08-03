# ECOSCOLAIRE-P0-002-COMMIT-READINESS

## 1. Fichiers Modifiés (Working Directory)
Analyse via la commande `git status --porcelain`.
**Fichiers appartenant réellement au correctif P0-002 :**
- `firestore.rules`

**Fichiers SANS RAPPORT trouvés dans le Working Directory (Pollution) :**
- `src/App.tsx`
- `src/pages/AIDirector.tsx`
- `src/pages/AITeacher.tsx`
- `src/pages/Attendance.tsx`
- `src/pages/Buses.tsx`
- `src/pages/Classes.tsx`
- `src/pages/Communication.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Grades.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Students.tsx`
- `functions/lib/index.js`
- `functions/lib/index.js.map`
- `.github/workflows/firebase-deploy.yml`
- Fichiers de rapports divers (`diagnostic-html.txt`, etc.)

## 2. Résumé du Diff (firestore.rules)
**Lignes ajoutées** : 3
**Lignes supprimées** : 1
```diff
-          request.resource.data.keys().hasAll(['inviteId']) &&
+          request.resource.data.keys().hasAll(['inviteId', 'studentIds']) &&
           get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.status == 'pending' &&
           get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.parentEmailLower == request.auth.token.email &&
-          get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.schoolId == request.resource.data.schoolId
+          get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.schoolId == request.resource.data.schoolId &&
+          request.resource.data.studentIds == get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.studentIds &&
+          !request.resource.data.keys().hasAny(['isInternalSchool', 'subscriptionPlan', 'studentLimit', 'pilot', 'permissions', 'claims', 'customClaims'])
```
**Impact fonctionnel** : L'inscription d'un parent nécessite l'exacte liste `studentIds` issue de l'invitation validée.
**Impact sécurité** : Bloque définitivement l'IDOR (usurpation d'étudiant) et empêche l'élévation de privilèges SaaS par injection de champs administratifs dans le document `users`.

## 3. Vérification de l'isolation
**ALERTE CRITIQUE** : L'espace de travail n'est absolument pas isolé. Il est massivement pollué par les correctifs UI Route Guards (`src/pages/*.tsx`) issus d'un audit précédent, et par des artefacts de build de Cloud Functions. 
Mélanger ces correctifs dans le même commit introduirait un risque majeur de confusion d'historique (les modifications UI et Firestore seraient intriquées), violant les principes fondamentaux de ségrégation des révisions de sécurité.

Conformément au protocole imposé ("Si un mélange existe : arrêter immédiatement le rapport") :
**ARRÊT IMMÉDIAT DE LA PROCÉDURE DE COMMIT.**

---

## VERDICT

**NOT READY FOR COMMIT**

(L'espace de travail nécessite un nettoyage préalable via un stash, ou l'utilisation d'un `git add firestore.rules` strict au lieu d'un `git add .` pour garantir l'isolation du patch).
