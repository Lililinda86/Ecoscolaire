# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE2 — PRE-IMPLEMENTATION ARCHITECTURE REVIEW

**Auditeurs :** Principal Cloud Architect, Principal Firestore Architect, BulkWriter Specialist, SRE
**Date :** 28 Juin 2026

---

## ÉTAPE 1 — Architecture BulkWriter
**Analyse :**
- `Transaction` : Limite dure de 500 écritures. Inadapté pour les imports massifs (10 000+).
- `WriteBatch` : Limite de 500 écritures. Échoue entièrement si 1 erreur survient. Nécessite une boucle complexe de `commit()`. Pas de gestion native du backoff (erreurs 429).
- `BulkWriter` : Conçu par Google pour l'ingestion massive. Gère automatiquement les limites Firestore (10 000 writes/sec), implémente un retry exponentiel pour les erreurs transitoires (ex: *UNAVAILABLE*).
**Verdict (Démontré) :** `BulkWriter` est l'unique solution viable. 
**Limite :** BulkWriter ne garantit pas l'atomicité globale (Partial Success possible). 

## ÉTAPE 2 — IDs Déterministes (Upsert)
**Stratégies :**
- *UUID aléatoire* : (Rejeté) Corrompt l'idempotence. Un retry de job créera des doublons.
- *SHA256(schoolId + nom + prénom + naissance)* : (Probable) Gère l'absence de matricule, mais un correctif orthographique créera un doublon fantôme.
- *SHA256(schoolId + matricule)* : (Démontré optimal si matricule obligatoire). L'identifiant est immuable. 
**Recommandation métier :** Forcer la présence d'un matricule unique par élève dans l'Excel. L'ID Firestore de l'élève sera `hash("school_" + schoolId + "_mat_" + matricule)`. Si absent, rejeter la ligne.

## ÉTAPE 3 — Algorithme d'Upsert & Comptage
**Problématique :** `BulkWriter.set(..., {merge: true})` écrase les données mais ne retourne pas d'information sur la nature de l'opération (Création vs Mise à jour). Il est donc impossible de compter précisément les nouveaux élèves.
**Algorithme Recommandé (Démontré) :**
1. Tenter un `BulkWriter.create(docRef, data)`.
2. Intercepter l'erreur via `bulkWriter.onWriteError`.
3. Si l'erreur est `ALREADY_EXISTS` (Code 6) : 
   - Incrémenter `updatedCount`.
   - Repousser l'opération via `BulkWriter.update(docRef, data)`.
   - Retourner `true` au gestionnaire d'erreur pour indiquer que l'erreur est gérée.
4. Si succès du `create` : Incrémenter `createdCount`.

## ÉTAPE 4 — Calcul du Quota SaaS (`studentCount`)
**Problématique :** Nous ne pouvons pas dépasser le `studentLimit`.
- *Incrément après BulkWriter* : Les élèves sont déjà créés, le quota est violé a posteriori. (Rejeté).
- *Incrément avant BulkWriter (+ totalRows)* : On réserve `totalRows`. Si on a 5000 limites, 4000 élèves existants, et on importe 2000 mises à jour, la réservation demande 6000 et échoue à tort (Faux positif). (Rejeté).
**Solution Architecturale Optimale (Probable) : Phase de Découverte :**
Avant d'ouvrir le `BulkWriter`, le backend doit calculer les créations exactes :
1. Extraire tous les IDs déterministes du JSON.
2. Faire un `getAll(...)` (par chunks de 100) pour vérifier l'existence des documents.
3. Compter exactement les créations à venir (`exactNewCount`).
4. **Transaction 1 :** Vérifier `studentCount + exactNewCount <= studentLimit`. Si OK, incrémenter `studentCount` immédiatement (Réservation stricte).
5. Exécuter le `BulkWriter` pour les créations et updates.
6. **Transaction 2 :** Si des créations ont échoué techniquement pendant le BulkWriter, rembourser la différence sur `studentCount`.

## ÉTAPE 5 — Gestion des Erreurs BulkWriter
- **Transitoires (Unavailable, Deadline, Quota Exceeded) :** Gérées nativement par le SDK (Retry automatique).
- **Permanentes (Permission Denied, Invalid Argument) :** Capturées par `onWriteError`. Incrémenter `failedCount`. Ne PAS retry (retourner `false`).
Le job ne doit échouer globalement que si le `BulkWriter` crashe intégralement. Sinon, il termine en `PARTIAL_SUCCESS`.

## ÉTAPE 6 — Progression (Hotspotting)
Mettre à jour le document `student_import_jobs/{jobId}` à chaque écriture violera la limite Firestore (1 write/sec par doc).
**Stratégie (Démontré) :** 
Utiliser un timer en mémoire dans la Cloud Function (ex: `setInterval` toutes les 3 secondes) qui flush les compteurs partiels (`processedCount`, `failedCount`) dans Firestore via `FieldValue.increment()`.

## ÉTAPE 7 — Consommation Mémoire & Timeouts
- **JSON 50 000 élèves :** ~15MB en texte, ~60MB en objets V8. Largement supportable avec `memory: 512MiB`.
- **Temps :** Firestore gère ~500 writes/sec avec BulkWriter. 50 000 élèves prendront ~100 secondes (hors discovery). Le timeout de `540s` (9 minutes) est suffisant.
**Conclusion :** Pas de chunking complexe requis via Cloud Tasks, sauf si on dépasse les 100 000 lignes. (Hypothèse validée).

## ÉTAPE 8 — Sécurité et Risques
- **JSON Forgé / Champs interdits (Probable) :** Vulnérabilité d'escalade de privilèges si on copie aveuglément le JSON dans Firestore. **Mitigation :** Whitelister strictement les champs (`name`, `dob`, `gender`, `parentName`, `parentPhone`, `section`). Ignorer tout autre champ (notamment `isAdmin`, `billingBypass`).
- **Crash brutal pendant BulkWriter (Démontré) :** La CF s'arrête (Timeout/OOM). Le quota a été réservé mais les créations n'ont pas abouti (Fuite de quota). **Mitigation :** Cleanup périodique ou réconciliation via un "Count" réel.

## ÉTAPE 9 — Cohérence Métier
- **Créé :** L'ID déterministe (hash) n'existe pas.
- **Mis à jour :** L'ID déterministe existe. Les nouvelles valeurs écrasent les anciennes (`merge: true`).
- **Ignoré :** Ligne vide ou sans matricule.

## ÉTAPE 10 — Roadmap (Phase 2)
- **Phase 2A : Logique de Hashing & Whitelisting.** Créer la fonction utilitaire qui parse une ligne et génère l'ID.
- **Phase 2B : Phase de Découverte (Pre-flight).** Implémenter le `getAll` pour distinguer les nouveaux des existants.
- **Phase 2C : Réservation du Quota.** Transaction Firestore `studentCount += exactNewCount`.
- **Phase 2D : BulkWriter & Intercepteurs.** `create` vs `update` avec `onWriteError`.
- **Phase 2E : Remboursement & Statut Final.** Ajustement du quota si échec et mise à jour finale du Job.

---

# VERDICT DE L'AUDIT
L'implémentation de la Phase 2 est complexe car elle affronte le théorème CAP (Cohérence de facturation vs Disponibilité asynchrone). 
La proposition de **"Découverte Préalable" (Phase 2B)** est la seule architecture qui garantit l'intégrité absolue des limites SaaS (on ne viole pas la limite, on ne bloque pas les mises à jour).

**Le design est prêt et robuste. Prêt pour implémentation étape par étape.**
