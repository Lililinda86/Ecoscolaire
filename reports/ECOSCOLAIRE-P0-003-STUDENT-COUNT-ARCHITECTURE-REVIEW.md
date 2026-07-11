# ECOSCOLAIRE — P0-003 — STUDENT COUNT ARCHITECTURE REVIEW

**Auteur :** Principal Software Architect / SaaS Architect
**Date :** 28 Juin 2026

---

## 1. Analyse Critique de l'Architecture Initiale (Option A : Compteur Incrémental Simple `studentCount`)

L'idée d'introduire un champ `schools/{schoolId}.studentCount` géré manuellement par les transactions clientes pour valider les quotas SaaS présente de graves lacunes structurelles à long terme :

### Défauts Identifiés :
1. **Désynchronisation Silencieuse (Drift) :**
   Si un administrateur supprime directement un élève depuis la console Firebase, le compteur n'est pas mis à jour. L'école se retrouve avec une capacité "fantôme" consommée.
2. **Vulnérabilité aux Rollbacks et Imports Partiels :**
   Lors d'un import massif Excel (ex: 300 élèves), la transaction peut échouer à mi-chemin si le batch dépasse 500 documents. Si le code échoue ou si le réseau coupe après avoir mis à jour le compteur mais avant d'écrire tous les élèves, l'école est paralysée.
3. **Firestore Hotspotting :**
   Bien que Firestore ait été optimisé, faire de très nombreuses écritures concurrentes sur le même document `school` (pour l'incrément) peut entraîner des erreurs de contention (`ABORTED`) et dégrader l'expérience utilisateur, notamment en début d'année scolaire lors des saisies massives.
4. **Maintenance :** 
   Toute nouvelle fonctionnalité (ex: archivage, soft delete, migration historique) devra penser à décrémenter/incrémenter le compteur. C'est une dette technique latente.

---

## 2. Évaluation des Alternatives

### Option B : Firestore Count Aggregation (`getCountFromServer()`)
- **Mécanisme :** Le client compte dynamiquement le nombre d'élèves via `getCountFromServer(query)`.
- **Avantage :** Toujours 100% juste. Aucune désynchronisation possible.
- **Défaut fatal :** Firestore **interdit mathématiquement** d'utiliser `getCountFromServer()` à l'intérieur d'une transaction (`runTransaction`). Il est donc impossible d'utiliser cette option pour bloquer une Race Condition (deux utilisateurs lisant N-1 simultanément hors transaction, et créant tous les deux).
- **Verdict :** Rejeté pour la garantie transactionnelle.

### Option C : Cloud Functions pures (Event-Driven)
- **Mécanisme :** Un trigger `onCreate`/`onDelete` met à jour un compteur, OU un endpoint HTTP valide et crée l'élève.
- **Avantage :** Sûr et géré par le backend. Résiste aux manipulations depuis la console.
- **Défaut fatal :** Déplacer la création vers un endpoint HTTP détruit le support *Offline-First* du client Firestore (essentiel dans des zones à faible connectivité). Utiliser des triggers asynchrones ne prévient pas le dépassement initial par Race Condition.
- **Verdict :** Rejeté pour des raisons d'UX (perte d'optimistic updates).

### Option D : Architecture Hybride (Compteur Matérialisé + Réconciliation Automatique)
- **Mécanisme :** 
  1. Le Frontend utilise `runTransaction` avec un `studentCount` matériel sur le document `school` pour garantir l'atomicité et la réaction immédiate hors ligne (Option A).
  2. Un mécanisme backend (Self-Healing / Réconciliation) recalcule périodiquement la vérité via `getCountFromServer()` et corrige automatiquement le `studentCount` en cas de dérive.
- **Avantage :** 
  - Bloque 100% des dépassements concurrentiels (via la transaction).
  - Préserve le mode Offline-First.
  - Corrige automatiquement l'entropie (suppressions manuelles, crash réseau partiels).

---

## 3. Recommandation Architectural

L'objectif d'EcoScolaire est d'être à la fois **robuste financièrement** (respect des quotas) et **résilient techniquement** (pas d'accumulation de dette, offline-first).

**Je recommande formellement l'OPTION D (Architecture Hybride).**

L'Option A seule, sans garde-fou, vous condamnera à des scripts de réparation manuels chaque mois lorsqu'un client se plaindra que sa limite est atteinte alors qu'il manque de la place. L'Option B est techniquement invalide pour Firestore. L'Option C détruit l'UX. 
L'Option D est le standard de l'industrie pour les systèmes distribués NoSQL.

---

## 4. Protocole de Migration & Réconciliation

### Détection de la divergence (Self-Healing)
Comment garantir que `studentCount == nombre réel` sans intervention humaine ?
Nous mettrons en place une **Cloud Function planifiée (CRON Job)** ou un mécanisme de **Verification à la volée**. 

Dans le contexte actuel où le backend est minimal :
Nous pouvons ajouter un utilitaire de **Réconciliation Transparente**. Lors de l'accès à la page `Settings` ou `Dashboard` (opérations à faible criticité temps-réel), l'application peut déclencher un job en tâche de fond qui exécute `getCountFromServer()`. Si la valeur diffère du `studentCount` stocké, le système corrige silencieusement la valeur via `updateDoc()`.

### Migration Initiale (Commit 3) :
1. **Initialisation (Migration) :**
   Écriture d'un script Node.js sécurisé (`scripts/migrate-students-count.mjs`) qui initialise `studentCount` pour chaque école avec la valeur exacte actuelle.
2. **Création / Import (Client) :**
   Modification de `handleSave` et `handleConfirmImport` pour inclure la lecture et la mise à jour (via `increment(N)`) du `studentCount` dans `runTransaction` ou via une logique transactionnelle stricte.
3. **Suppression (Client) :**
   Intégration d'un `increment(-1)` lors de la validation d'une demande de suppression.

---

## 5. Preuves de Certification Requises

Pour que cette architecture soit certifiée en production, l'implémentation (Commit 3) devra prouver :
1. **Preuve de la Limite Stricte :** Lancement de 5 scripts concurrents tentant de créer 5 élèves quand la limite SaaS restante est de 1. Seul 1 doit réussir, 4 doivent recevoir `ABORTED`.
2. **Preuve d'Offline-First :** Déconnexion simulée (extinction réseau) -> création d'élève -> l'UI montre l'élève (Optimistic Update) -> reconnexion -> la transaction se valide.
3. **Preuve d'Auto-Guérison (Réconciliation) :** 
   - Suppression manuelle d'un document Firebase (sans l'App).
   - Lancement de la routine de réconciliation.
   - Le `studentCount` est corrigé automatiquement et les quotas sont rétablis.

---

# VERDICT FINAL

**OPTION D APPROVED** (Architecture Hybride : Compteur Matérialisé + Réconciliation Automatique)

L'architecture est acceptée. Le développement du chantier P0-003 Commit 3 (Implémentation) peut démarrer en suivant strictement ce modèle hybride.
