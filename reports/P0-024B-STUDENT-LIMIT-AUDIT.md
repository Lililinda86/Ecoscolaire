# P0-024B-STUDENT-LIMIT-AUDIT

## Audit modèle School
- **Fichier** : `src/types/index.ts`
- **Champs existants** : `subscriptionPlan`, `subscriptionStatus`, `subscriptionStartDate`, `subscriptionEndDate`, etc.
- **Champs manquants** : 
  - `isInternalSchool?: boolean` (pour identifier GSB ITALO et autres écoles internes).
- **Compatibilité avec `isInternalSchool`** : À ajouter au type `School`. Cela permettra de court-circuiter toute logique de limitation.
- **Compatibilité avec écoles pilotes** : Le plan `SubscriptionPlan` est défini comme `'starter' | 'standard' | 'premium'`. Nous pouvons ajouter un plan `'pilot'` ou bien lier le statut pilote à un plan `premium` gratuit avec une `subscriptionEndDate` à +6 mois. Il est préférable d'ajouter `'pilot'` à `SubscriptionPlan` pour que les limites et rapports soient explicites.

## Audit collection students
- **Comment les élèves sont liés à `schoolId`** : Chaque document élève possède un champ `schoolId: string;` qui référence l'ID de l'école.
- **Comment compter les élèves d’une école** : 
  - *Frontend* : L'objet `db.students` (dans `AppContext`) contient tous les élèves de l'école courante pour les directeurs/owners. `db.students.length` donne le compte exact localement.
  - *Backend (Firestore)* : Utiliser `getCountFromServer` avec la clause `where('schoolId', '==', schoolId)` pour éviter de télécharger des milliers de documents.
- **Risques de performance** : Le calcul côté client (`db.students.length`) fonctionne pour des tailles raisonnables (jusqu'à quelques milliers), mais pour le SuperAdmin qui liste les écoles, télécharger tous les élèves de toutes les écoles serait un gouffre. Il faudra un compteur agrégé (`studentCount`) sur le document `School` si on veut l'afficher sur le dashboard SuperAdmin sans impacter la performance.

## Audit création manuelle élève
- **Fichier exact** : `src/pages/Students.tsx`
- **Fonction exacte** : `handleSave(e: React.FormEvent)`
- **Endroit où bloquer** : 
  - Désactiver visuellement le bouton `+ Ajouter` si la limite est atteinte.
  - Dans `handleSave`, ajouter une vérification stricte : `if (!isEditing && !isInternalSchool && db.students.length >= planLimit) { alert('Limite atteinte...'); return; }` avant l'exécution de `saveDB()`.

## Audit import Excel
- **Fichier exact** : `src/pages/Students.tsx`
- **Fonction exacte** : `handleImportSubmit` (lecture du fichier) et `handleConfirmImport` (sauvegarde).
- **Risque de dépassement de limite** : Importer un fichier Excel de 150 lignes quand on a 100 élèves dans un plan `STARTER` (limite 200) ferait passer le total à 250, contournant la limite.
- **Stratégie de blocage avant import** : 
  - Dans `handleConfirmImport`, vérifier : `if (!isInternalSchool && (db.students.length + previewStudents.length > planLimit)) { alert('Import impossible, limite dépassée...'); return; }`.

## Audit SuperAdmin
- **Fichier** : `src/pages/SuperAdmin.tsx`
- **Où afficher le plan** : Dans la table "Liste des Clients", à côté ou en dessous de "Statut Abonnement", ajouter une colonne "Plan SaaS".
- **Où afficher le nombre d’élèves** : Idéalement dans la table des clients. Comme cela nécessite de lire `students` pour chaque école, nous pourrons le faire via une agrégation Firebase dynamique ou simplement le laisser en "détail" quand on clique sur gérer.
- **Où afficher `isInternalSchool`** : Dans la modale `Gestion École (Client)` (le formulaire `isModalOpen`), ajouter un Toggle/Checkbox "École Interne (GSB ITALO) - Sans limite".
- **Où gérer les écoles pilotes** : Dans le menu déroulant "Formule d'abonnement", ajouter l'option "Pilote (Gratuit 6 mois, Illimité)". 

## Audit paywall P0-024A
- **Logique actuelle** : `const isSchoolSuspended = currentSchool?.subscriptionStatus === 'suspended' || currentSchool?.subscriptionStatus === 'expired';`
- **Comment ne pas bloquer ITALO** : Ajouter un court-circuit : `if (currentSchool?.isInternalSchool) return false;`.
- **Comment ne pas bloquer les pilotes pendant 6 mois** : Un pilote aura un `subscriptionStatus: 'active'` et une `subscriptionEndDate` configurée 6 mois plus tard. Tant que la date n'est pas expirée (et que le statut n'est pas passé à `expired`), l'école ne sera pas bloquée. Le SuperAdmin configure la date lors de la création de l'école.

## Audit sécurité
- **Ce qui est possible en frontend** : 
  - Bloquer la modale d'ajout.
  - Bloquer l'import Excel.
  - Gérer les affichages de limite (ex: "150/200 élèves utilisés").
- **Ce qui doit être renforcé plus tard (Firestore Rules)** :
  - Il n'est pas possible de compter facilement des documents dans une règle Firestore sans extension. L'approche standard sera de maintenir un champ `studentCount` sur le document `School` via Cloud Functions et de vérifier `get(/databases/$(database)/documents/schools/$(schoolId)).data.studentCount < 200` dans la règle de création d'élève.
- **Ce qui doit être renforcé plus tard (Cloud Functions)** :
  - Un trigger `onDocumentCreated` sur `students` pour incrémenter `studentCount` et un trigger `onDocumentDeleted` pour le décrémenter.
  - Rejeter les créations par lot (batch/import) en backend si le compteur global dépasse la limite.

## Règles métier proposées
- `isInternalSchool` = `true` ➔ Aucune limite, pas de suspension possible.
- Plan `pilot` ➔ Aucune limite d'élèves, suspension possible après 6 mois d'expiration.
- Plan `starter` ➔ Limite stricte à 200 élèves.
- Plan `standard` ➔ Limite stricte à 1000 élèves.
- Plan `premium` ➔ Aucune limite.

## Plan d’implémentation
1. **Types** : Modifier `src/types/index.ts` (ajouter `isInternalSchool`, ajouter `'pilot'` aux plans).
2. **Utils** : Créer une fonction utilitaire `getStudentLimit(school: School): number | 'unlimited'` et `isLimitReached(school, currentCount)`.
3. **SuperAdmin** : Mettre à jour `SuperAdmin.tsx` pour permettre de définir `isInternalSchool` et le plan `'pilot'`.
4. **Paywall** : Modifier `isSchoolSuspended` dans `AppContext.tsx` pour ignorer les écoles internes.
5. **Students** : Mettre à jour `Students.tsx` pour inclure les blocages d'ajout manuel, les blocages d'import Excel, et afficher une barre/texte de progression (ex: "180 / 200 élèves (Plan Starter)").
6. **Tests Playwright** : Mettre en place la matrice de tests définie (pilotes, ITALO, Starter 199/200/201, Standard 999/1000/1001, Premium).

## Plan de tests
- **ITALO** : Créer/Importer 500 élèves ➔ Succès (aucune limite).
- **École pilote** : Créer/Importer 500 élèves ➔ Succès (aucune limite), aucun blocage SaaS.
- **STARTER 199 élèves** : Ajouter 1 élève ➔ Succès (200 atteins).
- **STARTER 200 élèves** : Ajouter 1 élève ➔ Échec (bouton bloqué/erreur), Import bloqué.
- **STARTER 201 élèves** (cas de figure via ancienne BD) : Ajout bloqué.
- **STANDARD 999 élèves** : Ajouter 1 élève ➔ Succès.
- **STANDARD 1000 élèves** : Ajouter 1 élève ➔ Échec.
- **STANDARD 1001 élèves** : Ajout bloqué.
- **PREMIUM illimité** : Ajouter élèves ➔ Toujours succès.

## Risques
- **Comptage asynchrone** : En mode hors-ligne, si le frontend autorise la création de 5 élèves sans synchro serveur, il pourrait dépasser localement. Risque mineur car Firebase rejettera lors de la synchro si les Firestore Rules sont appliquées.
- **Données historiques** : Certaines écoles STARTER existantes ont peut-être DÉJÀ plus de 200 élèves. La logique doit simplement empêcher de *nouveaux* ajouts, sans bloquer la lecture ou modifier les élèves existants.

## Conclusion
L'audit confirme que les mécanismes pour la limitation du nombre d'élèves (P0-024B) peuvent être insérés proprement dans l'architecture actuelle. L'ajout d'un marqueur `isInternalSchool` et d'une méthode de comptage `db.students.length` associée aux limites de `SubscriptionPlan` permettra de respecter stricto sensu la politique commerciale.

**PHASE 1 - AUDIT COMPLET TERMINÉ.** Prêt pour la phase de Plan d'Implémentation / Implémentation selon les directives.
