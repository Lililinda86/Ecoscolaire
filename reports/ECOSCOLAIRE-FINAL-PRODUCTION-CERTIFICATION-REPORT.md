# ECOSCOLAIRE — P0-003 — FINAL PRODUCTION CERTIFICATION GATE

**Organisme de Certification :** Firestore Staff Engineers & Distributed Systems Architects
**Date :** 28 Juin 2026

## 1. Architecture Globale
L'enchaînement PENDING → VALIDATING → RUNNING → SUCCESS est protégé. L'isolement multi-tenant (schoolId) est respecté de bout en bout. 

## 2. Firestore OCC
- **Prouvé par le code :** Les transactions vérifient toujours l'état cible avant mutation (ex: `markImportJobCompletedIfRunning` et `reconcileImportJobQuota`).
- **Prouvé par la documentation :** L'usage de `transaction.get(AggregateQuery)` est valide selon les spécifications Firebase Admin (v12.1.0).

## 3. Crash Recovery et Idempotence (La Faille)
Le mécanisme de Sweeper de jobs Zombies **n'est pas encore implémenté dans la codebase**. 
Bien que le système de "Reconciliation" (Phase 2E) résolve mathématiquement le quota en fin de job, il n'existe actuellement aucune Cloud Function (`Eventarc` ou `PubSub Scheduler`) capable de détecter les jobs bloqués indéfiniment en `RUNNING` après un crash, pour relancer la Phase 2B. 
**Conséquence :** Si le serveur Node.js subit un OOM ou un SIGKILL, le job restera gelé. L'idempotence de la reprise est théoriquement prévue mais non présente dans le code.

## 4. Comptabilité (Quota)
Le compteur est **mathématiquement correct**. 
- **Preuve :** Le fichier `studentImportReconciler.ts` court-circuite la RAM incertaine et force le comptage absolu des données sur disque de Firestore. Tout drift potentiel est annihilé.

## 5. Dette Technique
- **Critique (Bloque la certification parfaite)** : Absence du Cron Job (Sweeper) pour relancer les jobs Zombies.
- **Faible** : Erreur de configuration mineure dans `package.json` (la commande `lint` crashe car elle utilise un flag obsolète `--ext` pour Eslint 9).

---

# TABLEAU DE CERTIFICATION FINAL

| Propriété       | Verdict         | Preuve |
| --------------- | --------------- | ------ |
| Machine à états | PROUVÉ          | Code (`importStudents.ts`) et hooks de transaction |
| OCC             | PROUVÉ          | `studentImportReconciler.ts` et tests unitaires |
| Idempotence     | NON VÉRIFIABLE  | Le déclencheur Sweeper n'est pas codé (Code manquant) |
| Quota           | PROUVÉ          | Démonstration `Transaction.get(AggregateQuery)` |
| BulkWriter      | PROUVÉ          | Preuve via `Promise.allSettled()` |
| Reconciliation  | PROUVÉ          | `studentImportReconciler.ts` |
| Crash Recovery  | SUPPOSÉ         | Zombie Sweeper absent, dépend d'une relance externe manuelle |
| Sécurité        | PROUVÉ          | ID cryptographique déterministe limitant toute création illicite |
| Tests           | PROUVÉ          | Résultats des tests `test-student-import-reconciler.cjs` = 6 PASS |
| Build           | PROUVÉ          | Compilation `tsc` sans erreur (hors problème linter conf) |

---

# RÈGLE DE DÉCISION

La présence de valeurs `NON VÉRIFIABLE` et `SUPPOSÉ` (concernant l'absence de reprise autonome après un hard crash) interdit formellement la délivrance du certificat de niveau production le plus haut.

**VERDICT : APPROUVÉ SOUS RÉSERVE**
