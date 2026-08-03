# P0-024B-STUDENT-LIMIT-FINAL-AUDIT

## 1. Écrans pouvant créer des élèves
- **`src/pages/Students.tsx`** : Seul écran permettant actuellement la création d'élèves.
  - Fonction `handleSave` (via la modale d'ajout manuel `+ Ajouter`).
  - Fonction `handleConfirmImport` (via la modale d'import Excel).

## 2. Imports
- **Import Excel** dans `src/pages/Students.tsx`.
  - Parseur géré par `handleImportSubmit` (`XLSX.utils.sheet_to_json`).
  - Sauvegarde en masse via `saveDB({ ...db, students: [...db.students, ...previewStudents] })` déclenchée par le bouton "Confirmer l'importation".
  - *Risque* : C'est le point de défaillance principal pour les dépassements de volume massifs.

## 3. Fonctions saveDB impactées
- L'utilitaire central `saveDB` (situé dans `src/context/AppContext.tsx`) est la seule porte de sortie vers Firestore depuis le frontend.
- Les appels impactés se trouvent dans `src/pages/Students.tsx` :
  - Ligne ~58 : `saveDB(newDb)` suite à un ajout manuel.
  - Ligne ~276 : `saveDB({...})` suite à un import massif.

## 4. Cloud Functions impactées
- **Actuellement** : Aucune. (`functions/src/services` ne contient que le service Campay). La logique d'insertion est 100% côté client.
- **Impact futur (recommandation d'architecture sécurisée)** : 
  - Il sera impossible de sécuriser totalement le système sans une Cloud Function ou une extension Firebase, car Firestore Rules ne peut pas compter les documents d'une collection sans surcoût/complexité. Le système aura besoin de fonctions `onDocumentCreated` et `onDocumentDeleted` pour maintenir un compteur de `studentCount` sur la collection `schools`.

## 5. Scripts seed
- **`scripts/setup-test-data.mjs`** :
  - Ligne ~139 : Boucle `for(let i=1; i<=20; i++)` créant les `alpha-student-X` (20 élèves).
  - Ligne ~153 : Création de `beta-student-1` (1 élève).
  - *Note* : Si la limite Starter venait à être testée via le seed, il faudrait adapter ce script pour injecter exactement le nombre nécessaire ou s'assurer que les rôles tests soient attachés à un plan `premium` / `pilot` par défaut pour éviter de casser les autres tests.

## 6. Tests Playwright à adapter
- **`tests/students-crud.spec.ts`** : Test d'ajout et suppression d'élèves. Doit s'assurer de ne pas frapper la limite lors des tests, ou être adapté pour tester les alertes de limitation.
- Nouveaux tests à créer spécifiquement pour tester le blocage (ex: `p0-024b-limits.spec.ts`).

## 7. Contournements possibles de la limite (Vulnérabilités critiques identifiées)
1. **Bypass Frontend (Direct Firestore API)** :
   - Les `firestore.rules` actuelles (lignes ~150-160) autorisent `create` sur `/students/{studentId}` pour tout utilisateur `isOwner()`, `isDirector()`, etc. 
   - *Problème* : Il n'y a **aucune condition limitative** sur ce `create`. Un utilisateur un peu technique peut ouvrir la console du navigateur, initialiser Firebase et exécuter `addDoc(collection('students'))` en boucle sans être bloqué.
2. **Escalade de privilèges SaaS (CRITIQUE)** :
   - Les `firestore.rules` actuelles (lignes ~140) permettent aux propriétaires (`isOwner`) d'effectuer un `update` sur leur propre document école : `allow update: if isAuthenticated() && isActive() && (isSuperAdmin() || canManageSchool(schoolId));`.
   - *Problème* : Il n'y a **aucune vérification de masque de champ (field mask)**. Un propriétaire d'école peut envoyer une requête API pour faire : `updateDoc(doc('schools', monId), { subscriptionPlan: 'premium', isInternalSchool: true })` et s'octroyer l'illimité gratuitement.

---
**CONCLUSION DU FINAL AUDIT** :
L'implémentation frontend (désactivation de boutons) ne sera que cosmétique. Pour un véritable "paywall SaaS", les `firestore.rules` devront interdire aux owners de modifier les champs liés à l'abonnement (`subscriptionPlan`, `subscriptionStatus`, `isInternalSchool`, etc.), et la création d'élèves devra inclure une vérification stricte du compteur (nécessitant l'ajout de compteurs via Cloud Functions).
