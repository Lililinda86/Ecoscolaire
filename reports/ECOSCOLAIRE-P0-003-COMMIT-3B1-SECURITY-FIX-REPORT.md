# ECOSCOLAIRE — P0-003 — COMMIT 3B.1 — SECURITY FIX REPORT

**Auteur :** Lead Firestore Rules Engineer & Security Reviewer
**Date :** 28 Juin 2026
**Commit SHA :** `a49f64505cac91ebbb077f7bb155c34fcf62e9d9`

---

## 1. Contexte du Fix
Suite à l'audit de sécurité, le commit initial 3B.1 a été bloqué pour cause de non-protection de `studentCount` dans `firestore.rules` (permettant un bypass du quota SaaS par un Owner d'école), et une UI ne filtrant pas strictement le rôle Super Admin dans `Diagnostic.tsx`. Ces deux vulnérabilités sont désormais corrigées.

## 2. Fichiers Modifiés (Périmètre Strict)
- `[MODIFIÉ]` `firestore.rules`
- `[MODIFIÉ]` `src/pages/Diagnostic.tsx`
- `[MODIFIÉ]` `scripts/test-p0-003-studentcount-3b1.mjs`

*Les fichiers métier (`Students.tsx`, `Payments.tsx`, etc.) n'ont délibérément pas été altérés.*

---

## 3. Corrections Appliquées

### A. Firestore Rules (`firestore.rules`)
- **Action :** Ajout explicite de `'studentCount'` et `'pilot'` dans la liste de la fonction `isUpdatingSaasFields()`.
- **Résultat :** Désormais, toute tentative de modification de `schools/{schoolId}.studentCount` par un utilisateur dont le rôle n'est pas `superAdmin` (incluant les rôles Owner/Directeur/Secrétaire) sera bloquée au niveau de la base de données. L'intégrité du compteur SaaS est garantie backend-side.

### B. Interface Utilisateur (`Diagnostic.tsx`)
- **Action 1 (Guard logique) :** Ajout d'une condition bloquante en première ligne de `reconcileStudentCount()` : `if (currentUser?.role !== 'superAdmin') return;`.
- **Action 2 (Guard visuel) :** Le bouton "Recalculer les quotas élèves" est conditionné via `{currentUser?.role === 'superAdmin' && (<button...>)}`.
- **Résultat :** Défense en profondeur assurée. Le bouton est invisible pour les non-admins, et la fonction Javascript rejettera toute exécution frauduleuse avant même de toucher Firestore.

---

## 4. Résultats Build & Test

- **TypeScript / Vite Build :** SUCCESS (`tsc -b && vite build` exécuté sans erreur de typage).
- **Test Statique (Script mis à jour) :** SUCCESS.
  - La vérification confirme désormais la présence de la chaîne `'studentCount'` couplée à `isUpdatingSaasFields` dans les règles Firestore.
  - La vérification confirme la présence du guard `superAdmin` dans `Diagnostic.tsx`.
  - La vérification certifie l'absence absolue de modification sur les autres fichiers métiers.

---

# VERDICT

**COMMIT FIXED — READY FOR SECURITY REVIEW**
