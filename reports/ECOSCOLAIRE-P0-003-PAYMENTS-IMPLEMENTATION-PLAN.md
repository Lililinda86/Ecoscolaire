# ECOSCOLAIRE — P0-003 — PAYMENTS IMPLEMENTATION PLAN

**Auteur :** Lead Firestore Engineer / Financial Integrity Architect
**Cible :** Module `Payments.tsx` (Commit 2)

---

## 1. Revalidation des Opérations (Frontière Transactionnelle)

Suite à la règle stricte sur l'usage de `runTransaction` vs `writeBatch`, voici l'approche cible pour chaque opération :

| Opération | Type Firestore cible | Justification | Risque Résiduel | Garde-Fou UI |
| :--- | :--- | :--- | :--- | :--- |
| **Création de Paiement (`handleSavePayment`)** | `writeBatch` (ou `setDoc` simple) | L'opération est un "append-only" (ajout de reçu). La modification éventuelle de `student.feeTx` est une écriture absolue, non dépendante d'une lecture. | Double clic générant deux UUIDs différents. | Désactiver le bouton de soumission (`isSubmitting`) + Générer le UUID à l'ouverture de la modale (Idempotence UI). |
| **Confirmation MoMo (`handleConfirmMockTx`)** | `runTransaction` | Nécessite de lire l'état de la transaction. Si elle est déjà `SUCCESS`, il faut annuler pour éviter de créer le reçu de paiement en double. | Conflits de contention si forte concurrence sur une même transaction. | État de chargement pendant la confirmation. |
| **Création de Dépense (`handleSaveExpense`)** | `setDoc` | Ajout pur (append-only) dans `expenses` ou `validation_requests`. Aucune dépendance sur l'état serveur. | Double soumission. | Bouton désactivé lors de l'enregistrement. |
| **Suppression Paiement / Dépense** | `deleteDoc` | La suppression par ID est par nature idempotente sur Firestore. | Suppression d'un paiement déjà validé / verrouillé. | Vérification PIN existante, ajout d'état de chargement. |

---

## 2. Stratégie d'Idempotence (Paiements Financiers)

L'idempotence financière doit garantir qu'un paiement n'est encaissé qu'une seule fois, même en cas de retry réseau ou de double-clic utilisateur.

* **Anti-Double-Submit (Paiements Manuels) :** 
  L'appel à `crypto.randomUUID()` se fait actuellement *dans* la fonction de sauvegarde. Un double-clic génère donc 2 UUIDs distincts. 
  **Solution :** Désactiver strictement le bouton via un état `isSaving`, et, idéalement, générer l'UUID du paiement au moment où la modale s'ouvre. Ainsi, toute tentative de retry écrasera le document précédent (idempotent via `setDoc`).
* **Anti-Double-Confirmation (MoMo) :**
  L'utilisation de `runTransaction` permet de lire le document de la transaction.
  **Solution :** Lire le doc. Si `doc.data().status === 'SUCCESS'`, la transaction lève une erreur volontaire ou retourne sans écrire le paiement. Le reçu n'est créé que si le statut précédent était `PENDING`.

---

## 3. Périmètre d'Intervention (Fichiers Autorisés)

La migration doit rester extrêmement localisée pour éviter les effets de bord (pas de Big Bang) :

1. **`src/pages/Payments.tsx`** : Seul fichier métier autorisé. Remplacement des appels à `saveDB()` par les méthodes Firestore appropriées.
2. **`src/db/transactions.ts`** : Autorisé si l'on souhaite extraire la logique `runTransaction` de MoMo pour la rendre réutilisable (optionnel).
3. **`tests/p0-003-concurrency.spec.ts`** (optionnel) : Script Playwright/Node dédié pour simuler la concurrence stricte sur ce module, validant la fin du Lost Update.

*Tout autre fichier (`AppContext.tsx`, autres pages) est strictement interdit lors de ce commit.*

---

## 4. Plan de Tests Obligatoires

Les tests suivants valideront l'absence totale de régressions et la résolution de la faille :

1. **Les 5 Paiements Simultanés (Node/Playwright) :**
   Exécuter 5 appels quasi-simultanés de création de paiement pour un même élève. 
   *Invariant :* 5 documents créés dans la collection `payments`, l'élève cible reste intact (absence de Lost Update sur l'étudiant).
2. **Le Double-Clic Utilisateur (UI) :**
   Simuler des clics ultra-rapides sur le bouton "Enregistrer". 
   *Invariant :* Un seul document Firestore généré (grâce au verrouillage UI + idempotence UUID).
3. **Modification Concurrente d'un Élève :**
   Appareil A : Enregistre un paiement et modifie la scolarité attendue.
   Appareil B : Change le numéro de téléphone de l'élève (au même instant).
   *Invariant :* Le numéro de téléphone persiste et le paiement est bien enregistré.
4. **Confirmation MoMo Concurrente :**
   Appel simultané par 2 threads sur `handleConfirmMockTx` pour la même transaction.
   *Invariant :* Un seul thread parvient à inscrire la transaction en `SUCCESS` et un seul reçu de paiement est généré.

---

**READY FOR CODE**
