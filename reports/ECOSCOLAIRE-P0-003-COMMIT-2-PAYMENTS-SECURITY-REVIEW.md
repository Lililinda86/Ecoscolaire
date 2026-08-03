# ECOSCOLAIRE — P0-003 — COMMIT 2 PAYMENTS — SECURITY REVIEW

**Auteur :** Lead Security Reviewer / Financial Integrity Auditor

## 1. Revue du Diff

L'analyse de `c9e0eee` (`git show c9e0eee -- src/pages/Payments.tsx`) confirme :
- ✅ Aucun autre fichier n'a été modifié (Scope respecté).
- ✅ Tous les appels `saveDB()` ont été supprimés de `Payments.tsx`.
- ✅ L'import de `firestore` est correct.
- ✅ Pas de `setDoc` destructif sur `payments` ou `expenses` (les documents sont créés avec un nouvel UUID ou un UUID de transaction).
- ❌ **Grave problème sur l'update de l'étudiant** : `batch.update(studentRef, { feeT1: modalExpectedAmount })`.

## 2. Revue Transactionnelle

Le `writeBatch` de `handleSavePayment` **N'EST PAS SUFFISANT** pour garantir l'intégrité financière.

**Analyse des cas :**
- **Paiement simple append-only** : OK, création d'un document `payments`.
- **Deux admins modifient simultanément `feeT1`** : **LOST UPDATE CARACTÉRISÉ**.
  - L'Admin A ouvre la modale (lit `feeT1 = 50000`), change à `60000`.
  - L'Admin B ouvre la modale (lit `feeT1 = 50000`), change à `45000`.
  - Les deux soumettent quasi simultanément. Leurs requêtes respectives contiennent `batch.update({ feeT1: 60000 })` et `batch.update({ feeT1: 45000 })`. Le dernier qui écrit écrase la décision de l'autre de manière aveugle.
  - *Correction requise* : Soit on n'écrit pas `feeT1` (le conserver en delta local), soit on utilise `runTransaction` pour vérifier si le montant a été modifié par ailleurs, soit le champ doit être abstrait.

## 3. Idempotence

L'idempotence des paiements manuels est **UNSAFE**.

- **Génération du UUID** : `const paymentId = crypto.randomUUID();` est exécuté **à l'intérieur** de `handleSavePayment`. 
- **Conséquence du Double-Clic** : Si l'utilisateur double-clique rapidement, ou si un lag réseau provoque un retry du navigateur avant que `setIsSaving(true)` ne re-rende le composant, la fonction sera appelée deux fois.
- **Résultat** : Deux UUIDs distincts seront générés. Deux écritures `writeBatch` seront poussées. L'élève sera débité deux fois.
- *Correction requise* : Générer l'UUID au moment où l'on clique sur "Ouvrir la Modale d'Encaissement" (et le stocker dans le state `currentPayment.id`). Ainsi, toute soumission multiple utilisera le *même* UUID et `set` écrasera simplement le document avec les mêmes données (idempotence absolue).

## 4. Tests Concurrency

Par manque d'idempotence stricte et de sécurité transactionnelle sur l'étudiant, l'exécution d'un script de tests Playwright échouerait sur la simulation des 5 paiements simultanés (génération de 5 reçus au lieu d'un seul si l'UUID est regénéré à chaque clic / appel).

De ce fait, le commit ne remplit pas le cahier des charges de la mission P0-003 pour clore la faille.

---

**VERDICT : BLOCKED — IDEMPOTENCE UNSAFE**
**VERDICT : BLOCKED — TRANSACTION BOUNDARY UNSAFE**
