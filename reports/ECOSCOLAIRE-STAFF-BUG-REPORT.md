# ECOSCOLAIRE-STAFF-BUG-REPORT

**Date d'audit** : 25 Juin 2026
**Cible** : Module Personnel (`src/pages/Staff.tsx`)

---

## 1. DÉCOUVERTE DU BUG (ANOMALIE BLOQUANTE)

Lors de la préparation de l'audit automatisé du module **Personnel** (Phase 2 et Phase 4 de la mission), j'ai inspecté la structure de la page. 

Il s'avère qu'un grand nombre de fonctionnalités exigées par le plan d'audit **n'existent pas du tout dans le code source actuel** de l'application.

### Fonctionnalités manquantes (Gaps Fonctionnels) :
*   **Phase 2 (Lecture)** : 
    *   ❌ Aucune barre de recherche (`recherche`)
    *   ❌ Aucun système de tri des colonnes (`tri`)
    *   ❌ Aucun filtre par rôle ou statut (`filtres`)
    *   ❌ Aucune pagination (`pagination`)
    *   ❌ Aucun champ pour la photo de profil (`photos`)
*   **Phase 4 (Présence Personnel)** : 
    *   ❌ L'onglet, le tableau ou le module de gestion des présences du personnel (Absence, Retard, Congé) est **totalement inexistant**.

---

## 2. IMPACT ET GRAVITÉ

*   **Gravité** : **CRITIQUE (Bloquant pour l'audit)**
*   **Impact** : Impossible d'exécuter l'audit complet tel que demandé dans la mission. Toute tentative de cibler ces éléments avec Playwright se solderait par des erreurs "Element not found". Le module est à l'état de "Minimum Viable Product" très basique (simple liste CRUD).

---

## 3. PREUVES (Analyse du code source)

L'inspection de `src/pages/Staff.tsx` (146 lignes au total) montre une simple balise `<table>` itérant sur `db.staff.map`. Il n'y a aucun état (useState) gérant des filtres, une recherche ou une pagination. Le composant `<Modal>` ne contient que trois champs : Nom, Rôle, et Classe assignée.

---

## 4. SOLUTION PROPOSÉE

Conformément à la règle *"Dès qu'un bug est découvert : Arrêter immédiatement. Produire le rapport. Ne jamais corriger automatiquement. Toujours attendre validation"*, j'ai suspendu l'exécution des tests Playwright.

**Deux options s'offrent à nous :**

1.  **Option A (Développement)** : Tu m'autorises à coder toutes ces fonctionnalités manquantes (Recherche, Filtres, Pagination, Photos, et le sous-module de Présence Personnel) avant de reprendre l'audit.
2.  **Option B (Audit Réduit)** : Tu m'autorises à contourner ces manques et à auditer uniquement le CRUD basique existant ainsi que les permissions et la sécurité (Phases 1, 3, 6, 7, 8, 9, 10), en déclarant le module comme "NON VALIDÉ" pour les fonctionnalités manquantes.

J'attends tes instructions pour procéder.
