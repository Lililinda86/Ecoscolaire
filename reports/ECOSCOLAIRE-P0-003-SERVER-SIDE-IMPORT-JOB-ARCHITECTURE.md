# ECOSCOLAIRE — P0-003 — SERVER-SIDE IMPORT JOB ARCHITECTURE

**Auditeurs :** Principal Cloud Architect, Firestore BulkWriter Specialist, SaaS Billing Integrity Engineer
**Sujet :** Architecture Asynchrone Serveur (Cloud Functions) pour l'Import et Suppression Massifs

---

## 1. Options de Stockage du Payload d'Import

| Option | Capacité / Limite | Sécurité | Coût / Perf | Verdict |
|---|---|---|---|---|
| A. Un seul document `job` | 1 MiB (env. 1000 élèves) | Bonne | Très risqué | **REJETÉ** (Bloque les imports de > 1000 élèves). |
| B. Sous-collection `rows` | Illimitée | Bonne | Client doit faire X writes (Timeout) | **REJETÉ** (Rapporte le problème côté client). |
| C. Firebase Storage (JSON) | Illimitée (Gigaoctets) | Excellente | Rapide, Retry natif SDK | **RECOMMENDÉ** (Fichier JSON ou Excel uploadé). |
| D. CF HTTP Callable | 10 MiB payload | Bonne | Latence client (Timeout possible) | **ACCEPTABLE** (Mais moins robuste que Storage pour les fichiers). |

**Architecture retenue :** Le client parse l'Excel, le convertit en un Array JSON propre (pour éviter à la CF d'importer une lourde lib Excel), l'uploade dans Firebase Storage sous `import_jobs_data/{schoolId}/{jobId}.json`, puis crée un document Firestore `import_jobs/{jobId}` (statut: `PENDING`).

---

## 2. Stratégie de Déduplication

- **UUID Aléatoire :** Rejeté (Risque critique de doublons SaaS en cas de ré-import).
- **ID Déterministe :** **Recommandé.**
  L'ID de l'élève importé DOIT être généré par le backend de manière déterministe pour garantir l'idempotence de l'écriture (Upsert) : `hash_sha256(schoolId + matricule)` ou `hash_sha256(schoolId + UPPER(nom+prenom+classe))`.
- **Méthode retenue (Mode Upsert) :** Si l'ID déterministe existe déjà, le BulkWriter écrase/met à jour l'élève (sans décompter de quota supplémentaire). S'il n'existe pas, il est créé et consomme 1 place.

---

## 3. Gestion du Quota SaaS (Le Verrou Atomic)

La Cloud Function opérera en deux phases pour sceller l'intégrité du compteur `studentCount` :

1. **Phase de Calcul :** La fonction télécharge le JSON de Storage. Elle génère les IDs déterministes. Elle liste (ou interroge via cache) les IDs de l'école déjà présents en base. Elle calcule exactement le nombre d'élèves *strictement nouveaux* (`newStudentsCount`).
2. **Phase de Réservation (Transaction) :** 
   La fonction initie une transaction serveur :
   - Lit `schoolRef`.
   - Vérifie : `school.studentCount + newStudentsCount <= school.studentLimit`.
   - Si `True` : Met à jour `studentCount` et bascule le job à `RUNNING` au sein de la même transaction.
   - Si `False` : Passe le job à `FAILED` (`QUOTA_EXCEEDED`) et termine la fonction.
3. **Double Job Concurrent :** Puisque le statut `RUNNING` et le quota sont verrouillés dans une transaction isolée sur `schoolRef`, un deuxième job exécuté exactement au même instant subira l'OCC, patientera, et échouera élégamment si la place vient de manquer. 

---

## 4. BulkWriter vs Transactions

- **Transaction :** Utilisée EXCLUSIVEMENT pour l'étape 2 (verrouiller le Quota et le Job d'un seul coup). Ne peut pas insérer 3000 élèves (limite 500 writes).
- **BulkWriter :** Utilisé pour l'insertion des 3000 élèves.
  - Le `BulkWriter` de l'Admin SDK est conçu spécifiquement pour ça. Il envoie les writes en parallèle avec un throttling natif pour respecter les limites Firestore de Google Cloud (500 ops/sec).
  - Il inclut des retries automatiques (backoff exponentiel).
  - L'opération devient : `bulkWriter.set(studentRef, data, { merge: true })`.

---

## 5. Machine à États du Job

Document `import_jobs/{jobId}` :
- `PENDING` : Job créé, JSON uploadé, en attente du Trigger.
- `VALIDATING` : Vérification des doublons et du schéma en cours.
- `RUNNING` : Quota réservé. Insertion BulkWriter en cours.
- `SUCCESS` : Tout est écrit.
- `FAILED` : Échec (Erreur de parsing, Quota insuffisant).
  
Champs : `totalRows`, `processedCount`, `newStudentsCount`, `errorLogUrl` (lien Storage vers un fichier listant les lignes en échec).

---

## 6. Idempotence et Reprise

La fonction Background (trigger Cloud Storage `onFinalize` ou Firestore `onCreate`) garantit `at-least-once delivery`. Elle peut redémarrer.
- **Si elle redémarre pendant `PENDING` ou `VALIDATING` :** Aucun risque, le quota n'est pas touché.
- **Si elle redémarre après être passée à `RUNNING` :** Le quota a été réservé. Le BulkWriter est conçu pour être 100% idempotent avec des IDs déterministes et du `set({merge:true})`. La fonction écrase simplement les données déjà créées, le quota reste correct. Le succès est garanti.
- **Fermeture Navigateur :** N'a aucun impact. Le job tourne sur l'infrastructure Google. Au retour de l'utilisateur, son UI lira le document `SUCCESS`.

---

## 7. Sécurité (Firestore & Storage Rules)

- **Storage :** 
  - `write`: Limité aux utilisateurs autorisés (`owner`, `director`) via Custom Claims Firebase Auth pour l'upload sous `import_jobs_data/{schoolId}/`.
- **Firestore `import_jobs` :**
  - `create`: Client autorisé uniquement avec statut initial `PENDING`.
  - `read`: Client autorisé de l'école concernée.
  - `update/delete`: **TOTALEMENT INTERDIT au client**. Seul le backend (Admin SDK via Cloud Function) a le droit de muter le statut, le `processedCount` ou les erreurs. Empêche toute falsification.

---

## 8. UX et Expérience Client

1. **Upload :** La secrétaire dépose son fichier. UI affiche un indicateur de transfert Storage.
2. **Progression :** Le client s'abonne à `doc('import_jobs', jobId)`. Le backend met à jour `processedCount` tous les 500 documents. L'UI affiche une barre de progression réelle et un Spinner ininterruptible (Overlay).
3. **Clôture :**
   - Si succès : *"320 élèves importés avec succès. 15 élèves mis à jour. 3 ignorés."*
   - Si erreur de quota : *"Importation impossible : Dépassement de 25 places de votre limite."*
4. **Réimport :** L'utilisateur peut re-glisser son fichier à tout moment, la déduplication déterministe protègera la base sans créer de "pollution".

---

## 9. Matrice des Tests de Certification

| Test | Scénario | Attendu |
|---|---|---|
| C1 | Import 100, 500, 3000 | BulkWriter gère le débit sans Timeout Fonction (< 9 min) |
| C2 | Doublons | Réimport du même fichier : Quota inaltéré, documents mis à jour (Upsert) |
| C3 | Quota insuffisant | Transaction avorte, Job `FAILED`, `studentCount` inchangé |
| C4 | Deux jobs concurrents | Job 1 réserve la place, Job 2 se voit refuser si la place vient à manquer (Lock OCC) |
| C5 | Interruption Serveur | Trigger relancé, BulkWriter refait les upserts idempotents |
| C6 | Firestore Rules | Owner essaie d'éditer le `processedCount` -> `permission_denied` |

---

## 10. Roadmap d'Implémentation

- **3B.3A - Sécurité & Modèles :** Création des Firestore Rules pour `import_jobs` et Storage Rules. Mise en place des types TS.
- **3B.3B - Cloud Function Processor :** Implémentation du Trigger Storage, de l'Upsert Déterministe, de la transaction `studentCount` et du `BulkWriter`.
- **3B.3C - UI Client Job Progress :** Refonte de `handleConfirmImport` pour écrire le JSON dans Storage, créer le Job, et écouter la progression. Suppression totale du concept de `saveDB`.
- **3B.3D - Certification Tests :** Simulation des cas de charge via Firebase Emulator.

---

# VERDICT

**READY FOR IMPLEMENTATION**
L'architecture Job Asynchrone Serveur avec BulkWriter et IDs déterministes est l'unique pattern d'ingénierie conforme aux exigences SaaS (zéro dérive, reprise après crash, performance à l'échelle, sécurité impénétrable par le client). Elle élimine 100% de la dette technique liée à l'import massif côté client.
