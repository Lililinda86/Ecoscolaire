# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE1 — SECURITY & RELIABILITY REVIEW

**Rôles :** Principal Cloud Functions Reviewer, SRE, Security Auditor
**Date :** 28 Juin 2026
**Commit Audité :** `955a71bf818b712d761a97cea57bd439ff984580`

---

## 1. Scope Review
**Verdict : CONFORME**
Seuls les fichiers `importStudents.ts`, `index.ts`, `src/types/index.ts` et le test mocké `.cjs` ont été modifiés. Aucune modification non autorisée (ex: `Students.tsx` ou l'incrémentation de quota) n'a été détectée.

## 2. Trigger Review
**Verdict : SÉCURISÉ**
L'utilisation de `onDocumentCreated('student_import_jobs/{jobId}')` (Gen 2) avec `maxInstances: 10` et `timeoutSeconds: 540` protège l'infrastructure contre une exécution hors de contrôle (atténuation DoS). Le déclenchement `at-least-once` d'Eventarc a été correctement mitigé par la transaction.

## 3. Lock Transactionnel (Idempotence)
**Verdict : SÉCURISÉ**
La Cloud Function démarre par une `db.runTransaction` vérifiant strictement `status === 'PENDING'`. Toute redondance (retries d'Eventarc, concurrence, redéclenchement) est neutralisée (renvoi de `false` silencieux sans lever d'erreur). Le lock transactionnel est inviolable en l'état.

## 4. Zombie State (Fiabilité)
**Verdict : ACCEPTABLE (POUR PHASE 1)**
Si le process plante brutalement (OOM, Timeout pur, panne GCP) après avoir écrit `VALIDATING` et avant d'avoir écrit `FAILED` ou `VALIDATING_COMPLETE`, le job reste bloqué (état Zombie).
*Évaluation du Risque :* Ce scénario corrompt l'UI de l'utilisateur (job bloqué indéfiniment), mais **NE CORROMPT PAS** la base de données (le quota SaaS n'a pas été consommé). Il faudra implémenter un heartbeat (`heartbeatAt`) ou une Cloud Task de nettoyage périodique en production, mais pour cette fondation atomique, le risque est confiné et acceptable.

## 5. Storage Validation
**Verdict : SÉCURISÉ**
La reconstruction serveur du path `import_jobs_data/${schoolId}/${jobId}.json` interdit toute falsification d'URL par un client malveillant tentant de faire parser un fichier arbitraire. Le contrôle brutal de la limite de taille à `10MB` via la taille du buffer protège contre les JSON bombs avant le `JSON.parse`.

## 6. Payload Validation
**Verdict : SÉCURISÉ**
L'assertion `totalRows === payload.length` garantit que l'UI cliente et le backend sont synchronisés sur le volume du job. L'absence de rows (payload vide) et le type JSON invalide sont gérés par blocage et statut `FAILED`.

## 7. Error Handling
**Verdict : SÉCURISÉ**
Chaque `throw new Error(...)` est encapsulé par le block `catch` final qui consigne un état `FAILED` avec `errorCode`, `errorMessage` et les timestamps. Les messages remontés sont explicites ("Row count mismatch", "Invalid JSON format") et n'exposent pas la stack trace interne.

## 8. Tests
**Verdict : PREUVE LOGIQUE OBTENUE (MOCK)**
Les tests exécutés sont purement mockés (Dependency Injection de Firebase Admin).
*Ce qu'ils prouvent :* Le contrôle de flux (si le chemin est faux, le statut est `FAILED`).
*Ce qu'ils ne prouvent pas :* L'isolation transactionnelle réelle du moteur Firestore contre deux commits parfaitement simultanés.
L'intégration Emulator complète sera obligatoire (Phase 4) avant la mise en production, mais la preuve mockée suffit pour valider la logique de cette Phase 1.

## 9. Build Review
**Verdict : SUCCESS**
Les builds TypeScript des dossiers racine et `functions` sont passés, garantissant qu'aucune anomalie de typage n'a été introduite.

---

# RISQUES RÉSIDUELS (Dette Technique Tolérée)
- Pas de Cleanup automatique des Jobs Zombies (bloqués en `VALIDATING`).

# VERDICT
**APPROVED FOR PUSH**
