# ECOSCOLAIRE — P0-003 — COMMIT 3A — PATCH SAFE UPDATE FIX REPORT

**Auteur :** Lead Firestore Engineer
**Date :** 28 Juin 2026
**Commit SHA :** `a0aaefdb2f15136669bca3d9cdcd9a7014d6d532`

---

## 1. Correction Appliquée

Le patch envoyé à `updateDoc` lors de l'édition d'un élève a été réécrit pour utiliser une "allowlist" explicite. La ligne dangereuse `const patchData = { ...finalStudent };` a été remplacée par un objet ciblant exclusivement les champs du formulaire. Les champs ayant pour valeur `undefined` sont ensuite purgés avant l'envoi à Firestore pour assurer la compatibilité.

---

## 2. Champs Autorisés (Allowlist Stricte)

Le patch contient **uniquement** les clés suivantes :
- `matricule`
- `name`
- `gender`
- `dob`
- `section`
- `classId`
- `parentName`
- `parentEmails`
- `parentPhone`
- `feeT1`
- `feeT2`
- `feeT3`
- `feeTransport`
- `feeUniforms`
- `address`
- `emergencyContact`
- `allergies`
- `medicalConditions`

---

## 3. Champs Explicitement Exclus

En n'utilisant plus la destructuration d'objet complet (`...finalStudent`), nous excluons formellement les métadonnées techniques et non-éditables :
- `id`
- `schoolId`
- `createdAt`
- `createdBy`
- Et toute autre donnée injectée par Firestore ou d'autres processus système.

*(Note: La création d'élève conserve `id` et `schoolId` tels qu'approuvés).*

---

## 4. Tests et Build

Le script statique `scripts/test-p0-003-students-3a.mjs` a été mis à jour avec deux nouvelles vérifications :
1. ✅ **Patch strict : pas de ...finalStudent**
2. ✅ **Patch strict : pas de schoolId, createdAt, createdBy**

- **Exécution `npm run build` :** `SUCCESS`
- **Exécution Node (Analyse statique) :** `SUCCESS` (`✅ ALL TESTS PASSED`)

---

## 5. FOLLOW-UP REQUIRED — STUDENT DELETE STRATEGY

Le Hard Delete implémenté via `deleteDoc(student.id)` supprime physiquement le document de la collection.
**Régression métier identifiée :** Cette suppression laisse des données orphelines liées à l'élève (Historique des Paiements, Notes, Assiduité, Requêtes de Validation). Cela provoquera des erreurs UI dans les autres modules si le `studentId` n'est plus résolvable.

👉 **Stratégie à prévoir pour les prochains chantiers :**
1. Soit mettre en place une logique de *Soft Delete* (ajouter un champ `deleted: true`).
2. Soit déclencher un processus de *suppression en cascade* via Cloud Functions (ou transactions batch front-end si applicable) pour nettoyer ses entités liées (`payments`, etc.).

---

# VERDICT

**COMMIT FIXED — READY FOR SECURITY REVIEW**
