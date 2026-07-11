# ECOSCOLAIRE — P0-003 — COMMIT 3B — STUDENTCOUNT ARCHITECTURE AUDIT

**Auteur :** Comité d'Architecture (Principal Software Architect, Firestore Specialist, QA Lead)
**Date :** 28 Juin 2026

---

## 1. ANALYSE DE L'ARCHITECTURE ACTUELLE

### Création d'Élève (`handleSave`)
- **Fichier :** `src/pages/Students.tsx`
- **Lecture :** Aucune lecture serveur préalable. Vérification client via `isStudentLimitReached`.
- **Écriture :** `setDoc` atomique.
- **Risques :** Double Submit résolu. Cependant, un **Write Skew** majeur subsiste : si 10 utilisateurs vérifient la limite simultanément (ex: il reste 1 place), tous verront que la limite n'est pas atteinte, et tous feront un `setDoc`. La limite sera dépassée de 9.

### Suppression Unitaire (`handleDelete`)
- **Fichier :** `src/pages/Students.tsx`
- **Lecture :** Droits utilisateur.
- **Écriture :** `deleteDoc`.
- **Risques :** Régression métier (Orphan Data). Si géré par compteur, risque d'incohérence si le `deleteDoc` réussit mais que le compteur n'est pas décrémenté (Lost Update sur le décompte).

### Import d'Élèves en Masse (`handleConfirmImport`)
- **Fichier :** `src/pages/Students.tsx`
- **Lecture :** Longueur du tableau local `db.students.length`.
- **Écriture :** Reste sur l'anti-pattern `saveDB({...db, students: [...db.students, ...previewStudents]})`.
- **Risques :** **Write Skew** (contournement massif du quota si deux imports concurrents). **Lost Update** massif sur toute la base via `saveDB()`.

### Suppression de Masse (`handleDeleteAll`)
- **Fichier :** `src/pages/Students.tsx`
- **Écriture :** Anti-pattern `saveDB()`.
- **Risques :** Lost Update.

### Quota SaaS
- **Vérification actuelle :** Exclusivement côté client (`db.students.length`) dans `Students.tsx`.
- **Contournement possible :** Désactivation de la vérification JS, requêtes cURL API, multi-onglets, imports simultanés.

---

## 2. COMPARAISON ARCHITECTURALE

### Option A : `studentCount` incrémenté par le client (sans transaction)
- **Avantages :** Très rapide à coder (un `updateDoc` avec `increment(1)` à côté de `setDoc`).
- **Inconvénients :** Incapacité à conditionner la création. Si la limite est atteinte pendant le transit réseau, l'incrément se fait quand même.
- **Résilience / Offline :** Fonctionne offline, mais aucune garantie financière.
- **Décision :** Rejeté (ne résout pas le Write Skew).

### Option B : Firestore Aggregate Count (`getCountFromServer`)
- **Avantages :** Zéro dérive. Pas besoin de maintenir un compteur.
- **Inconvénients :** `getCountFromServer` n'est **pas supporté dans les transactions Firestore**. Il est impossible de lire un Aggregate Count puis d'écrire conditionnellement au sein du même batch atomique.
- **Décision :** Rejeté (bloquant techniquement pour la concurrence).

### Option C : Cloud Functions (Backend Only)
- **Avantages :** Sécurité absolue. Firestore Rules fermées à l'écriture client. Une fonction `createStudent` vérifie le quota via un index ou une transaction backend.
- **Inconvénients :** Perte de l'Offline First. L'utilisateur doit être connecté pour que l'appel HTTP/Callable aboutisse. La latence augmente. Surcoût financier (Invocations CF + Firestore).
- **Décision :** Non optimal pour une architecture SaaS locale offline-tolerant, sauf si obligatoire.

### Option D : Architecture Hybride (Compteur transactionnel + Réconciliation)
- **Concept :** Un document `schools/{schoolId}` héberge un champ `studentCount`. La création se fait via `runTransaction()` (Lit `studentCount`, vérifie limite, `setDoc` élève, `update` `studentCount`).
- **Avantages :** Résolution parfaite du Write Skew grâce aux garanties ACID de Firestore. Empêche le dépassement strict.
- **Inconvénients :** Les transactions Firestore **échouent offline**. (Toutefois, une création critique de quota justifie d'exiger une connexion internet ponctuelle, contrairement à une simple modification). Contention possible si imports massifs (limite d'environ 1 write/sec sur le document de l'école).
- **Décision :** Approuvé (meilleur compromis intégrité/UX).

### Option E : Sub-collections de Quotas Shardés (Distributed Counters)
- **Concept :** Pour éviter la contention à +1 write/sec, le quota est distribué.
- **Décision :** Rejeté. Le volume de création simultanée d'élèves par seconde dans une seule école est trop faible pour justifier la complexité d'un Sharded Counter.

---

## 3. FIRESTORE : RÈGLES D'UTILISATION

- **`runTransaction`** : À utiliser obligatoirement pour **Création** et **Suppression unitaire** d'élève afin de lire atomiquement `schoolId.studentCount`, valider le quota, créer/supprimer l'élève, et incrémenter/décrémenter le compteur dans une même enveloppe.
- **`writeBatch`** : À utiliser pour **l'Import de masse** et le **Delete All**. Les lots de 500 écritures maximum garantissent une insertion atomique de la classe entière et une mise à jour d'un coup de `studentCount += N`.
- **`updateDoc`** : Réservé à l'édition d'un élève existant (aucune modification de quota).
- **`increment`** : Impossible de lire sa valeur en temps réel pour conditionner une écriture sans transaction. Inutile ici (géré dans `runTransaction`).
- **`setDoc` / `deleteDoc`** : Remplacés par les équivalents transactionnels `t.set(doc)` et `t.delete(doc)` dans les flux de création/suppression.

---

## 4. STRATÉGIE DE RÉCONCILIATION (SELF-HEALING)

Malgré la robustesse de `runTransaction`, le compteur peut se désynchroniser (opérations manuelles via la console Firebase, erreurs inattendues, migrations passées).
**Mécanismes étudiés :**
1. **Cloud Scheduler :** Recalcule `COUNT()` toutes les nuits. (Coût prévisible, silencieux, recommandé).
2. **Dashboard onMount :** Le Super Admin recalcule en ouvrant son tableau de bord. (Pas cher, mais nécessite une action humaine).
3. **Trigger Cloud Functions (`onCreate`/`onDelete`) :** Anti-pattern. Va créer de la contention sur le document école.

**Recommandation :**
- Un bouton **"Recalibrer les Quotas"** dans le menu "Diagnostic" ou "Super Admin" (Immédiat).
- Une **Cloud Function Cron** hebdomadaire (Optionnel, pour scalabilité).

---

## 5. TESTS DE CERTIFICATION

1. **Test Concurrence :** Lancer via un script Node.js 10 requêtes simultanées de création (`Promise.all`) sur une école ayant une limite restante de 1.
   - *Attendu :* 1 succès, 9 échecs "Quota exceeded".
2. **Test Write Skew :** Simulation de deux imports massifs (2x 50 élèves) alors qu'il reste 60 places.
   - *Attendu :* Batch 1 passe, Batch 2 échoue au niveau de la transaction.
3. **Test Offline :** Déconnecter le réseau, tenter de créer un élève.
   - *Attendu :* La transaction Firestore échoue proprement (catch) avec une UI informant "La création d'un nouvel élève requiert une connexion internet pour vérifier la licence".

*(Note : l'architecture Offline complète nécessiterait un compromis de Write Skew différé, mais l'intégrité stricte des licences exige une validation côté serveur).*

---

## 6. ROADMAP MIGRATION 3B

### 3B.1 : Préparation du document `schools`
- **Objectif :** Initialiser `studentCount` sur toutes les écoles existantes et sécuriser les Firestore Rules.
- **Fichiers :** `src/pages/Diagnostic.tsx` (ou création d'un script d'admin), `firestore.rules`.
- **Risques :** Si `studentCount` n'existe pas, la transaction de création plantera.

### 3B.2 : Transactions CRUD Unitaire
- **Objectif :** Remplacer les créations / suppressions de `Students.tsx` par `runTransaction`. Gérer les erreurs offline.
- **Fichiers :** `src/pages/Students.tsx`.
- **Risques :** Régressions UI si le fallback offline est mal géré.

### 3B.3 : Transactions de Masse (Imports / Delete All)
- **Objectif :** Remplacer `handleConfirmImport` et `handleDeleteAll` par un partitionnement en `writeBatch` ou `runTransaction` limités à 500 opérations.
- **Fichiers :** `src/pages/Students.tsx`.
- **Critère d'arrêt :** Fin totale de `saveDB` dans ce module.

---

**FIN DU RAPPORT**
