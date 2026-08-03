# ECOSCOLAIRE — P0-003 — COMMIT 3A — SECURITY REVIEW

**Auteur :** Lead Security Reviewer
**Date :** 28 Juin 2026
**Commit évalué :** `e03f447858b1fd7f7c56f3268ef8f644db3ce39f`

---

## 1. Audit du diff

- **`updateDoc()`** : Bien utilisé pour l'édition (`isEditing === true`).
- **`setDoc()`** : Bien utilisé pour la création d'élève et de `validation_requests`.
- **`deleteDoc()`** : Bien utilisé pour la suppression directe.
- **`saveDB()`** : Supprimé avec succès des flux d'édition, de création (manuelle) et de suppression, ainsi que des demandes de validation.
- **Scope** : Le commit ne modifie que `Students.tsx` (et ajoute le fichier de test autorisé). Le scope est respecté.

---

## 2. Audit du patch (CRITIQUE)

L'implémentation de `updateDoc` est la suivante :
```typescript
const patchData = { ...finalStudent };
delete patchData.id;
await updateDoc(studentRef, patchData);
```
Où `finalStudent` contient l'intégralité de l'objet `currentStudent` (initialisé via `student` dans `handleOpenModal`), auquel s'ajoute une mutation dangereuse :
```typescript
if (!finalStudent.schoolId && currentSchool) {
  finalStudent.schoolId = currentSchool.id;
}
```

**Résultat :** Le patch contient `schoolId`, ainsi que tous les autres champs techniques présents dans le document initial (potentiellement `createdAt`, `createdBy`, etc.). 
- Il ne se limite PAS aux champs "réellement édités" par l'utilisateur.
- Il inclut des champs immuables (`schoolId`).
**Risque :** Si le client envoie un objet malformé ou qu'un attaquant manipule l'état local, il écrase toute la structure du document.

---

## 3. ABA Problem

**Scénario :** L'utilisateur A ouvre la fiche, B supprime l'élève, A clique sur Enregistrer.
- **Comportement Firestore :** L'opération `updateDoc` est exécutée. Étant donné que le document cible a été supprimé par B, Firestore **rejette** formellement la mise à jour (Erreur `NOT_FOUND`). 
- **Comportement UI :** Le bloc `catch (err)` intercepte l'erreur et affiche un `alert` ("Erreur lors de l'enregistrement : ..."). 
- **Résurrection :** Le risque de résurrection est éliminé grâce à l'abandon du `setDoc` hérité de `saveDB`. Le problème ABA est **sécurisé**.

---

## 4. Double submit

- **UUID Stable :** Garanti. `crypto.randomUUID()` est généré lors de `handleOpenModal`.
- **`isSaving` :** Garanti. Le bouton est mis en état "disabled" et la fonction sort immédiatement (`if (isSaving) return;`).
- **Idempotence :** Même si un utilisateur parvenait à outrepasser l'UI et soumettre deux fois la création, Firestore recevrait deux `setDoc` avec le même `id`. L'opération est idempotente, aucun doublon d'élève ne sera créé. La fenêtre de course est fermée.

---

## 5. Régressions métier (Orphan Data)

Le passage à `deleteDoc(student.id)` effectue un "Hard Delete". Cependant, cet élève possède de multiples relations dans le système.
Sa destruction laissera des **références orphelines** dans les collections suivantes :
- `payments` (L'historique des paiements de cet élève sera orphelin).
- `grades` (Les notes).
- `attendance` (L'historique d'assiduité).
- `validation_requests` (Les requêtes le ciblant).

Cela peut entraîner des plantages sur l'interface utilisateur, notamment dans les historiques de transactions (`TransactionHistory.tsx`), où un code comme `students.find(s => s.id === tx.studentId)` renverra `undefined` et causera des `TypeError` lors du rendu. Le système manque de suppression en cascade (via Cloud Functions) ou de Soft Delete (ex: `deleted: true`).

---

# VERDICT

**BLOCKED — PATCH UNSAFE**

**Justification :** Le patch envoyé à `updateDoc` inclut tous les champs du document original, dont le `schoolId` et d'autres champs non éditables, au lieu de se limiter aux champs strictement manipulés par le formulaire. Cela viole la consigne "Ne mettre à jour que les champs réellement édités" et "ne contient pas schoolId / createdAt". 

Le commit `e03f447` doit être corrigé pour isoler strictement les champs du formulaire dans le patch d'édition.
