# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE2C — FINAL DISTRIBUTED SYSTEMS REVIEW

**Auditeurs :** Principal Distributed Systems Architect, Principal Firestore Engineer
**Date :** 28 Juin 2026
**Commit Audité :** `b41d2afc77626aa8f5647d0b77e7a5edbc162340`

---

## 1. Audit Transaction Firestore
**Verdict : PROUVÉ (Sûr)**
Une seule et unique `db.runTransaction()` englobe à la fois la vérification du statut du Job (pour éviter le double trigger) et la vérification du quota de l'école. Aucune lecture n'est effectuée hors transaction pour conditionner une écriture. Le **Write Skew** est formellement impossible car Firestore verrouillera la validation grâce à son contrôle de concurrence optimiste (OCC). 

## 2. Audit Idempotence
**Verdict : PROUVÉ (Sûr)**
Le code évalue `jobData.status`.
- Si `VALIDATING_COMPLETE` : procède à l'évaluation.
- Si `RUNNING`, `SUCCESS`, ou `FAILED` : retourne immédiatement `isNoOp: true` **à l'intérieur de la transaction**.
Un double trigger Eventarc lancera deux transactions concurrentes. L'une d'elles commitera en premier, passant le job à `RUNNING`. L'autre sera rejouée (OCC abort), lira `RUNNING`, et fera un no-op propre, empêchant toute double réservation.

## 3. Audit FAILED hors transaction
**Verdict : ÉCHEC CRITIQUE (FAILED UPDATE RACE)**
Lorsqu'une exception métier est levée dans la transaction (ex: `QUOTA_EXCEEDED`), l'erreur est attrapée dans le `catch` global, et le code effectue :
```typescript
await jobRef.update({ status: 'FAILED', ... });
```
**Cette écriture est inconditionnelle.** 
**Scénario de Race Condition destructif :**
1. L'instance A tente de réserver, lève `QUOTA_EXCEEDED` car le quota est à 95/100, et est suspendue (pause CPU/Réseau).
2. Un administrateur passe la limite à 200/100.
3. L'instance B (un retry Eventarc par exemple) relit, valide la transaction, passe le job à `RUNNING` et commence à créer les élèves.
4. L'instance A se réveille, sort du bloc catch et exécute son `jobRef.update({ status: 'FAILED' })` inconditionnel.
**Résultat :** Le job est marqué `FAILED` alors que le quota a été prélevé par l'instance B et que le BulkWriter tourne potentiellement en arrière-plan.
*Correction exigée :* Utiliser les Préconditions Firestore `update(jobRef, { status: 'FAILED' }, { precondition: { updateTime: ... } })` ou rouvrir une transaction pour écrire l'échec.

## 4. Audit Atomicité
**Verdict : PROUVÉ**
L'incrément de `studentCount` et le passage à `RUNNING` sont encapsulés dans des `transaction.update` consécutifs validés atomiquement par le moteur Firestore. Il ne peut y avoir de désynchronisation persistée.

## 5. Audit Exceptions Techniques
**Verdict : PROUVÉ**
- Les erreurs `ABORTED` (Conflits OCC) sont gérées nativement et rejouées par le SDK Firebase Admin.
- Les erreurs `DEADLINE_EXCEEDED` ou `UNAVAILABLE` bulleront et déclencheront le `catch` parent d'`importStudents.ts`, mettant fin au traitement sans affecter le quota.

## 6. Audit Concurrence
**Verdict : PROUVÉ (Couvert par l'OCC)**
Toute simultanéité d'imports sur la même école entraînera une contention sur le document `schools/{schoolId}`. Les transactions s'exécuteront en série logique, garantissant qu'aucun quota négatif ou réservation écrasée ne se produise.

## 7. Audit Zombie
**Verdict : DÉMONTRÉ (Dette Architecturale Reconnue)**
- **Crash scénario** : Si le processus Node.js fait un OOM ou TimeOut juste après le commit de la transaction, le `studentCount` est incrémenté et le job est `RUNNING`.
- **Données persistées** : Quota réservé.
- **Données perdues** : Aucun élève créé.
- **Impact client** : Le client "perd" temporairement sa capacité SaaS d'import.
- **Solution** : La Phase 2D (BulkWriter) ne suffira pas car le thread est mort. Il faudra obligatoirement une Phase 2E implémentant un "Sweeper" (Cloud Scheduler) pour détecter les jobs bloqués à `RUNNING` depuis plus de 15 minutes et lancer une réconciliation (comptage réel ou libération du `reservedCount`).

## 8. Audit Tests
**Verdict : PARTIEL**
Les tests métier sont d'excellente qualité, mais le cas concurrent sur l'écriture du `FAILED` (Race Condition expliquée au point 3) n'a logiquement pas pu être intercepté par le mock actuel.

## 9. Dette Technique
- **[CRITIQUE] FAILED Update Race** : Bloque la Phase 2D. Doit être corrigé immédiatement via une précondition ou une transaction.
- **[HAUTE] Job Zombie Recovery** : Un sweeper est obligatoire pour nettoyer les quotas gelés en cas de crash (Phase 2E). Ne bloque pas le développement immédiat de la Phase 2D.

---

# VERDICT FINAL

L'implémentation algorithmique de la transaction est excellente, mais la gestion des rejets hors-transaction souffre d'un défaut classique de conception distribuée (Blind Overwrite).

**BLOCKED — FAILED UPDATE RACE**
