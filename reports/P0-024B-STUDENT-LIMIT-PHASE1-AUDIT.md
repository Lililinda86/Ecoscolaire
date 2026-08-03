# P0-024B-STUDENT-LIMIT-PHASE1-AUDIT

## Fichiers à modifier
1. `src/types/index.ts` : Mettre à jour l'interface `School` pour intégrer explicitement `isInternalSchool` et potentiellement une date de fin d'essai `trialEndsAt` ou `subscriptionPlan: 'pilot'`.
2. `src/context/AppContext.tsx` (ou un nouveau `src/utils/saas.ts`) : Ajouter une fonction `getStudentLimit(school: School): number | typeof Infinity` pour centraliser la logique de limite.
3. `src/pages/Students.tsx` : Intercepter les créations, désactiver le bouton d'ajout si la limite est atteinte, et bloquer l'import Excel. Afficher une jauge ou un texte indiquant l'utilisation (ex: "190 / 200 élèves").
4. `src/pages/SuperAdmin.tsx` : Mettre à jour la modale de gestion d'école pour permettre au SuperAdmin d'activer `isInternalSchool`, de définir le plan "Pilote", ou d'ajuster les dates d'essai.
5. `tests/students-limit.spec.ts` (Nouveau) : Écrire les tests E2E prouvant les limites de chaque plan.

## Règles métier
La fonction `getStudentLimit(school)` devra implémenter la matrice suivante :
* **ITALO interne** (`isInternalSchool: true`) : `Infinity` (illimité à vie).
* **Pilote** (`subscriptionPlan === 'pilot'` ou `subscriptionStatus === 'trial'`) : `Infinity` (illimité pendant la période d'essai de 6 mois définie par `trialEndsAt`).
* **Starter** (`subscriptionPlan === 'starter'`) : Limite stricte à `200`.
* **Standard** (`subscriptionPlan === 'standard'`) : Limite stricte à `1000`.
* **Premium** (`subscriptionPlan === 'premium'`) : `Infinity` (illimité).

## Points de création élèves
Toutes les créations d'élèves passent actuellement par un seul écran frontend : `src/pages/Students.tsx`.
Il y a deux fonctions exactes qui modifient la collection :
1. `handleSave(e: React.FormEvent)` : Création unitaire (si `!isEditing`).
2. `handleConfirmImport()` : Création par lots via l'import Excel.

## Import Excel
Le risque majeur est le contournement de la limite via un fichier volumineux.
*Logique de blocage requise* : Dans `handleConfirmImport`, le système doit calculer `db.students.length + previewStudents.length`. Si ce total dépasse `getStudentLimit(currentSchool)`, l'import doit être intégralement rejeté avec un message d'alerte.

## Sécurité frontend
* **UI/UX** : Si `db.students.length >= limit`, le bouton principal `+ Ajouter` doit être grisé (disabled) ou masqué.
* **Logique (Double check)** : Même si le bouton est activé, le tout début des fonctions `handleSave` (en mode création) et `handleConfirmImport` doit contenir un bloc `if` vérifiant la limite et exécutant un `return` anticipé.

## Sécurité Firestore future
Actuellement, bloquer la création via les `firestore.rules` pour limiter le nombre de documents nécessite une approche asynchrone (Firestore rules ne peuvent pas exécuter de requêtes `count()` de manière dynamique sans coût prohibitif ou architecture spécifique).
**La solution backend requise (Phase ultérieure)** :
1. Déployer des Cloud Functions (`onDocumentCreated`, `onDocumentDeleted`) sur la collection `students`.
2. Ces fonctions maintiendront un champ incrémental `studentCount` sur le document parent `schools/{schoolId}`.
3. Modifier `firestore.rules` : `allow create: if get(/databases/$(database)/documents/schools/$(schoolId)).data.studentCount < get(...).data.studentLimit`.
*(Pour la présente étape P0-024B, nous implémenterons d'abord la robustesse Frontend + Tests E2E).*

## Tests nécessaires
Un script Playwright dédié (ex: `tests/p0-024b-student-limit.spec.ts`) sera requis pour tester :
1. **Plan Starter** : Tenter d'ajouter un élève quand il y a déjà 200 élèves (doit échouer).
2. **Plan Starter** : Tenter un import Excel de 10 élèves quand on a 195 élèves (205 total > 200, doit échouer).
3. **Plan Standard** : Ajouter un élève avec 999 élèves (doit réussir).
4. **ITALO (Interne)** : Ajouter un élève avec 1500 élèves (doit réussir).
5. **Pilote** : Ajouter un élève (doit réussir).

## Risques
* **Écoles Starter existantes** : Certaines écoles sous plan Starter ont peut-être *déjà* plus de 200 élèves dans la base (données historiques). La logique de blocage doit empêcher les **nouveaux ajouts**, sans bloquer la lecture de la liste, l'édition d'élèves existants, ni générer de crash.
* **Mode hors-ligne** : Un utilisateur pourrait techniquement créer plusieurs élèves en mode hors-ligne sans synchronisation. Le dépassement serait local avant synchronisation avec Firestore. Cela sera couvert à terme par la Sécurité Firestore Future.

## Plan d’implémentation proposé
1. **Modélisation** : Modifier `src/types/index.ts` et ajouter le helper central `getStudentLimit()` dans `AppContext.tsx`.
2. **Backoffice SuperAdmin** : Mettre à jour le formulaire `SuperAdmin.tsx` pour inclure le switch `École Interne (ITALO)` et l'option "Pilote" dans les plans.
3. **Contrôles UI** : Dans `Students.tsx`, injecter les blocages sur `handleSave` et `handleConfirmImport`. Afficher un petit indicateur visuel de capacité en haut de la table (ex: `Capacité SaaS : 190 / 200`).
4. **Tests** : Coder les tests E2E pour valider chaque restriction logicielle sans mocker la base de données (utiliser le compte Test/Alpha modifié dynamiquement).
