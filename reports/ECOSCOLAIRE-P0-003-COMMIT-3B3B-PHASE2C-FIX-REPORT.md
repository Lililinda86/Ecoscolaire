# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE2C-FIX — REPORT

**Rôle :** Principal Distributed Systems Engineer
**Date :** 28 Juin 2026
**Commit SHA :** `7633004ea5ae23ab2919df4e0c9d5d11c8d99d7c`

---

## 1. Problème Corrigé
Le blocage `FAILED UPDATE RACE` a été entièrement résolu. L'ancienne implémentation effectuait une mise à jour inconditionnelle vers `status: 'FAILED'` dans le bloc `catch` global, ce qui permettait théoriquement d'écraser un statut `RUNNING` valide si l'instance était suspendue/asynchrone pendant que le même import était relancé et réussissait.

## 2. Stratégie Choisie
J'ai implémenté la fonction recommandée `markImportJobFailedIfCurrent`.
Cette fonction utilise une **Transaction Firestore** pour :
1. Lire l'état exact du document du Job.
2. Vérifier si l'état actuel autorise une transition vers `FAILED`.
3. Écrire le statut *uniquement* si l'état est éligible, ou faire un `no-op` silencieux le cas échéant.

## 3. États Autorisés vs Protégés
- **États protégés (no-op)** :
  `RUNNING`, `SUCCESS`, `PARTIAL_SUCCESS`, `FAILED`.
  *Un job en cours de BulkWriter ou déjà terminé (ou déjà échoué) ne sera jamais écrasé par ce marqueur de retard.*
- **États autorisés (mutation vers FAILED)** :
  `PENDING`, `VALIDATING`, `VALIDATING_COMPLETE`.

## 4. Résultats des Tests
Les 6 tests de validation concurrentielle demandés ont été ajoutés et validés par des assertions strictes dans `test-student-import-quota.cjs` :
```text
✅ 11. markImportJobFailedIfCurrent: VALIDATING_COMPLETE -> FAILED
✅ 12. markImportJobFailedIfCurrent: RUNNING -> reste RUNNING
✅ 13. markImportJobFailedIfCurrent: SUCCESS -> reste SUCCESS
✅ 14. markImportJobFailedIfCurrent: PARTIAL_SUCCESS -> reste PARTIAL_SUCCESS
✅ 15. markImportJobFailedIfCurrent: FAILED -> no-op
✅ 16. markImportJobFailedIfCurrent: Concurrent race -> RUNNING wins

=== RÉSULTATS: 16 PASS, 0 FAIL ===
```
La condition de concurrence (Test 16) confirme qu'une transaction concurrente glissant vers `RUNNING` survit systématiquement à la tentative tardive de forçage en `FAILED`.

## 5. Build
La compilation via `npm run build` n'a levé aucune erreur, le module est sain.

## 6. Dette Résiduelle
- La seule dette restante documentée est le **Job Zombie** (si le processus crashe entre `RUNNING` et l'exécution de BulkWriter). Elle sera traitée en Phase 2E (sweeper) tel qu'approuvé précédemment.

# VERDICT
**COMMIT FIXED — READY FOR REVIEW**
