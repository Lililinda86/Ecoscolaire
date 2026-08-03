# P0-029-PARENT-STUDENT-LINKING-DESIGN-REPORT

## Architecture actuelle
1. **`users` (Parent) :** Contient actuellement un tableau `studentIds[]` qui liste les ID des enfants.
2. **`students` :** Contient des champs texte statiques (`parentName`, `parentPhone`) mais aucun identifiant technique ni email liant l'élève à un compte utilisateur parent.
3. **`ParentPortal` :** Filtre la base locale via `db.students.filter(s => (parent.studentIds || []).includes(s.id))`.

## Problème identifié
- **Déconnexion de workflow :** La secrétaire crée un élève via le formulaire UI en saisissant le nom du tuteur en texte libre. Aucune mécanique ne permet d'injecter l'ID de cet élève dans le tableau `studentIds[]` d'un hypothétique compte parent existant.
- **Problème de l'œuf et la poule :** Si la secrétaire inscrit l'élève *avant* que le parent ne crée son compte (scénario très fréquent lors d'un import Excel de rentrée), il est impossible d'utiliser des UIDs.
- **Gestion des fratries & multi-parents :** Gérer manuellement un tableau `studentIds[]` chez le parent devient chaotique pour les familles recomposées (ex: 2 parents séparés ayant chacun leur compte pour 1 même enfant).

## Options comparées

### Option A : Inversion de contrôle (`students.parentEmails[]`)
Au lieu de stocker les enfants chez le parent (`users.studentIds[]`), **on stocke les contacts des parents chez l'enfant**.
- L'entité `Student` gagne le champ `parentEmails: string[]`.
- La secrétaire saisit simplement les emails des parents (ex: père et mère) lors de la création de l'élève.
- **Avantages :** 
  - Résout le problème de l'ordre de création (l'élève peut être créé avant le compte parent).
  - Gère nativement 2 parents (on ajoute 2 emails dans le tableau).
  - Le portail parent récupère les enfants par une simple requête `array-contains` sur l'email du parent connecté.
  - Parfait pour l'import Excel (on ajoute une colonne "Email Parent 1" et "Email Parent 2").
- **Inconvénients :** Aucun inconvénient majeur en NoSQL, l'indexation `array-contains` est très rapide.

### Option B : Collection `parent_links`
Créer une collection de mapping : `{ id, schoolId, studentId, parentEmail, status: 'linked' }`.
- **Avantages :** Très propre au sens relationnel SQL.
- **Inconvénients :** Anti-pattern en NoSQL Firebase pour une donnée aussi intimement liée à l'élève. Ajoute une jointure complexe côté Front-end, ralentit le portail parent, et augmente les coûts de lecture Firebase (1 lecture link + 1 lecture élève).

## Solution retenue
**Option A modifiée : Utilisation de `students.parentEmails[]` au lieu de `parentIds[]`**.
L'utilisation de l'**email** comme clé de jointure "douce" (Soft Link) est la plus robuste. Elle permet à la secrétaire de saisir l'email du parent avant même que celui-ci ne se soit jamais connecté. Lorsque le parent s'inscrira avec cet email, il verra instantanément ses enfants.
*NB : Le tableau `studentIds[]` sur la collection `users` sera rendu obsolète.*

## Impacts Firestore
1. **Interface `Student` (types/index.ts) :**
   ```typescript
   export interface Student {
     // ...
     parentEmails?: string[]; // Remplace l'absence de lien
   }
   ```
2. **Interface `User` (types/index.ts) :**
   Le champ `studentIds?: string[]` devient déprécié (on peut le garder un temps pour la rétrocompatibilité).

## Impacts UI
1. **Formulaire d'ajout d'élève (`Students.tsx`) :**
   - Ajouter un champ d'entrée dynamique "Emails des parents/tuteurs (séparés par des virgules ou un par ligne)".
   - Lors de la sauvegarde, on construit le tableau `parentEmails: ['email1@test.com', 'email2@test.com']`.
2. **Portail Parent (`ParentPortal.tsx`) :**
   - Modifier le filtrage actuel :
     `const children = db.students.filter(s => (s.parentEmails || []).includes(currentUser.email) || (parent.studentIds || []).includes(s.id));`
3. **Menu Accès & Rôles (`Users.tsx`) :** 
   - Optionnellement, lors de la vue d'un parent, afficher les élèves qui correspondent à son email pour faciliter le support.

## Migration
**Zéro perte de données :**
Une fonction de migration exécutable côté client (ou lors du chargement de la DB locale) :
1. Lire la liste des parents actuels et leur tableau `studentIds[]`.
2. Pour chaque ID d'élève, aller dans l'objet `Student` correspondant.
3. Ajouter `parent.email` au tableau `parentEmails[]` de cet élève s'il n'y est pas déjà.
4. Sauvegarder l'élève.

## Tests
- Vérifier qu'un parent historique voit toujours ses enfants (après l'application de la migration logicielle).
- Créer un nouvel élève en tapant un nouvel email parent. Se connecter avec ce nouvel email et vérifier que l'élève s'affiche sans intervention manuelle de l'admin.
- Saisir 2 emails différents pour le même élève et vérifier que les 2 comptes parents voient l'enfant.

## Verdict
**Prêt pour implémentation.** La solution est fluide, extrêmement économique en lectures Firestore et parfaitement alignée avec l'usage métier d'une secrétaire (l'email est la donnée la plus facile à recueillir lors d'une inscription).
