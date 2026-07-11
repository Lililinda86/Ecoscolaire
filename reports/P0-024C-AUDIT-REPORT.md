# P0-024C-AUDIT-REPORT

## Surface d'attaque
La surface d'attaque concerne directement la base de données Firestore et son API REST, ainsi que les Cloud Functions. Les acteurs ayant le droit d'écrire dans la collection `/students/{studentId}` (owner, director, secretary) peuvent potentiellement exploiter les accès directs à l'API Firebase (via des requêtes curl, un script Node.js externe ou directement via la console développeur du navigateur).

## Vulnérabilités
- **Absence de validation dans les Firestore Rules** : Dans le fichier `firestore.rules`, l'écriture sur la collection `students` est conditionnée par la fonction `canManagePedagogy()`. Cette fonction vérifie uniquement le rôle de l'utilisateur (admin, owner, director, secretary) et son appartenance à l'école, mais **aucune vérification sur le statut de l'abonnement SaaS (`subscriptionStatus`), le plan (`subscriptionPlan`), ou la limite d'élèves n'y est effectuée**.
- **Logique de quota purement Front-End** : Le contrôle des limites (ex. `limitReached`) et le blocage de la création d'élèves sont effectués exclusivement dans l'UI React (`src/pages/Students.tsx`) et non dans le backend. 
- **Absence de Cloud Function de vérification** : Le fichier `functions/src/index.ts` ne contient aucun trigger (comme `onDocumentCreated` sur `/students`) qui pourrait contrôler rétroactivement ou annuler l'ajout d'un élève si le quota est dépassé.
- **La méthode `saveDB`** (`src/context/AppContext.tsx`) fait de simples appels `setDoc` en utilisant le SDK client, de façon transparente et non sécurisée côté serveur concernant les limites d'usage.

## Gravité
**ÉLEVÉE / CRITIQUE**. N'importe quel utilisateur légitime disposant des droits de création d'élèves (directeur, secrétaire) peut facilement outrepasser les limites de son plan (ex: ajouter 1000 élèves au lieu de 200 sur le plan Starter) simplement en forgeant une requête REST avec son JWT, ou en injectant une commande `setDoc` dans la console du navigateur.

## Preuves
1. **Un utilisateur owner peut-il créer un élève directement dans Firestore ?**
   Oui. Le token JWT suffit pour valider la règle `canManagePedagogy` et autoriser le `setDoc`.
2. **Un directeur peut-il contourner la limite SaaS ?**
   Oui. La UI l'en empêche, mais un script contournant la UI réussira.
3. **Une API REST Firebase peut-elle contourner P0-024B ?**
   Oui. Le backend ne vérifie que l'authentification et les droits IAM basiques de l'application, sans aucune logique d'affaires sur les quotas SaaS.
4. **Les Firestore Rules vérifient-elles les paramètres de quota ?**
   Non. Ni `subscriptionPlan`, ni `isInternalSchool`, ni `studentLimit` ne sont interrogés lors de l'accès à `/students`.

## Recommandation
Pour sécuriser de manière hermétique la limitation SaaS, il faut déplacer ou doubler la logique de contrôle côté backend :
1. **Approche Cloud Function (recommandée)** : Déployer une fonction déclenchée lors de la création d'un document (`onDocumentWritten` ou `onDocumentCreated` sur `/students/{studentId}`). Cette fonction vérifierait le nombre actuel d'élèves par rapport au quota de l'école (lu de `/schools/{schoolId}`). En cas de dépassement, la fonction supprimerait l'étudiant excédentaire.
2. **Approche Firestore Rules** : Maintenir un compteur `studentsCount` de manière atomique sur le document `school` (via Cloud Functions), et exiger dans les Firestore Rules que ce `studentsCount` soit inférieur au quota autorisé, en faisant un appel `get(/databases/$(database)/documents/schools/$(request.resource.data.schoolId))`.

## Verdict
AUCUNE PROTECTION BACKEND
