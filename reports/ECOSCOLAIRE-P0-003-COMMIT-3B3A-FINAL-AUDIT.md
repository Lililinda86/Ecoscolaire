# ECOSCOLAIRE — P0-003 — COMMIT 3B.3A — FINAL FIRESTORE & STORAGE SECURITY AUDIT

**Auditeurs :** Principal Firestore Security Engineer, Principal SaaS Security Architect, QA Lead
**Date :** 28 Juin 2026
**Commit Audité :** `22e043d442a7954aaf0e30f0bd6ff9c6fe9823b0`

---

## ÉTAPE 1 — AUDIT FIRESTORE RULES

### 1.1 Contrôle du CREATE et des Compteurs
Les règles forcent bien `status == 'PENDING'` et la mise à 0 des compteurs (`processedCount`, `createdCount`, `updatedCount`, `skippedCount`, `failedCount`). 
**Cependant**, les types stricts pour les autres champs (comme `totalRows` en tant que `number`) ne sont pas vérifiés.

### 1.2 Vérification `hasOnly()` (Faille Critique)
**FAIL.** Le client peut injecter n'importe quel champ imprévu. Il n'y a aucune instruction `request.resource.data.keys().hasOnly([...])`.
Un utilisateur malveillant pourrait forger une requête de création en y insérant des champs inattendus (`isAdmin: true`, `billingBypass: true`, `isInternalSchool: true`) qui pollueraient la base ou la Cloud Function.

### 1.3 `schoolId`
**PASS.** L'utilisation de `canManagePedagogy(request.resource.data.schoolId)` valide intrinsèquement que `request.resource.data.schoolId` correspond exactement à l'école de l'utilisateur actif.

### 1.4 `storagePath`
**FAIL.** La règle `request.resource.data.storagePath.matches('^import_jobs_data/' + request.resource.data.schoolId + '/.*')` valide le préfixe mais **n'impose pas l'extension `.json`**. Un client peut donc inscrire un chemin menant vers un `.exe` ou `.csv` arbitraire, causant un crash inattendu dans la Cloud Function.

---

## ÉTAPE 2 — AUDIT UPDATE / DELETE

**PASS.** L'instruction `allow update, delete: if false;` est un rempart infranchissable pour les SDK clients. Aucun utilisateur ne peut modifier un job en cours ou modifier son `processedCount`.

---

## ÉTAPE 3 — AUDIT STORAGE RULES

- **Upload, Ecole & Authentification :** **PASS.** Limité par Custom Claims (`request.auth.token.schoolId == schoolId`).
- **Extension :** **PASS.** Le match path est `/import_jobs_data/{schoolId}/{jobId}.json`, forçant l'extension statique.
- **MIME :** **PASS.** Imposé à `application/json`.
- **Taille :** **PASS.** Limité à 10 Mo.
- **Overwrite :** **PASS.** `allow update: if false;` interdit à un utilisateur de remplacer un fichier existant avec le même `jobId`.
- **Lecture :** **PASS.** Isolée aux membres de l'école ou au backend.

---

## ÉTAPE 4 — AUDIT TYPESCRIPT

**PARTIELLEMENT VRAI.** Le type `StudentImportJob` couvre tous les champs demandés. 
Néanmoins :
- Il manque `jobId` explicite (bien qu'il y ait `id`).
- Pas d'incohérence majeure, mais le modèle est un peu permissif (tous les compteurs ne sont pas initialisés dans le type).

---

## ÉTAPE 5 — AUDIT TESTS (`test-p0-003-importjob-3b3a.mjs`)

**FAIL.** Le script utilise des `regex` extrêmement naïves.
- **Faux positif :** Une règle commentée `// allow create: if status == 'PENDING'` pourrait faire passer le test au vert.
- **Faux négatif :** Un retour à la ligne ou un reformatage cassera les tests.
Ces tests statiques ne garantissent **absolument rien** de la sécurité réelle de Firestore. Seule la suite `Firebase Local Emulator` avec tests Unitaires garantit l'inviolabilité.

---

## ÉTAPE 6 — ATTACK REVIEW

| Attaque | Résultat | Justification |
|---|---|---|
| Injection de champs | **FAIL** | Pas de `keys().hasOnly(...)`. Faille de type "Schema Poisoning". |
| `schoolId` différent | **PASS** | `hasSchoolAccess()` empêche le spoofing. |
| `storagePath` falsifié | **FAIL** | Regex dans Firestore Rules trop permissive (ne force pas le `.json`). |
| `processedCount = 999999` | **PASS** | Restreint à 0 à la création, et l'Update est bloqué. |
| `status = SUCCESS` | **PASS** | Restreint à `PENDING` à la création. |
| Overwrite Storage | **PASS** | `allow update: if false`. |
| Upload 300 Mo | **PASS** | Limité à `< 10 * 1024 * 1024`. |
| MIME falsifié | **PASS** | Limité à `application/json`. |
| Lecture d'une autre école | **PASS** | Les claims de `schoolId` sont verrouillés. |
| Création données backend | **FAIL** | Conséquence de l'injection de champs (manque de `hasOnly()`). |

---

## ÉTAPE 7 — DETTE TECHNIQUE

| Dette | Niveau | Impact / Résolution |
|---|---|---|
| Absence de `hasOnly()` dans Firestore Rules | **CRITIQUE** | À corriger immédiatement. Impose un schéma strict. |
| Tests statiques Regex | **CRITIQUE** | Ne prouve rien. Un vrai environnement `firebase-tools/testing` est indispensable. |
| Regex de `storagePath` trop large | **HAUTE** | À corriger pour correspondre au format `.json` exact. |

---

## ÉTAPE 8 — VERDICT

| Domaine | Note /10 |
|---|---|
| Firestore Rules | 4/10 |
| Storage Rules | 10/10 |
| Modèle (TypeScript) | 8/10 |
| Sécurité globale | 5/10 |
| Robustesse (Tests) | 1/10 |
| Production Readiness | 3/10 |

### **BLOCKED — FIRESTORE RULES UNSAFE**

**Justification :** L'absence du filtrage des clés `keys().hasOnly()` permet des attaques de type *Schema Poisoning*. Un attaquant peut injecter des payloads non prévus dans la base, risquant de compromettre les futures Cloud Functions ou de polluer la base. De plus, la tolérance sur le format du chemin `storagePath` dans Firestore permet de lier un document avec un fichier non conforme au format JSON. Le commit est rejeté en l'état.
