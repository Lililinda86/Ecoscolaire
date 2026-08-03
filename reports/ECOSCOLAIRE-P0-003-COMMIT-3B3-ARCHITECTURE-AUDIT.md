# ECOSCOLAIRE — P0-003 — COMMIT 3B.3 — ARCHITECTURE AUDIT

**Auditeurs :** Principal Distributed Systems Architect, Staff Software Engineer & QA Lead
**Sujet :** Stratégie de remédiation finale pour les opérations massives (`Import Excel` et `Delete All`)

---

## 1. Cartographie Complète de l'Existant

### Flux `handleConfirmImport`
1. **Lectures :** 
   - `getStudentLimit(currentSchool)`
   - `db.students.length` (tableau local)
   - `previewStudents` (généré localement depuis l'Excel)
2. **Décisions / Check :**
   - Calcule `remainingSlots = limit - db.students.length`.
   - Bloque si `previewStudents.length > remainingSlots`.
3. **Écritures & Mutations :**
   - Appel synchrone à `saveDB({ ...db, students: [...db.students, ...previewStudents] })`.
4. **Appels Firestore :**
   - Aucun appel natif direct, tout est délégué à la routine globale `saveDB`, qui pousse toute la hiérarchie JSON.

### Flux `handleDeleteAll`
1. **Lectures :** Variable globale `db`.
2. **Écritures :** `saveDB({ ...db, students: [] })`.

---

## 2. Analyse des Risques

Le maintien de `saveDB` sur ces flux engendre des failles critiques d'intégrité :

- **Lost Update :** Si deux utilisateurs importent des fichiers Excel simultanément, le `saveDB` le plus lent écrasera purement et simplement le `saveDB` le plus rapide. Les élèves du premier import seront détruits.
- **Write Skew (Contournement de SaaS) :** Si la limite restante est de 50 places et que deux directeurs importent simultanément un Excel de 40 élèves, les deux clients valideront localement (`40 <= 50`) et passeront la validation. Le système finira avec un dépassement de 30 places sans aucun blocage serveur.
- **Contention Firestore :** L'ajout massif modifie potentiellement des centaines de documents en une fois via l'ancienne architecture, sans contrôle du throttle natif.
- **Batch Limit :** Firestore interdit strictement d'exécuter plus de 500 opérations dans une seule transaction ou un seul WriteBatch. L'approche actuelle ne découpe pas les imports massifs (ex: 1200 élèves).
- **Partial Failure :** Que se passe-t-il si le réseau coupe au milieu d'un import de 1200 élèves ? Actuellement, avec un backend Firebase asynchrone sans batching unifié, on risque une base de données corrompue où la moitié est insérée mais le `studentCount` global de l'école n'est pas mis à jour ou l'état local ne reflète plus le backend.
- **Delete All :** Vider `db.students = []` via `saveDB` efface le store local mais ne décrémente pas le fameux compteur transactionnel `schools.studentCount`. Résultat : une école avec 0 élève visible mais un quota SaaS bloqué à 100% car le compteur est resté bloqué.

---

## 3. Choix Technologique Firestore

1. **`runTransaction` vs `writeBatch` :**
   - Un `writeBatch` seul ne permet pas de *lire* `studentCount` pour vérifier le quota avant d'écrire. 
   - **Décision :** Utilisation stricte de **`runTransaction`** car nous DEVONS lire `schools/{schoolId}` pour valider la limite avant de flusher le lot d'écritures. (Note: une transaction Firestore supporte également jusqu'à 500 writes).
2. **Partitionnement (Chunking) :**
   - **Taille optimale retenue : 400 opérations.**
   - *Justification :* La limite absolue Firestore est 500. Réserver 1 opération pour l'update du `studentCount` et garder une marge de sécurité (99 opérations) pour d'éventuels indexs ou métadonnées de journalisation (`logAuditAction`) permet de prévenir les crashs `400 Bad Request`.

---

## 4. Architecture Cible

**Importation Massive (`handleConfirmImport`) :**
1. Générer les UUIDs pour tous les élèves en amont (en mémoire).
2. Découper la liste des élèves en sous-tableaux (chunks) de 400 élèves maximum.
3. Exécuter séquentiellement (avec une boucle `for...of`) une transaction par chunk :
   - `runTransaction` lit `schools/{schoolId}`.
   - Calcule le plafond exact.
   - Vérifie que `currentCount + chunk.length <= limit`. (Sinon `QUOTA_EXCEEDED` abort).
   - Insère les 400 élèves via `transaction.set()`.
   - Met à jour `transaction.update(schoolRef, { studentCount: currentCount + 400 })`.
4. Si un chunk échoue (perte réseau, quota), l'import s'arrête net. Les chunks précédents sont sécurisés (atomicité par bloc).

**Suppression Massive (`handleDeleteAll`) :**
1. Récupérer la liste des IDs d'élèves actuellement en base.
2. Découper en chunks de 400.
3. Exécuter séquentiellement les transactions :
   - Lire l'école.
   - Supprimer les 400 documents.
   - Décrémenter le compteur en protégeant contre le zéro (`Math.max(0, currentCount - chunk.length)`).

---

## 5. Offline et Reprise

- **Offline :** Les imports massifs et la suppression de masse **doivent être strictement bloqués** si `!navigator.onLine`. Une opération de cette envergure ne doit pas être conservée dans le cache différé Firestore car elle peut générer un dépassement de quota monstrueux lors du retour en ligne.
- **Fail-Fast :** La moindre erreur Firestore (offline, permission) interrompt la boucle de chunking.

---

## 6. Idempotence

- **Double Import :** Verrouillage de l'UI (`isImporting = true`). Bouton grisé.
- **UUID Prédictifs :** Puisque les UUID sont générés avant le découpage, un Retry automatique de Firebase sur un chunk échoué écrasera proprement les mêmes données via `.set()` sans dupliquer le `studentCount`.

---

## 7. Gestion du `studentCount`

Le compteur `studentCount` sera rigoureusement mathématique : il est incrémenté de `+ N` (taille du chunk) lors du succès de la transaction. L'évitement des erreurs de compteur repose sur l'atomicité totale du block. Il n'y a plus aucun `saveDB`.

---

## 8. Firestore Rules

**Les règles actuelles sont suffisantes.**
La fonction `isUpdatingSaasFields` dans `firestore.rules` protège déjà `studentCount`. L'incrémentation via transaction depuis un client autorisé respecte les règles de validation si le SDK est correctement authentifié. Aucune modification du fichier `firestore.rules` ne sera requise pour le commit 3B.3.

---

## 9. Performance

- **Import de 100 élèves :** 1 transaction. Durée estimée : ~0.5s.
- **Import de 500 élèves :** 2 transactions de 400 et 100. Durée estimée : ~1.2s.
- **Import de 3000 élèves :** 8 transactions. Durée estimée : ~5-7s.
- *Contention :* Le fait de traiter les chunks **séquentiellement** (pas de `Promise.all` sur les chunks) garantit qu'il n'y a qu'une seule écriture concurrente sur `schoolRef` par la session cliente, respectant la limite de 1 écriture par seconde (Firestore soft limit).

---

## 10. Matrice des Tests Obligatoires

| ID | Test | Scénario | Attendu |
|---|---|---|---|
| T1 | Import Simultané | Deux clients importent 300 élèves avec quota = 400 | Client A (Succès) / Client B (QUOTA_EXCEEDED) |
| T2 | Import > Quota | Import de 150 élèves alors qu'il reste 100 places | Blocage immédiat dès le chunk 1 |
| T3 | Test de Charge | Import massif de 1200 élèves (Généré par Mock) | Création de 3 transactions, compteur = +1200 |
| T4 | Delete All concurrent | Lancement Delete All + Création Client B | Compteur reste cohérent (pas de valeur fantôme) |
| T5 | Perte réseau | Coupure internet au milieu du chunk 2 / 3 | Arrêt propre, alerte utilisateur, compteur synchronisé sur chunk 1 |
| T6 | Idempotence | Double clic volontaire / hack DOM sur le bouton Submit | État bloqué ou transaction refusée sans duplication |
| T7 | Réconciliation | Lancement du SuperAdmin Diagnostic après Delete All | Le Diagnostic confirme l'égalité parfaite (0 dérive) |

---

## 11. Roadmap d'Implémentation

- **Commit 3B.3A :** Remplacement de `handleConfirmImport` par le Chunking Transactionnel (400 opérations max). Verrouillage Offline.
- **Commit 3B.3B :** Remplacement de `handleDeleteAll` par le Chunking Transactionnel et purge totale de l'utilisation globale de `saveDB` dans `Students.tsx`.
- **Commit 3B.3C :** Rédaction et validation du script de tests E2E `test-p0-003-studentcount-3b3.mjs` implémentant la matrice ci-dessus.

---

# VERDICT

**READY FOR IMPLEMENTATION**
L'architecture proposée est robuste, respecte formellement les quotas SaaS distribués, obéit aux limitations du Backend Firebase et sécurise les données contre la perte et la corruption réseau.
