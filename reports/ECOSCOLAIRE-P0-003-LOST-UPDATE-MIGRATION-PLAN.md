# ECOSCOLAIRE — P0-003 — LOST UPDATE MIGRATION PLAN

**Auteur :** Lead Software Architect / Release Manager
**Objectif :** Planifier la résolution du risque systémique "Lost Update" par phases successives, testables, sans régression (Zero Big Bang).

---

## 1. Découpage et Priorisation par Modules

L'architecture actuelle repose sur des mutations globales en mémoire suivies d'une réécriture totale via `saveDB()`. La migration ciblera les modules par ordre de criticité métier.

### Priorité 1 : Payments (`src/pages/Payments.tsx`)
*   **Problème exact :** Enregistrement de paiement avec calcul des soldes étudiants et totaux école soumis au Lost Update (écrasement du solde).
*   **Type cible :** `runTransaction()` pour la cohérence croisée (Paiement + Solde Élève) et `increment()` pour les compteurs globaux.
*   **Complexité :** Très Haute.
*   **Tests requis :** Test de concurrence (Node/Playwright) envoyant 5 créations de paiements simultanées pour le même étudiant.

### Priorité 2 : Students (`src/pages/Students.tsx`)
*   **Problème exact :** Write Skew sur les compteurs d'élèves. Deux administrateurs peuvent ajouter un élève simultanément en contournant la limite SaaS.
*   **Type cible :** `runTransaction()` incluant la vérification stricte du champ `studentsCount` et son `increment(1)`.
*   **Complexité :** Haute.
*   **Tests requis :** Simulation asynchrone saturant la limite SaaS à la milliseconde près.

### Priorité 3 : Settings (`src/pages/Settings.tsx`)
*   **Problème exact :** Conflit direct si plusieurs utilisateurs modifient les réglages globaux (frais, infos, PIN) en même temps.
*   **Type cible :** `updateDoc(docRef, { champ: valeur })`.
*   **Complexité :** Moyenne.
*   **Tests requis :** Multi-tab testing (modification de variables disjointes).

### Priorité 4 : Grades & Attendance (`Grades.tsx`, `Attendance.tsx`)
*   **Problème exact :** Saisie en rafale par plusieurs professeurs potentiellement perdue.
*   **Type cible :** `setDoc(docRef, data, { merge: true })` ou `updateDoc`.
*   **Complexité :** Moyenne.
*   **Tests requis :** Validation croisée des notes d'une même classe.

### Priorité 5 : Classes, Staff, Inventory, Transport
*   **Problème exact :** Effets de bords du `saveDB()` lors des CRUD classiques.
*   **Type cible :** Add/Update/Delete granulaires.
*   **Complexité :** Faible (travail de substitution répétitif).

### Priorité 6 : AppContext / saveDB
*   **Problème exact :** La fonction `saveDB` diffuse l'anti-pattern.
*   **Type cible :** Suppression pure et simple.
*   **Complexité :** Moyenne (Validation finale).

---

## 2. Définition des Patterns de Concurrence Autorisés

Pour garantir l'intégrité (ACID), tout développeur devra se conformer à cette taxonomie :

1.  **`updateDoc(ref, { field: value })`** : Pour toute mise à jour de document existant sans condition de lecture préalable. (Ex: Renommer une classe).
2.  **`setDoc(ref, data, { merge: true })`** : Exclusivement pour l'upsert (Création conditionnelle / Patch partiel).
3.  **`runTransaction()`** : Obligatoire dès qu'une écriture **B** dépend du résultat d'une lecture **A**. (Ex: Si solde < limite, alors appliquer paiement).
4.  **`writeBatch()`** : Pour les écritures simultanées sur de multiples documents qui ne dépendent pas d'une lecture préalable (Ex: Supprimer un parent ET ses invitations).
5.  **`FieldValue.increment(value)`** : Obligatoire pour tout compteur absolu (effectifs, sommes monétaires). Interdiction absolue de faire `n = n + 1` en JavaScript.
6.  **Cloud Functions Transactionnelles** : Recommandé pour des réconciliations financières complexes asynchrones.

---

## 3. Anti-Patterns Interdits (Règles CI)

Pour empêcher toute récidive, la CI/CD (ESLint) sera configurée pour rejeter :

*   ⛔ **`setDoc(ref, data)` SANS `{ merge: true }`** dans les fichiers du dossier `src/pages/` ou `src/components/` s'appliquant à des documents pré-existants.
*   ⛔ **Utilisation de `saveDB(...)`** pour tout nouveau composant (obsolescence forcée).
*   ⛔ **Recalcul front-end de compteurs stockés** (ex: `school.studentsCount = db.students.length` suivi d'une sauvegarde).
*   ⛔ **Mutation directe de l'état `db` global** (ex: `db.payments.push(...)`) utilisée comme prélude à une sauvegarde réseau.

---

## 4. Roadmap Commits (Stratégie Zéro Big-Bang)

*   **Commit 1 : Infrastructure & CI**
    *   **Objectif** : Configurer la CI pour interdire les anti-patterns et introduire un utilitaire de transactions centralisé.
    *   **Fichiers autorisés** : `.eslintrc.js`, `src/db/transactions.ts`.
    *   **Critère d'arrêt** : L'existant compile, le linter avertit sur `saveDB`.
    *   **Message de commit** : `chore(ci): enforce firestore concurrency rules and prepare P0-003 migration`

*   **Commit 2 : Migration Finances (Payments)**
    *   **Objectif** : Éradication du Lost Update comptable.
    *   **Fichiers autorisés** : `src/pages/Payments.tsx`.
    *   **Tests** : Script asynchrone validant les incréments simultanés.
    *   **Message de commit** : `fix(payments): implement firestore transactions for absolute financial integrity`

*   **Commit 3 : Migration Quotas & Étudiants**
    *   **Objectif** : Protection des limites SaaS via Write Skew protection.
    *   **Fichiers autorisés** : `src/pages/Students.tsx`.
    *   **Tests** : Saturer la création d'élèves en concurrence.
    *   **Message de commit** : `fix(students): use transactions for strict saas quota enforcement`

*   **Commit 4 : Migration Settings & Operations (CRUD)**
    *   **Objectif** : Remplacement massif des `saveDB` par `updateDoc` sur les modules standard.
    *   **Fichiers autorisés** : `Settings.tsx`, `Classes.tsx`, `Staff.tsx`, `Transport.tsx`, `Inventory.tsx`.
    *   **Critère d'arrêt** : Édition multi-onglets robuste.
    *   **Message de commit** : `refactor(crud): migrate standard modules to atomic updateDoc`

*   **Commit 5 : Kill saveDB**
    *   **Objectif** : Retrait définitif du code toxique.
    *   **Fichiers autorisés** : `AppContext.tsx`, `Grades.tsx`, `Attendance.tsx`.
    *   **Critère d'arrêt** : `saveDB` n'existe plus dans la base de code.
    *   **Message de commit** : `refactor(core): remove saveDB anti-pattern completely (P0-003 closed)`

---

## 5. Critères de Certification P0-003

Le chantier ne pourra être certifié clos que si :

1.  **Preuves Code :** Une commande `grep -r "saveDB" src/` retourne **0 occurrence**.
2.  **Preuves Tests (Firestore) :** Un test E2E/API asynchrone exécutant 5 opérations financières simultanées aboutit au résultat mathématique exact, prouvant l'usage de transactions.
3.  **Preuves Playwright :** La suite QA de 15+ tests E2E navigue et valide les formulaires de l'application avec succès, prouvant que la refonte CRUD n'a rien cassé.
4.  **Preuves Staging (Exploratoire) :** Une modification manuelle à deux utilisateurs sur le même formulaire ne provoque aucune perte de données silencieuse.
5.  **Absence de Régression :** L'authentification, les redirections, et l'affichage des données restent fluides et opérationnels.

---

**READY FOR USER VALIDATION**
