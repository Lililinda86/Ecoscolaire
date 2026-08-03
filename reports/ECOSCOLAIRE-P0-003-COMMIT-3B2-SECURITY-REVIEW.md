# ECOSCOLAIRE — P0-003 — COMMIT 3B.2 — SECURITY REVIEW

**Auditeur :** Principal Security Reviewer
**Date :** 28 Juin 2026
**Commit évalué :** `2ef70ebdfc9671b91adbd35215a0fbd074f315f9`

---

## 1. Audit du Scope
- **Fichiers modifiés :** `src/pages/Students.tsx`, `scripts/test-p0-003-studentcount-3b2.mjs`.
- **Verdict partiel :** ✅ Le périmètre est respecté. `Payments.tsx`, `AppContext.tsx`, `firestore.rules` et `Diagnostic.tsx` n'ont pas été altérés.

---

## 2. Audit Transactionnel (Création)
- `runTransaction` est bien utilisé.
- Lecture de `schools/{schoolId}` pour obtenir `studentCount`.
- Tolérance de `studentCount` manquant (`|| 0`).
- Calcul du SaaS Quota effectué côté serveur (dans la closure de la transaction).
- Rejet strict `QUOTA_EXCEEDED` si limite atteinte.
- Test `ALREADY_EXISTS` sur le document étudiant présent.
- **Verdict partiel :** ✅ L'atomicité de la création est parfaite. Aucun `increment()` asynchrone n'est utilisé.

---

## 3. Audit Transactionnel (Suppression)
- Opération encodée dans un `runTransaction`.
- Existence de l'élève vérifiée via `.get()`.
- Décrément protégé contre les valeurs négatives (`Math.max(0, count - 1)`).
- Pas de suppression unitaire hors transaction sur le flux nominal (administrateur).
- **Verdict partiel :** ✅ Sûr et cohérent.

---

## 4. Audit UI / Cohérence UX (ALERTE MAJEURE)
L'audit du fichier `Students.tsx` révèle une faille de conception UX/UI liée aux consignes :
*« Vérifier que l’UI ne bloque pas encore avec `db.students.length` si cela contredit `studentCount`. »*

Bien que la décision bloquante dans `handleSave` ait été retirée (suppression du bloc `if (!isEditing && limitReached)`), **l'interface continue de désactiver le bouton d'ajout** sur la base de la longueur de la liste locale :

```tsx
const limitReached = isStudentLimitReached(currentSchool, db.students.length);
// ...
<button onClick={() => handleOpenModal()} disabled={isSchoolSuspended || limitReached}>
  Ajouter
</button>
```

**Problème :** Si le client a un état local désynchronisé (ex: `db.students.length = 100` mais `currentSchool.studentCount = 99` suite à la suppression d'un élève par un autre utilisateur), le bouton "Ajouter" est grisé. L'utilisateur est techniquement bloqué par le frontend de manière arbitraire, alors que la transaction aurait autorisé l'ajout. 
L'affichage local doit utiliser `currentSchool.studentCount` en priorité pour la désactivation (voire laisser le bouton cliquable et déléguer le blocage à la transaction).

- **Verdict partiel :** ❌ **NON CONFORME**.

---

## 5. Audit des Erreurs
- Les messages d'erreurs ont été remplacés par des descriptions métier (hors-ligne, permission-denied, quota dépassé, concurrence aborted).
- Aucun objet d'erreur Firestore brut n'est retourné à l'utilisateur.
- **Verdict partiel :** ✅ Conforme.

---

## 6. Audit des Tests
- Le build `tsc -b && vite build` a passé après le nettoyage des imports.
- Le script Node reproduit bien les cas de concurrence sur les limites (1 succès, 19 échecs quota) et l'idempotence des suppressions.
- **Verdict partiel :** ✅ Valide.

---

# CONCLUSION & VERDICT FINAL

L'architecture backend (transactions Firestore) a été très bien implémentée et sécurise formellement l'intégrité de la base. Néanmoins, l'UX n'a pas été totalement mise en conformité avec la nouvelle source de vérité : le bouton principal de création reste conditionné par le calcul obsolète `db.students.length`, créant une faille de déni de service local (UX blocking) en cas de désynchronisation inoffensive.

**VERDICT : BLOCKED — UI STILL USES LOCAL QUOTA DECISION**
