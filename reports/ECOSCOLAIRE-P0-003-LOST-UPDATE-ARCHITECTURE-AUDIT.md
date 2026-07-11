# ECOSCOLAIRE — P0-003 — LOST UPDATE ARCHITECTURE AUDIT

**Auteur :** Lead Software Architect & Concurrency Engineer
**Objet :** Cartographie exhaustive et analyse des risques de concurrence (Lost Update).

---

## 1. Cartographie Exhaustive

Un scan de l'ensemble du code source (`src/`) révèle un anti-pattern majeur de gestion d'état responsable de pertes de données.

*   **`saveDB()` (Moteur central dans `AppContext.tsx`)** : Cette fonction boucle sur **21 collections** Firestore, réalise un *diff* local entre l'ancien état et le nouvel état React (`db` vs `newDb`), et sauvegarde toute différence.
*   **`setDoc()`** : Est exclusivement utilisé par `saveDB()` pour **écraser intégralement** chaque document détecté comme modifié, sans l'option `merge: true`.
*   **`updateDoc()`** : **0 occurrence** dans le code métier de `src/`. Aucune mise à jour granulaire n'est effectuée.
*   **`runTransaction()`** : **0 occurrence**.
*   **`FieldValue.increment()`** : **0 occurrence**.
*   **`writeBatch()`** : Utilisé dans 1 seul fichier (`ParentSignup.tsx`).
*   **Mutations d'état global** : L'ensemble des composants (`Grades.tsx`, `Settings.tsx`, `Students.tsx`, `Payments.tsx`, etc.) récupèrent l'état complet depuis `AppContext`, le modifient en mémoire (`const newDb = { ...db }`), et renvoient l'intégralité à `saveDB()`.

---

## 2. Classification des Risques

| Emplacement / Flux | Opération | Risque | Justification |
| :--- | :--- | :---: | :--- |
| **`AppContext.tsx`** | `saveDB()` via `setDoc()` | **P0** | Écrase intégralement le document serveur avec l'état local du client au moment T0. Toute modification concurrente par un autre client au moment T1 est détruite. |
| **`Settings.tsx`** | Modification des frais globaux et paramètres | **P0** | Si deux utilisateurs (ex: Fondateur et Secrétaire) éditent deux champs différents simultanément (ex: "Nom de l'école" et "Frais de cantine"), le dernier qui sauvegarde efface le travail de l'autre. |
| **`Students.tsx`** | Ajout d'élève et mise à jour des limites SaaS | **P0** | Write Skew : Si l'école approche de sa limite SaaS (ex: 999/1000 élèves) et que deux secrétaires ajoutent un élève en même temps, le test local autorise les deux. Sans transaction ni `increment()`, le dépassement de quota est silencieux. |
| **`Payments.tsx`** | Saisie de paiements et bilans financiers | **P0** | Risque massif d'incohérence comptable. Une modification concurrente des frais payés par un élève écrase les paiements saisis par l'autre caissier. |
| **Général** | Conflits Inter-Onglets | **P1** | L'état `db` est mis en cache. Un onglet laissé ouvert pendant 2h, s'il déclenche `saveDB()`, réécrit toute la base dans le passé. |

---

## 3. Analyse de Concurrence

Les preuves issues du code confirment la présence systémique des vulnérabilités suivantes :

1.  **Lost Update (Mise à jour perdue)** : Prouvé par l'usage exclusif de `setDoc()` sans options de fusion. Le client lit, modifie, écrit. Si la donnée serveur a changé entre la lecture et l'écriture, cette évolution est écrasée.
2.  **Write Skew (Désalignement en écriture)** : Prouvé par la lecture des quotas d'élèves (`studentsCount`) en front-end suivie d'une écriture asynchrone non-transactionnelle.
3.  **ABA Problem / Stale State** : Prouvé par la centralisation de l'état dans `AppContext`. L'absence d'abonnement temps réel strict sur toutes les vues permet à l'utilisateur de travailler sur un état obsolète (*Stale State*) et de le forcer sur le serveur.
4.  **Race Conditions sur les compteurs** : Prouvé par l'absence d'utilisation de `FieldValue.increment()`. Tout compteur financier ou démographique est faux en cas d'écritures simultanées.

---

## 4. Plan de Migration Stratégique

L'architecture actuelle doit être démantelée pour passer d'une logique "Client-Side State Sync" à une logique "Atomic Backend Operations".

*   **Phase 1 : Dépréciation du Diff Local** 
    Arrêter d'utiliser `saveDB()`. Refactoriser les formulaires pour qu'ils opèrent indépendamment de l'état global.
*   **Phase 2 : Mises à jour granulaires (`updateDoc`)**
    Remplacer les appels à `setDoc` par `updateDoc` pour ne cibler que les champs modifiés (particulièrement vital dans `Settings.tsx`).
*   **Phase 3 : Opérations Atomiques (`increment`)**
    Auditer et remplacer toutes les manipulations de compteurs (`studentsCount`, totaux financiers) par des opérations serveur atomiques via `increment()`.
*   **Phase 4 : Transactions (`runTransaction`)**
    Encapsuler les opérations financières lourdes impliquant plusieurs documents (Paiement = création Reçu + mise à jour Solde Élève + mise à jour Caisse) au sein d'une seule transaction Firestore.
*   **Phase 5 : Gestion du Contexte (State Management)**
    Remplacer le chargement massif initial (`const collectionsToFetch = [...]`) par des écouteurs temps réel (`onSnapshot`) cloisonnés par page, éliminant ainsi le Stale State inter-onglets.

---

## 5. Plan de Validation

Pour certifier la résolution de ce chantier (P0-003), la stratégie de validation exigera :

1.  **Tests Playwright de Concurrence :** Scripts automatisés simulant deux caissiers (Context A et Context B) saisissant un paiement pour le même élève exactement à la même seconde. Le test passe si le solde final reflète bien les *deux* montants.
2.  **Audit du code (Linter) :** Ajout d'une règle CI interdisant l'utilisation de `setDoc` sans l'option `merge: true` dans le code métier front-end.
3.  **Multi-tabs Testing :** Vérification manuelle stricte de la résilience inter-onglets (modifier un réglage dans l'onglet 1, puis un autre réglage dans l'onglet 2, s'assurer que les deux coexistent).
4.  **Tests Unitaires Firestore :** Validation via émulateurs locaux des écritures asynchrones sur les règles de limites SaaS (empêcher le dépassement même avec des requêtes concurrentes à la milliseconde).

**Critère de clôture officiel :** Élimination totale de `saveDB` et 0 `setDoc` global recensé dans l'architecture front-end.
