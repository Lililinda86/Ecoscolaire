# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B — PRE-IMPLEMENTATION ARCHITECTURE REVIEW

**Rôles :** Principal Cloud Architect, Principal Firestore Architect, SRE, Staff Engineer, QA Automation Lead
**Date :** 28 Juin 2026

---

## 1. Architecture Générale & Déclencheur (Triggers)

**Problématique :** Déclencher sur Storage (`onFinalize`) ou Firestore (`onDocumentCreated`) ?
**Analyse :** Le client upload le fichier JSON dans Storage **puis** crée le document Firestore.
- Si le trigger est sur Storage : La Cloud Function peut se lancer *avant* que le document Firestore n'existe. Cela oblige la CF à poll pour attendre la création du document. C'est un anti-pattern.
- Si le trigger est sur Firestore : Le fichier Storage est garanti d'être présent (le client doit attendre l'upload avant de créer le doc).
- **Décision :** Utiliser un trigger Firestore `onDocumentCreated` sur `student_import_jobs/{jobId}`.
- **Robustesse :** Une architecture Cloud Tasks serait plus robuste pour le throttling (limiter le nombre d'imports simultanés pour protéger la DB), mais un trigger Firestore Eventarc Gen2 avec un `maxInstances` configuré (ex: 10) accomplit la même protection contre les pics de charge (hotspots).

## 2. Machine à États et Reprise (Idempotence)

**Problématique :** Les Cloud Functions garantissent "At-Least-Once-Delivery". La fonction peut être déclenchée deux fois pour le même job.
**États :** `PENDING` -> `VALIDATING` -> `RUNNING` -> `SUCCESS` | `PARTIAL_SUCCESS` | `FAILED`
**Faille Identifiée (Zombies & Retries) :** 
1. Si un double trigger survient, les deux instances verront `PENDING`. Il faut obligatoirement une **Transaction Firestore** pour acquérir le lock : `if status == 'PENDING' then status = 'VALIDATING'`.
2. Si la CF crash (OOM, Timeout) pendant `RUNNING`, le job restera bloqué à vie sur `RUNNING` (état Zombie).
**Correction requise :** Le client ne doit pas attendre indéfiniment. S'il n'y a pas d'activité sur `updatedAt` depuis X minutes, l'UI doit l'afficher comme en erreur. Un job programmé ou Cloud Task de nettoyage doit passer les zombies en `FAILED`.

## 3. Quotas SaaS (`studentCount`) — FAILLE CRITIQUE

**Hypothèse initiale :** Réserver le quota `newStudentsCount` *avant* le BulkWriter.
**Analyse :** Si on incrémente `studentCount` de +5000 avant l'import, et que l'import crash ou rejette 2000 élèves pour erreurs de format, l'école aura consommé 5000 quotas alors que seulement 3000 ont été insérés. C'est une fuite de quota inacceptable pour la facturation (Write Skew asynchrone).
**Correction requise :** 
- Soit on met à jour `studentCount` de manière incrémentale (+1 à chaque succès). Mais cela crée de la contention sur le document `schools/{schoolId}`.
- Soit (recommandé) le BulkWriter exécute l'insertion, et une fois le flush terminé, on agrège le nombre de succès, et on ouvre **une seule transaction** pour incrémenter `studentCount` de la valeur exacte des `successCount` réels. 

## 4. BulkWriter : Risques et Erreurs Partielles

**Analyse :** BulkWriter gère automatiquement les retries et le backoff pour les erreurs 429 (Quota exceeded).
Cependant, certaines erreurs (ex: permission, invalid data) ne sont pas retryables.
**Correction requise :**
- Implémenter le callback `bulkWriter.onWriteError(error => { ... })` pour comptabiliser les échecs et ne pas crasher tout le process.
- Attendre impérativement `await bulkWriter.close()` pour garantir que tout est écrit.
- Si des échecs surviennent, le statut final doit être `PARTIAL_SUCCESS`.

## 5. IDs Déterministes

**Problématique :** Éviter les doublons lors des retries ou des ré-imports successifs (upsert).
**Analyse :** 
- UUID : Impossible, un retry créera des doublons.
- `SHA256(schoolId + matricule)` : Optimal. C'est constant, insensible aux renommages, et garantit l'idempotence (si on insère deux fois le même élève, l'ID reste le même).

## 6. Mise à jour de la Progression (`processedCount`)

**Problématique :** Si on met à jour le job Firestore pour chaque élève importé, on dépasse la limite d'1 écriture par seconde sur un document (Hotspotting Firestore).
**Correction requise :** Mettre à jour `processedCount` en batch (ex: tous les 250 élèves ou toutes les 3 secondes via un timer/intervalle dans la Cloud Function), en utilisant `FieldValue.increment()`.

## 7. Sécurité & Attaques DoS

- **Zip Bomb / JSON Gigantesque :** Bloqué par Storage Rules (max 10MB).
- **JSON malformé (OOM) :** Charger 10MB en mémoire dans Node.js consomme ~30-50MB. C'est sûr pour une Cloud Function configurée avec 512MB. Utiliser `JSON.parse` dans un bloc `try/catch`. En cas d'erreur, job passe en `FAILED`.
- **Injection Admin SDK :** Les champs provenant du JSON doivent être filtrés. Ne jamais injecter `isAdmin` ou `role` à partir du fichier Excel.

## 8. Nettoyage (Data Lifecycle)

- **Storage :** Configurer une règle `Object Lifecycle Management` sur GCP (suppression des fichiers `import_jobs_data/` après 3 jours).
- **Firestore :** Ajouter un index TTL sur le champ `expiredAt` (calculé à `createdAt + 7 days`) du document job pour purger automatiquement l'historique sans code.

---

## 9. Dette Technique Identifiée

| Dette | Niveau | Impact | Résolution Exigée |
|---|---|---|---|
| Fuite de quota SaaS | **CRITIQUE** | Facturation erronée si import partiel | Incrémenter `studentCount` uniquement en fonction des succès réels après le BulkWriter. |
| Double exécution du job | **CRITIQUE** | Corruption / Contention | Acquérir le statut `RUNNING` via une Transaction Firestore stricte au début de la CF. |
| Jobs Zombies | **HAUTE** | Blocage UI si crash de la CF | Timeout UI / Cloud Task de cleanup. |
| Firestore Hotspotting | **MOYENNE** | Erreurs 429 sur le document Job | Throttle des mises à jour de progression (batch de 5 secondes). |

---

## 10. ROADMAP RECOMMANDÉE (3B.3B)

- **Phase 1 : Setup Cloud Function & Transaction de démarrage.**
  *(Objectif : Assurer l'idempotence, le parsing JSON, et l'acquisition du Job via transaction).*
- **Phase 2 : Mécanisme d'Upsert avec BulkWriter.**
  *(Objectif : Hashing de l'ID, mapping des champs stricts, traitement asynchrone avec retries).*
- **Phase 3 : Sync Quota & Conclusion.**
  *(Objectif : Mise à jour de `studentCount` dans `schools` selon le `successCount` exact, et écriture du statut final).*
- **Phase 4 : Tests d'Intégration Emulator.**
  *(Objectif : Valider les doubles-triggers, le crash json, le partial success).*

---

# VERDICT

**APPROVED WITH REQUIRED CHANGES**

**Conditions d'implémentation bloquantes :**
1. L'architecture doit incrémenter `studentCount` **à la fin** du traitement (en fonction du vrai taux de succès) et non au début, pour éviter le vol de quota SaaS.
2. Le démarrage de la Cloud Function doit être protégé par une **Transaction Firestore** pour empêcher un double-trigger de corrompre l'import.
3. Les IDs élèves doivent être générés via `SHA256(schoolId + matricule)` pour garantir l'Upsert.
4. Les mises à jour de progression doivent être temporisées pour éviter le hotspotting sur le document Job.
