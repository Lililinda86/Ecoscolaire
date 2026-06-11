# 🔐 Comptes de Test Runtime - EcoScolaire

**Générés par :** TEST-DATA-BUILDER-ECOSCOLAIRE
**Date :** Juin 2026

Ce document référence l'intégralité des accès de test générés par le script `scripts/setup-test-data.mjs`.

## Administration Globale (Accès total)

| Email | Mot de passe | Rôle | École | Objectif du compte |
|---|---|---|---|---|
| `superadmin.test@ecoscolaire.com` | `Test@2026Super!` | Super Admin | *Toutes* | Vérifier le dashboard SaaS, les KPIs globaux et valider la création d'écoles. |

---

## 🏫 École Alpha (Données massives)

*Environnement principal de test contenant des élèves, paiements, présences et notes.*

| Email | Mot de passe | Rôle | Objectif du compte |
|---|---|---|---|
| `owner.alpha@ecoscolaire.com` | `Test@2026Alpha!` | Owner | Valider la vue à 360° de l'école Alpha. |
| `director.alpha@ecoscolaire.com` | `Test@2026Alpha!` | Directeur | Vérifier la validation des suppressions d'élèves. |
| `secretary.alpha@ecoscolaire.com` | `Test@2026Alpha!` | Secrétaire | Tester la saisie des présences et la génération des bulletins. |
| `accountant.alpha@ecoscolaire.com`| `Test@2026Alpha!` | Comptable | Valider les paiements (MoMo et Cash). |
| `teacher1.alpha@ecoscolaire.com`  | `Test@2026Alpha!` | Enseignant | Tester la saisie des notes (CP/CE1/CE2) et l'interdiction de voir les finances. |
| `parent1.alpha@ecoscolaire.com`   | `Test@2026Alpha!` | Parent | Vérifier le portail parent et tester le Paywall sur factures impayées. |
| `driver.alpha@ecoscolaire.com`    | `Test@2026Alpha!` | Chauffeur | Tester le module de suivi de bus (si implémenté). |

---

## 🏫 École Beta (Isolation multi-tenant)

*Environnement vide pour valider que les données de l'École Alpha ne "fuient" jamais vers Beta.*

| Email | Mot de passe | Rôle | Objectif du compte |
|---|---|---|---|
| `owner.beta@ecoscolaire.com` | `Test@2026Beta!` | Owner | S'assurer qu'aucun élève ou revenu de l'école Alpha n'est affiché. |
| `director.beta@ecoscolaire.com` | `Test@2026Beta!` | Directeur | Vérifier les paramètres d'isolation. |
| `teacher.beta@ecoscolaire.com`  | `Test@2026Beta!` | Enseignant | Vérifier que les classes d'Alpha ne sont pas listées. |
| `parent.beta@ecoscolaire.com`   | `Test@2026Beta!` | Parent | Vérifier l'absence des enfants Alpha. |
