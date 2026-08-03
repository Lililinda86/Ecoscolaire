# ECOSCOLAIRE — P0-003 — COMMIT 3B.1 — SECURITY REVIEW

**Auteur :** Lead Security Reviewer & Firestore Rules Auditor
**Date :** 28 Juin 2026
**Commit évalué :** `2d46f25f8fbe4655a7233a37a409b366ec912edc`

---

## 1. Revue du Périmètre (Scope)
✅ **PASSED.** `Students.tsx`, `Payments.tsx` et le flux nominal de création/suppression des élèves n'ont pas été altérés. Le code ajouté se cantonne au fichier de diagnostic, aux types TypeScript et au script d'administration en local.

## 2. Revue Sécurité : `Diagnostic.tsx`
❌ **FAILED.**
- **Bouton non masqué :** L'action "Recalculer les quotas élèves" n'est pas enveloppée par une condition stricte `if (currentUser?.role === 'superAdmin')`. Par conséquent, le bouton est rendu dans le DOM pour tout utilisateur pouvant accéder à cette page (par exemple un administrateur d'école non-superadmin s'il y accède via URL directe si le routing n'est pas strict, ou simplement en termes de défense en profondeur).
- **Vérification d'exécution :** La fonction `reconcileStudentCount` n'implémente pas le guard `if (currentUser?.role !== 'superAdmin') return;` avant de lancer la requête `updateDoc`.

## 3. Revue Sécurité : Firestore Rules (`firestore.rules`)
❌ **FAILED.** **(VULNÉRABILITÉ MAJEURE)**
Les règles de sécurité Firestore actuelles (ligne 41) protègent la clé **`studentsCount`** (avec un "s") via la fonction `isUpdatingSaasFields()`.
Or, l'architecture approuvée (et l'implémentation dans le commit 3B.1) utilise la clé **`studentCount`** (sans "s").
En conséquence :
1. La clé `studentCount` n'est **PAS** évaluée par `hasAny(...)`.
2. Un rôle de "propriétaire d'école" (Owner) est techniquement autorisé par la règle `allow update: if isAuthenticated() && isActive() && (isSuperAdmin() || (canManageSchool(schoolId) && !isUpdatingSaasFields()));`.
3. Un propriétaire d'école malveillant peut donc forger une requête SDK Client pour écraser son propre `studentCount` à `0`, contournant ainsi la limitation SaaS.

## 4. Revue Script Admin (`migrate-student-counts.mjs`)
✅ **PASSED.**
- Le script exige formellement le `serviceAccountKey.json`.
- Il échoue explicitement si l'auth est manquante.
- Il filtre les `students` sans modifier la collection et utilise un unique `updateDoc` sur la ressource ciblée.

---

## 5. Conclusion de l'Audit
Le commit 3B.1, bien que respectant le scope des fichiers, introduit une faille critique de type **SaaS Quota Bypass** au niveau des Firestore Rules en raison d'une dissonance de nommage (`studentsCount` vs `studentCount`), couplée à une absence de guard UI dans `Diagnostic.tsx`. 

Il est impératif de :
1. Ajouter `'studentCount'` dans `isUpdatingSaasFields()` dans `firestore.rules`.
2. Restreindre l'affichage et l'exécution dans `Diagnostic.tsx` via `currentUser.role === 'superAdmin'`.

# VERDICT

**BLOCKED — FIRESTORE RULES UNSAFE**
