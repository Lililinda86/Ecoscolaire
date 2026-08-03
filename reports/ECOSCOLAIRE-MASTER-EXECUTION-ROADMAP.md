# ECOSCOLAIRE — EXECUTION ROADMAP (MASTER PLAN)

**Rôle :** Principal Engineering Manager & Technical Program Manager
**Date :** 28 Juin 2026

## 1. OBJECTIFS DU MASTER PLAN
Ce plan d'exécution définitif est le seul document directeur jusqu'à la mise en production.
**Règles absolues :**
- L'architecture transactionnelle (Phase 1 → 2E) est gelée et validée. Aucun nouvel audit architectural ne sera mené.
- Aucune fonctionnalité métier hors-scope n'est autorisée.
- L'objectif unique est l'industrialisation, la robustesse opérationnelle (SRE) et le déploiement.

## 2. DÉFINITION DE DONE (DoD) GLOBALE
Chaque tâche de ce backlog doit satisfaire aux conditions suivantes pour être considérée `DONE` :
1. Code revu et mergé sur la branche `main`.
2. Tests unitaires et d'intégration implémentés et 100% PASS.
3. Tests de charge validés (si applicable).
4. Runbooks mis à jour et validés par un SRE (si applicable).
5. Code déployé en environnement de *Staging*.

---

## 3. BACKLOG D'EXÉCUTION (EPICS)

### EPIC 1 — Finalisation P0-003 (Moteur d'Import)
*Objectif : Refermer la dernière faille d'idempotence (Crash Recovery).*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E1.1** | Cloud Function "Zombie Sweeper" | P0 | M | - | - Cloud Scheduler (toutes les 15m) détecte les jobs `RUNNING` non mis à jour depuis >15m. |
| **E1.2** | Mécanisme de Lease Sweeper | P0 | S | E1.1 | - Le Sweeper pose un `lockedUntil` via transaction Firestore pour éviter les exécutions concurrentes. |
| **E1.3** | Reprise Automatique | P0 | M | E1.2 | - Le Sweeper relance automatiquement la Phase 2B (Discovery) sur les jobs zombies. |

### EPIC 2 — Suppression de `saveDB()`
*Objectif : Éradiquer l'ancienne dette technique d'écriture Firestore non-transactionnelle.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E2.1** | Audit des dépendances `saveDB()` | P1 | S | - | - Liste exhaustive des modules utilisant encore `saveDB`. |
| **E2.2** | Migration vers Firestore Native | P1 | L | E2.1 | - Toutes les écritures utilisent `runTransaction` ou `BulkWriter`. `saveDB()` est formellement supprimé du code. |

### EPIC 3 — CI/CD
*Objectif : Déploiements fiables, traçables et réversibles.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E3.1** | Pipeline GitHub Actions | P0 | M | - | - À chaque push `main` : lint, tsc, tests unitaires obligatoires. |
| **E3.2** | Déploiement Automatique | P1 | M | E3.1 | - Déploiement Cloud Functions automatisé après succès du CI. |
| **E3.3** | Procédure de Rollback | P0 | S | E3.2 | - Script CLI permettant de restaurer la version précédente `N-1` de Firebase Functions en < 2 minutes. |

### EPIC 4 — QA (Qualité)
*Objectif : Preuves d'assurance qualité E2E.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E4.1** | Tests de Charge | P1 | M | E1.3 | - Import simultané de 10 écoles de 10 000 élèves = 0 Timeout, 0 fuite de Quota. |
| **E4.2** | Tests Playwright E2E | P2 | L | - | - Parcours utilisateur complet d'upload CSV sur le Frontend jusqu'à la réconciliation backend. |
| **E4.3** | Tests de Chaos (Reprise) | P1 | M | E1.3 | - Coupure physique forcée d'une fonction, vérification que le Sweeper guérit le système. |

### EPIC 5 — Sécurité
*Objectif : Blindage Cloud IAM et Firestore Rules.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E5.1** | Audit & Mise à jour Firestore Rules | P0 | M | - | - Verrouillage multi-tenant : un utilisateur ne peut écrire que dans sa `schoolId`. |
| **E5.2** | Restriction IAM Cloud Functions | P1 | M | - | - Les fonctions n'utilisent plus l'Editor par défaut, mais un Service Account au périmètre réduit. |

### EPIC 6 — Production Readiness (Day 2 Ops)
*Objectif : Exploitabilité pour le support.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E6.1** | Alerting & Cloud Monitoring | P0 | M | - | - Alerte PagerDuty/Slack sur "System Error" ou "Job RUNNING > 30m". |
| **E6.2** | Runbooks N1 / N2 | P0 | M | E6.1 | - Procédures d'intervention manuelles documentées dans le Wiki Ops. |
| **E6.3** | CLI Admin | P1 | L | - | - Outil Node.js CLI : `npm run admin:cancel-job <jobId>`. |

### EPIC 7 — Pré-production
*Objectif : Go/No-Go final technique sur environnement isofonctionnel.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E7.1** | Sanitize & Seed Staging | P0 | S | - | - Environnement Staging rempli avec des données réalistes anonymisées. |
| **E7.2** | Validation Staging (CAB) | P0 | S | Toutes | - Tous les tests E2E et de charge passent en Staging. Signature formelle du CAB. |

### EPIC 8 — Déploiement pilote
*Objectif : Mise en production progressive.*

| Tâche | Description | Prio | Effort | Dépendances | Critères d'Acceptation (AC) |
|---|---|---|---|---|---|
| **E8.1** | Déploiement ITALO (Interne) | P0 | S | E7.2 | - Déploiement sur le compte d'école de test interne. Validation UI/UX. |
| **E8.2** | Soft Launch (1 École) | P0 | S | E8.1 | - Import massif pour 1 école cliente pilote. Monitoring rapproché sur 48h. |
| **E8.3** | Scale-out (3 Écoles) | P1 | S | E8.2 | - Ouverture à 3 écoles clientes. |
| **E8.4** | Période d'observation 2 semaines | P0 | - | E8.3 | - Aucun incident P0/P1 remonté par l'Alerting. Autorisation de disponibilité générale. |

---

## 4. PLAN D'EXÉCUTION (SPRINTS)

L'équipe d'ingénierie exécutera ce Master Plan selon le cadencement suivant :

**Sprint A (Core Ops & Résilience) :**
- EPIC 1 (E1.1, E1.2, E1.3)
- EPIC 3 (E3.1, E3.2, E3.3)
- EPIC 5 (E5.1, E5.2)

**Sprint B (Qualité & Support) :**
- EPIC 2 (E2.1, E2.2)
- EPIC 6 (E6.1, E6.2, E6.3)
- EPIC 4 (E4.1, E4.3)

**Sprint C (E2E, Staging & Rollout) :**
- EPIC 4 (E4.2)
- EPIC 7 (E7.1, E7.2)
- EPIC 8 (E8.1, E8.2)
