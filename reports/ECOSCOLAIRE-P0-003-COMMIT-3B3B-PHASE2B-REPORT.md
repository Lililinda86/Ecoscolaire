# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE2B — REPORT

**Rôle :** Principal Cloud Architect, Principal Firestore Engineer
**Date :** 28 Juin 2026
**Commit SHA :** `e17d921c0583a38fc30641602f30a18f306f604e`

---

## 1. Scope
Seuls les fichiers suivants ont été impactés :
- `functions/src/importStudents.ts`
- `functions/src/studentImportDiscovery.ts` (Nouveau Helper exclusif)
- `tests/functions/test-import-job-processor.cjs`
- `tests/functions/test-student-import-discovery.cjs`

## 2. Architecture
L'architecture implémente le pattern **Pre-flight / Discovery**. Aucune écriture (ni `create` ni `update`) n'est effectuée sur Firestore. Le composant effectue un scan en lecture, classe les lignes en mémoire (`creates[]`, `updates[]`), effectue le calcul du quota prévisionnel de manière mathématique simple (`studentCount + newStudents`), et s'arrête. 

## 3. Algorithme Discovery
L'algorithme se déroule en 3 sous-étapes consécutives et décorrélées :
1. **Filtre en mémoire (Doublons)** : Identification des duplicatas de matricule au sein même du fichier Excel par l'utilisation d'un `Set` des ID déterministes.
2. **Scan Firestore (Read-Only)** : Découverte des étudiants déjà existants par vérification des ID déterministes (hash SHA-256 de Phase 2A) sans re-télécharger leurs documents complets, optimisé via chunking (par blocs de 100).
3. **Calcul & Classification** : Remplissage des baquets `creates[]` et `updates[]` et comptage de `newStudents` pour vérifier mathématiquement le dépassement des limites logicielles SaaS du tenant (école).

## 4. Gestion des doublons
Avant tout appel au réseau Firestore, l'algorithme lit chaque ligne normalisée de la Phase 2A.
Si l'`id` (hash déterministe) a déjà été vu dans le payload en cours de lecture, la ligne redondante est retirée du flux, ignorée, et expédiée dans la catégorie `skippedRows` avec la mention `reason: 'DUPLICATE_IN_FILE'`.

## 5. Lecture Firestore
Afin d'éviter l'engorgement (et le dépassement de la limite Google Cloud Firestore limitant à 100 documents maximum par appel `getAll`), la liste des IDs uniques restants est partitionnée en chunks de 100 éléments.
Chaque chunk déclenche un appel asynchrone unifié (`db.getAll(...docRefs)`). Si un document `snapshot.exists` vaut `true`, l'objet métier de l'élève est basculé dans les mises à jour, sinon dans les créations. 

## 6. Calcul des quotas
Un appel simple `schoolRef.get()` lit le `studentCount` courant de l'école (pas de transaction) ainsi que la limite `studentLimit`.
On calcule `futureCount = currentStudentCount + newStudents`.
Si `futureCount > studentLimit`, la Cloud Function lève immédiatement une erreur claire `QUOTA_EXCEEDED` détaillant le manque de place et crashe. La réservation transactionnelle interviendra uniquement en Phase 2C si cette validation Discovery a réussi.

## 7. Résultats des tests
7 scénarios de test rigoureux avec assertions strictes ont été écrits :
```text
✅ 1. fichier sans doublon (tous nouveaux)
✅ 2. doublons internes
✅ 3. quota dépassé
✅ 4. tous existants
✅ 5. mélange créations / mises à jour
✅ 6. erreur Firestore (Vérifie le rejet d'une exception DEADLINE_EXCEEDED)
✅ 7. payload vide

=== RÉSULTATS: 7 PASS, 0 FAIL ===
```
*Le test d'intégration existant de la Phase 1 (`test-import-job-processor.cjs`) a également été mis à jour avec des mocks complets pour `getAll` et a passé ses tests.*

## 8. Build
Les commandes `cd functions && npm run build` s'achèvent avec succès. Aucun avertissement TypeScript.

## 9. Limites restantes
- **Aucune Écriture** : L'état `creates[]` et `updates[]` est purement calculé en mémoire vive mais jeté en fin de processus actuel car le véritable module BulkWriter n'est pas encore pluggé.
- **Réservation Quota (Write Skew)** : La Cloud Function ne met toujours pas à jour le quota sur Firestore de façon Transactionnelle. Cela devra être implémenté à la Phase 2C.
- **Pas de Batch Progress** : Aucun statut n'est renvoyé au client sur le taux d'avancement.

## 10. Verdict
**COMMIT CREATED — READY FOR REVIEW**
