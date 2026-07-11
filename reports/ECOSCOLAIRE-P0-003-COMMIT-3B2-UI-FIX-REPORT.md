# ECOSCOLAIRE — P0-003 — COMMIT 3B.2 — UI QUOTA DECISION FIX

**Auteur :** Lead Frontend Architect
**Date :** 28 Juin 2026

---

## 1. Correction Appliquée et Stratégie UX

Suite à la revue de sécurité indiquant un blocage inacceptable de l'interface par un état local (`db.students.length`), une refonte UX a été mise en place dans `Students.tsx`.

- **Choix Stratégique : Option A (Recommandée)** retenue.
- Le bouton "Ajouter" n'est **plus** désactivé par le dépassement de quota local. Sa seule contrainte d'accessibilité est maintenant l'état global du compte (`isSchoolSuspended`). 
- **La décision d'échec ou de succès du Quota SaaS est entièrement déléguée à la transaction Firestore Backend** (qui renvoie le message d'erreur approprié de type `QUOTA_EXCEEDED`).
- **Affichage local repensé :** La bannière d'information SaaS utilise la logique `currentSchool?.studentCount ?? db.students.length` et signale formellement à l'utilisateur : *"Capacité SaaS : X / Y (Synchronisé avec le serveur)"* pour ne laisser aucune ambiguïté sur la source de vérité.

---

## 2. Preuves de Libération (Unblocking) de l'UI

L'attribut bloquant sur le déclencheur a été éliminé :

**AVANT :**
```tsx
<button onClick={() => handleOpenModal()} disabled={isSchoolSuspended || limitReached} title={limitReached ? "Limite SaaS atteinte" : ""}>
```

**APRÈS :**
```tsx
<button onClick={() => handleOpenModal()} disabled={isSchoolSuspended}>
```

L'appel à `isStudentLimitReached` n'utilise plus l'état local comme argument primaire non-sûr.

---

## 3. Résultats Build & Test
- **Vérification statique :** ✅ `isStudentLimitReached` prend désormais en charge l'évaluation mixte avec fallback sur `studentCount`. Le bouton Ajouter est certifié libre de toute clause `limitReached`.
- **Tests concurrents :** ✅ Les tests backend initiaux (Test 5 & 6) valident que la délégation exclusive au serveur de la décision finale continue de fonctionner et repousse les attaques/bursts de requêtes.
- **Build :** ✅ Succès. Aucun conflit ou bris d'importations.

---

## 4. SHA Final (Commit de Correction)

Le correctif a fait l'objet d'un nouveau commit.

- **Nouveau SHA HEAD :** `31e01dd506f3db32419a7bd50a685e8f7d91abf9`
- **Message :** `fix(students): use server studentCount for quota UI decisions`

---

# VERDICT

**COMMIT FIXED — READY FOR SECURITY REVIEW**
