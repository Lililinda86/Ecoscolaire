# ECOSCOLAIRE — P0-003 — PAYMENTS ARCHITECTURE AUDIT

**Auteur :** Lead Firestore Engineer / Lead Financial Systems Architect
**Cible :** Module `Payments.tsx` (Commit 2)

---

## 1. Cartographie des Opérations et Écritures Firestore

L'audit approfondi du module `Payments.tsx` révèle une dépendance totale à la méthode synchrone globale `saveDB`, qui masque les opérations réelles sur Firestore.

### 1.1. Les Actions (Mutations Locales)
* **Création d'un paiement (`handleSavePayment`) :**
  * Génération d'un UUID pour un nouvel objet `Payment`.
  * Mutation directe du tableau `db.payments.push()`.
  * Modification *à la volée* de l'attribut de l'élève (`student.feeT1`, `feeT2`, etc.) si un montant attendu est forcé.
* **Création d'une dépense (`handleSaveExpense`) :**
  * `db.expenses.push()` ou `db.validation_requests.push()` (selon le montant/rôle).
* **Suppression (Annulation) :**
  * `handleDeletePayment` : `db.payments = db.payments.filter(...)`
  * `handleDeleteExpense` : `db.expenses = db.expenses.filter(...)`
* **Confirmation MoMo (`handleConfirmMockTx`) :**
  * Mutation de la transaction locale : `tx.status = 'SUCCESS'`.
  * Ajout du paiement lié : `db.payments.push()`.

### 1.2. Calculs (Lectures)
* **Compteurs & Soldes :**
  * Il n'y a **aucun compteur absolu** stocké en base. Tous les calculs (`reste`, `totalTuition`, `totalCollected`, `totalExpenses`) sont effectués dynamiquement côté client via des `.reduce()` sur les tableaux `db.payments` et `db.expenses`.

---

## 2. Analyse de Concurrence & Risques (P0)

Le mécanisme de synchronisation actuel (mutation locale + `saveDB`) engendre des risques majeurs de **Lost Update** :

1. **Écrasement d'Élève (Write Skew / Lost Update) - CRITIQUE :**
   Lorsqu'un paiement modifie l'attribut `feeT1` d'un élève, `saveDB` détecte un changement et exécute un `setDoc()` **destructif** sans `{merge: true}`. Si le secrétariat modifie le nom ou la classe de l'élève au même instant, le `setDoc` du paiement va écraser (perdre) la mise à jour du secrétariat.
2. **Concurrence sur les Transactions MoMo - ÉLEVÉ :**
   Lors de la confirmation (`tx.status = 'SUCCESS'`), `saveDB` fait un `setDoc` destructif sur la transaction. Une modification concurrente par le webhook officiel serait perdue.
3. **Double Submit sur les Paiements - MODÉRÉ :**
   Les ajouts concurrents de paiements génèrent de nouveaux UUID localement, qui se traduisent par des documents distincts dans la collection `payments`. Ils ne s'écrasent donc pas. Cependant, si le réseau est lent, l'utilisateur pourrait cliquer deux fois sur "Enregistrer" et créer deux documents doublons.

---

## 3. Frontière Transactionnelle (Design Cible)

Pour garantir l'atomicité, nous devons définir les nouvelles règles d'écriture.

* **Paiements (Création) :**
  1. Opération principale : `setDoc(doc(db, 'payments', uuid), paymentData)`
  2. Opération secondaire (si modification des frais attendus) : `updateDoc(doc(db, 'students', studentId), { feeT1: newAmount })`
  *Frontière :* Ces deux opérations doivent s'exécuter dans un `writeBatch` pour garantir que le reçu et la dette soient synchronisés.
* **Transactions et Validations :**
  * Utilisation stricte de `updateDoc()` pour changer les statuts (ex: `status: 'SUCCESS'`).
* **Dépenses :**
  * Création via un simple `setDoc(doc(db, 'expenses', uuid), expenseData)`.

---

## 4. Plan de Migration (Payments.tsx)

La suppression de `saveDB` dans `Payments.tsx` se fera en 4 sous-étapes indépendantes :

1. **Refactoring des Dépenses (Expenses & Validation Requests) :**
   * Remplacer `db.expenses.push()` + `saveDB()` par `setDoc()` unitaire.
2. **Refactoring des Suppressions (Delete) :**
   * Remplacer les `.filter()` + `saveDB()` par des appels directs à `deleteDoc()`.
3. **Refactoring des Encaissements & Élèves (Batch Transactionnel) :**
   * Dans `handleSavePayment`, utiliser `writeBatch` pour écrire simultanément le nouveau `payment` et mettre à jour le `student` (`updateDoc` avec les champs `feeTx`).
4. **Refactoring de MoMo (`handleConfirmMockTx`) :**
   * Utiliser `writeBatch` pour marquer la `transaction` en succès et insérer le `payment`.

---

## 5. Plan de Tests (Validation)

1. **Test unitaire de concurrence :**
   * Scénario : 5 paiements simultanés sur le même élève (différents onglets/clients).
   * Vérification : Les 5 documents de paiement doivent être créés, et aucun `Lost Update` ne doit altérer les propriétés de l'élève (le `setDoc` destructif est éradiqué).
2. **Test Staging manuel :**
   * Procéder à un encaissement tout en modifiant la classe de l'élève sur un autre appareil. Le changement de classe doit persister.
3. **Test d'Idempotence (Double Submit) :**
   * Bloquer le bouton "Enregistrer" (`disabled={isSubmitting}`) après le premier clic.

---

## Conclusion de l'Architecture

Le module `Payments.tsx` a été entièrement cartographié. Les risques de Lost Update sont circonscrits aux `setDoc` destructifs sur les entités connexes (Élèves, Transactions) plutôt qu'aux listes de paiements elles-mêmes. L'approche par `updateDoc` et `writeBatch` est validée.

**READY FOR IMPLEMENTATION**
