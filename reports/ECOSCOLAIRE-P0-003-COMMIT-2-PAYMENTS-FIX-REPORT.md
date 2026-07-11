# ECOSCOLAIRE — P0-003 — COMMIT 2 PAYMENTS — FIX REPORT

**Auteur :** Lead Firestore Engineer / Financial Integrity Auditor
**Statut :** CORRIGÉ

## 1. Correction choisie pour l'Idempotence (Double-Submit)

L'UUID du paiement est désormais généré **à l'ouverture de la modale** et stocké dans le state local `currentPayment.id`. 
* **Justification** : Si le réseau subit une latence, un double-clic involontaire ou un retry automatique va invoquer `handleSavePayment` deux fois avec la **même** instance d'UUID. `setDoc(doc(firestoreDb, 'payments', paymentId), newPayment)` agira donc de manière strictement idempotente en écrasant le document avec les exactes mêmes données (sans doublon de débit).
* Une garde supplémentaire `if (!currentPayment.studentId || isSaving) return;` a été ajoutée pour bloquer l'exécution front-end.

## 2. Correction choisie pour `student.feeT1/T2/...`

**Option A retenue (Safe Minimal)**.
* **Justification** : Le code de mutation `batch.update(studentRef, { feeT1: modalExpectedAmount })` a été **entièrement retiré** de `Payments.tsx`. 
* L'enregistrement d'un paiement est désormais strictement *append-only* (seul un document `payment` est créé dans Firestore).
* En supprimant cette écriture croisée, nous avons totalement éliminé le *Lost Update* sur l'étudiant à cet endroit. La modification des frais attendus devra être traitée dans le futur de façon transactionnelle via un panneau "Settings/Students" dédié. Le `writeBatch` devenu inutile a été supprimé des imports.

## 3. Preuve de l'absence de `saveDB`

`saveDB` a été définitivement supprimé des imports et de l'objet déstructuré de `useAppContext()` dans `Payments.tsx`. Seules les méthodes natives du SDK Firebase (`setDoc`, `deleteDoc`, `runTransaction`) sont désormais appelées pour chaque fonction de ce fichier.

## 4. Protocole Manuel de Tests de Concurrence

En l'absence de framework automatisé exécutant des scénarios e2e multithreads locaux dans cet environnement de tâche, voici le protocole de vérification manuel que l'équipe QA devra exécuter :

**Test A : Double-clic manuel (Idempotence)**
1. Ouvrir la modale d'encaissement et remplir un montant.
2. Utiliser la console navigateur pour retirer le `disabled` du bouton de soumission si besoin, ou utiliser un throttle réseau (Slow 3G).
3. Cliquer 5 fois très rapidement sur le bouton avant le retour visuel.
4. *Validation* : Un seul document est créé dans la collection `payments`.

**Test B : Double confirmation MoMo (Transaction)**
1. Lancer un paiement MoMo.
2. Intercepter l'appel API à `mockConfirmPayment` et le rejouer simultanément deux fois depuis Postman ou l'onglet Network.
3. *Validation* : La première requête répond "Paiement simulé avec succès". La seconde est bloquée silencieusement ou retourne une erreur "déjà confirmé". Le Firestore ne génère qu'un reçu.

**Test C : Modification concurrente de l'élève (Lost Update Résolu)**
1. Administrateur 1 modifie l'adresse de l'élève dans l'onglet Édition d'Élève.
2. Administrateur 2 enregistre un paiement pour ce même élève au même instant.
3. *Validation* : L'adresse est bien mise à jour ET le paiement est enregistré. Aucune donnée n'écrase l'autre (le paiement n'interagissant plus avec le document élève).

## 5. Résultats d'intégration

* **Build** : `npm run build` exécuté avec succès.
* **Lint** : Les fausses alertes liées à `writeBatch` ont été corrigées, le code de `Payments.tsx` est propre des erreurs typiques (les warnings restants proviennent exclusivement d'autres fichiers pré-existants).

## 6. SHA Final

**`505e139c1dd396f9a8de4f81c0b81298a8b17623`**

Message : `fix(payments): enforce idempotent and safe financial writes`

---

**VERDICT : COMMIT FIXED — READY FOR SECURITY REVIEW**
