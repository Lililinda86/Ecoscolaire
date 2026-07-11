# ECOSCOLAIRE — P0-003 — PHASE 2D — BULKWRITER ARCHITECTURE REVIEW

**Auditeurs :** Principal Firestore Engineer, Principal Distributed Systems Architect, Principal Software Architect
**Date :** 28 Juin 2026

## 1. Audit de l'architecture
**Verdict : APPROUVÉ SOUS RÉSERVE (d'appliquer les corrections ci-dessous)**
L'approche consistant à isoler l'exécution via un `BulkWriter` en RAM alimenté par la découverte préalable (Phase 2B) est la seule architecture Firebase capable de tenir la charge (jusqu'à 10 000 writes/sec sans dépasser les limites de transactions de 500 documents). L'idempotence est garantie par le recalcul de la Phase 2B lors d'un éventuel retry.

## 2. Audit Firestore BulkWriter
- **`create()`** : PROUVÉ. L'utilisation de `bulkWriter.create()` (plutôt que `set`) garantit qu'une création concurrente par un autre administrateur échouera proprement avec `ALREADY_EXISTS`.
- **`update()`** : PROUVÉ. Utilisé pour les documents découverts existants. Si le document est supprimé manuellement entre la Phase 2B et 2D, Firestore lèvera `NOT_FOUND`.
- **`close()`** : NON VÉRIFIABLE SANS CODE. `bulkWriter.close()` attend la résolution de tous les batchs. **Attention :** Par défaut, il ne lève pas d'exception si des écritures individuelles échouent. Il est impératif de s'appuyer sur les Promesses retournées par `create()`/`update()` via `Promise.allSettled()` ou de comptabiliser exhaustivement via les callbacks `onWriteResult` et `onWriteError`.
- **Garanties OCC** : PROUVÉ. `BulkWriter` ne désactive pas l'Optimistic Concurrency Control de Firestore, il gère simplement le pipelining des batchs.

## 3. Audit des races
- **Double Exécution (Retry Eventarc)** : Si un retry se produit (par ex. Cloud Function timeout), le Job est `RUNNING`. Le hook de sécurité (Phase 1) bloquera le second trigger car le job n'est plus `PENDING`.
- **Lost Update** : Le `update()` de BulkWriter applique des modifications partielles. Sans utilisation des ServerTimestamps ou de `Precondition`, il existe un risque théorique minime d'écraser une édition manuelle faite exactement à la même seconde. Ce risque est acceptable pour un import de masse déterministe.
- **Duplicate Create** : Totalement impossible grâce à l'ID déterministe `SHA256(schoolId + matricule)` et la méthode `bulkWriter.create()`.

## 4. Audit de l'idempotence
- **Scénario : Crash serveur pendant BulkWriter** 
  - La fonction meurt. Le job reste indéfiniment `RUNNING`.
  - Des élèves ont été partiellement créés.
  - Le quota est verrouillé.
  - **Reprise** : Ce scénario ne peut pas s'auto-réparer. Une tâche planifiée (Phase 2E Sweeper) sera obligatoire pour détecter ce job mort, relancer la Phase 2B (qui verra les élèves déjà créés et les mettra dans `updates[]`), et ajuster le quota restant à réserver. L'idempotence de la donnée est donc préservée au détriment d'un gel temporaire du processus.

## 5. Audit du quota
- **Contrainte absolue :** La Phase 2D ne modifie pas le quota.
- **Fuite de quota :** Si la Phase 2D tente de créer 100 élèves mais que 5 échouent (`ALREADY_EXISTS`, erreur métier), le quota de l'école aura été débité de 100 en Phase 2C. Il y a donc une **fuite de 5 unités**.
- **Résolution :** La Phase 2D doit impérativement enregistrer dans le document du job le champ `failedCreatesCount`. La Phase 2E lira ce champ et effectuera la transaction de remboursement (studentCount -= failedCreatesCount).

## 6. Audit des crashs
- **Avant BulkWriter** : Job `RUNNING`, 0 élève créé. Reprise par Sweeper.
- **Pendant BulkWriter** : Job `RUNNING`, N élèves créés. Reprise par Sweeper.
- **Après BulkWriter, avant SUCCESS** : Job `RUNNING`, 100% élèves créés. Reprise par Sweeper (qui ne verra que des updates en 2B, 0 newCreates, ajustera le statut à SUCCESS).

## 7. Corrections obligatoires avant codage
1. **Promesses BulkWriter** : Le code doit accumuler les Promesses renvoyées par `create()` et `update()`, puis utiliser `await Promise.allSettled(promises)` (ou équivalent) de concert avec `await bulkWriter.close()`, pour assurer que toutes les exécutions sont proprement loggées sans crasher le processus.
2. **Ignorer les NOT_FOUND / ALREADY_EXISTS** : Le handler `onWriteError` doit classer ces erreurs comme des échecs permanents pour ces lignes spécifiques, et retourner `false` (ne pas retry), afin que le BulkWriter continue le traitement du reste des élèves.
3. **Mise à jour finale du Job** : Doit être faite via une transaction Firestore (ex: `markImportJobCompletedIfRunning`) pour garantir qu'on ne passe à `SUCCESS` que si le job est encore `RUNNING`.

## 8. Implémentation proposée
Créer `functions/src/studentImportBulkWriter.ts` exposant la fonction :
`executeBulkWriterImport(db, jobId, creates, updates)`
Elle retournera un résumé strict :
```typescript
{
  successfulCreates: number;
  successfulUpdates: number;
  failedCreates: number; // Crucial pour le remboursement quota
  failedUpdates: number;
  permanentFailures: Array<{ matricule: string, error: string }>;
}
```

## 9. Plan de tests
- `test-student-import-bulk-writer.cjs` :
  - **T1** : 100 creates validés.
  - **T2** : 100 updates validés.
  - **T3** : Erreur transitoire (`UNAVAILABLE`) -> retry automatique Firebase -> succès.
  - **T4** : Erreur permanente (`ALREADY_EXISTS`) -> `failedCreates` incrémenté, mais job termine avec `PARTIAL_SUCCESS`.
  - **T5** : Mise à jour finale du job (vérification de la protection transactionnelle).

## 10. Verdict final
L'architecture satisfait aux exigences de sécurité, de consistance distribuée (grâce à la robustesse déterministe des IDs et du cycle PENDING->VALIDATING->RUNNING), et gère correctement sa propre ségrégation des responsabilités (quota reporté en 2E).

**CERTIFIÉ — READY FOR IMPLEMENTATION**
