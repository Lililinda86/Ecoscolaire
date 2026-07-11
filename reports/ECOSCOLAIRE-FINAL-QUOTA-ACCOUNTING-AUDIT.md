# ECOSCOLAIRE — FINAL FORENSIC AUDIT — QUOTA ACCOUNTING & RECONCILIATION

**Auditeurs :** Principal Accounting Systems Architect, Staff Firestore Engineer
**Date :** 28 Juin 2026

## 1. Crash Analysis (Scénarios de Dérive)
Le modèle comptable actuel repose sur une réservation pessimiste (`reservedCreatesCount = N`) suivie d'un remboursement asynchrone calculé depuis la RAM (`failedCreates`).

- **Crash 1 : Mort du process pendant le BulkWriter (Job = RUNNING, 50% créés)**
  - Le Sweeper redémarre le job, relance la Phase 2B. 
  - La Phase 2B voit 50% existants, et les classe en `updates`. Les 50% restants en `creates`.
  - Le nouveau BulkWriter termine. Le Job passe à `SUCCESS`.
  - **Résultat :** Quota exact. 100% des élèves créés, réservation de N justifiée. **PAS DE DÉRIVE.**

- **Crash 2 : Perte RAM d'un échec `ALREADY_EXISTS` (Double Facturation)**
  - Réservation de +100.
  - Un admin crée manuellement un élève X (Quota +1, Total DB = K + 1).
  - Le BulkWriter tente de créer X -> Échec `ALREADY_EXISTS`. Il incrémente `failedCreates` en RAM.
  - Le processus crashe (OOM, Timeout) avant la sauvegarde. Job reste `RUNNING`.
  - Le Sweeper relance 2B. X est détecté comme existant et passe en `updates`.
  - BulkWriter termine. Job passe à `SUCCESS`. `failedCreates` est à 0.
  - **Résultat :** Le remboursement de 1 n'a jamais lieu. L'école a été facturée +1 par l'admin, et +1 par le job pour le même élève. **DÉRIVE POSITIVE (SURFACTURATION).**

## 2. FAILED Analysis (Free Students)
L'état `FAILED` implique actuellement un remboursement **total** du quota réservé.
Si une exception non interceptée (ex: TypeError imprévue) survient dans le thread Cloud Function *après* que le BulkWriter a inséré 40 élèves, le bloc `catch` global bascule le job en `FAILED`.
- La Phase 2E remboursera les 100 unités réservées.
- **Résultat :** 40 élèves ont été physiquement créés en base, mais le compteur est revenu à son état initial. **DÉRIVE NÉGATIVE (ÉLÈVES GRATUITS).**

## 3. PARTIAL_SUCCESS Analysis
Le champ `failedCreates` est correct *uniquement si le processus originel survit jusqu'à la transaction finale*. Toute perte de ce compteur en RAM suite à un arrêt brutal (preemptible VM, OOM) le réinitialisera à 0 lors de la relance par le Sweeper (car la Phase 2B transformera les échecs réels passés en "updates" ou ignorés).

## 4. Counter Drift
- **Compteur trop haut :** Démontré (Crash après ALREADY_EXISTS).
- **Compteur trop bas :** Démontré (Exception inattendue menant à FAILED après quelques écritures partielles réussies).
- **Double remboursement :** Empêché par le flag `quotaReconciled`.

## 5. Alternative Architecture
L'architecture actuelle du compteur incrémental (`FieldValue.increment()`) avec réservation optimiste asynchrone est fondamentalement fragile face aux pannes byzantines (crash RAM).

### Solutions robustes :
1. **Recomptage Réel (Agrégation Firestore `COUNT`)** : 
   Au lieu de stocker `studentCount`, la validation du quota lit `await db.collection('students').where('schoolId', '==', id).count().get()`. Firestore facture 1 read pour 1000 index scannés. **Avantage :** 100% exact en tout temps, aucune dérive possible, aucune Phase 2E complexe requise. **Inconvénient :** Incompatible avec le blocage stochastique du BulkWriter en cours de route.
2. **Quota Ledger (Event Sourcing)** :
   La collection `schools/{id}/quota_ledger` enregistre des documents mathématiques `{ reserved: +100, refunded: -5, jobId: 'xyz' }`. Une Cloud Function recalcule périodiquement la somme. L'idempotence est garantie par le `jobId`. Si un crash survient, le job finalise son ledger avec le décompte réel. 

---

# 6. VERDICT FINAL

L'audit mathématique et distribué prouve que le compteur agrégé `schools.studentCount` est susceptible de désynchronisation silencieuse en cas de crashs destructifs ou d'exceptions Runtime au milieu des batchs. Bien que ces scénarios soient rares (probabilité de l'ordre de 0.01%), ils brisent l'invariance stricte de facturation SaaS.

**DÉRIVE POSSIBLE**
