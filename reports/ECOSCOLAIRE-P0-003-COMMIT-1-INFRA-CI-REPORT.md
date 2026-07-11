# ECOSCOLAIRE — P0-003 — COMMIT 1 — INFRASTRUCTURE CI REPORT

**Auteur :** Lead Firestore Engineer / Release Manager
**Objectif :** Préparer les garde-fous techniques contre les récidives de Lost Update (Commit 1 du plan de migration P0-003).

---

## 1. Périmètre d'Intervention

Seuls les fichiers de configuration de l'infrastructure et de l'outillage ont été modifiés :
* **`eslint.config.js`** : Ajout des règles lint personnalisées.
* **`src/db/transactions.ts`** : Création de l'utilitaire transactionnel de base.

*Aucun module métier n'a été modifié lors de ce commit, conformément aux instructions strictes ("pas de migration métier").*

---

## 2. Garde-Fous Ajoutés (ESLint)

Deux règles `no-restricted-syntax` ont été configurées en mode `warn` pour accompagner la migration sans bloquer immédiatement les builds existants :

1. **`CallExpression[callee.name='saveDB']`**
   * Message : `P0-003: L'utilisation de saveDB() est un anti-pattern causant des Lost Updates. Utilisez updateDoc() ou runTransaction().`
   * Cible : Tout appel à la méthode globale de synchronisation.

2. **`CallExpression[callee.name='setDoc'][arguments.length<3]`**
   * Message : `P0-003: setDoc sans option {merge: true} écrase le document entier. Ajoutez {merge: true} ou utilisez updateDoc().`
   * Cible : Utilisation destructive de `setDoc` écrasant des documents existants.

---

## 3. Utilitaires Transactionnels Ajoutés

Le fichier `src/db/transactions.ts` a été créé en tant que socle pour les futurs commits. Il inclut des signatures prêtes à l'emploi (protégées via `eslint-disable` pour l'instant) :
* `safeUpdate(ref, data)`
* `runAtomicOperation(operation)`
* `safeIncrement(value)`

---

## 4. Résultats des Tests et Violations Détectées

### Linter (`npm run lint`)
L'exécution du linter a permis d'inventorier avec précision la dette technique liée à la concurrence. 
**67 avertissements (warnings)** ont été levés par nos nouvelles règles P0-003, notamment dans :
* `App.tsx` (1)
* `Attendance.tsx` (4)
* `Buses.tsx` (2)
* `Classes.tsx` (2)
* `Diagnostic.tsx` (3 `setDoc` sans merge)
* `Grades.tsx` (1)
* `Inventory.tsx` (2)
* `Payments.tsx` (7)
* `Settings.tsx` (12)
* `Staff.tsx` (2)
* `Students.tsx` (5)
* `SuperAdmin.tsx` (4)
* `UsersManagement.tsx` (2)
* `ValidationDashboard.tsx` (2)
* `AppContext.tsx` (2 `setDoc` destructifs signalés)

*Note : Les avertissements n'ont pas empêché la compilation ni perturbé le code existant. Quelques erreurs TS "unused variables" ont été corrigées.*

### Build (`npm run build`)
Le build s'est exécuté avec succès : `✓ built in 9.61s`.

---

## 5. Livrable Git

Le commit isolé a été généré sur la branche locale.

* **Fichiers inclus :** `eslint.config.js`, `src/db/transactions.ts`
* **Message de commit :** `chore(ci): add firestore concurrency guardrails for P0-003`
* **SHA du commit :** `04ddfb4`

---

**COMMIT CREATED — READY FOR REVIEW**
