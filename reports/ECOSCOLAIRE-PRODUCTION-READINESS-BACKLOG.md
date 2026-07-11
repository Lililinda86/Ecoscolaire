# ECOSCOLAIRE — PRODUCTION READINESS BACKLOG (FINAL)

**Rôles :** Principal Engineering Manager, Principal SRE, Staff Firestore Engineer
**Date :** 28 Juin 2026

## DÉFINITION DE DONE (DoD) GLOBALE
Pour chaque ticket du backlog, les critères suivants doivent être validés avant la mise en production :
1. Code mergé sur `main` avec tests unitaires/intégration passés.
2. Terraform/Config Cloud appliqué en Staging.
3. Documentation ou Runbook mis à jour.
4. Validation par un SRE.

---

## 1. BACKLOG DÉTAILLÉ PAR CATÉGORIE

### 1.1 Fiabilité (Reliability)
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **REL-01** | Implémenter le "Zombie Sweeper" | P0 | Critique | M | - | - Cloud Scheduler déclenché toutes les 15m. <br>- Lit les jobs `RUNNING` vieux de >15m. <br>- Relance Phase 2B et 2D via PubSub. |
| **REL-02** | Mécanisme de Lease (Verrouillage) Sweeper | P0 | Élevé | S | REL-01 | - Un job `RUNNING` sweepé reçoit un timestamp `lockedUntil` pour éviter le double balayage concurrent. |

### 1.2 Observabilité
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **OBS-01** | Tableaux de Bord Ops (Dashboard) | P2 | Faible | M | - | - Dashboard GCP centralisant la durée moyenne des imports, le taux de succès, et le volume d'élèves ingérés par heure. |

### 1.3 Monitoring & Alerting
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **MON-01** | Alertes "System Error" (Cloud Functions) | P0 | Critique | S | - | - Log-based metric sur les erreurs fatales interceptées. <br>- Alerte Slack/PagerDuty si > 0 sur 5 minutes. |
| **MON-02** | Alertes Jobs Bloqués | P0 | Élevé | S | REL-01 | - Alerte si un job reste `RUNNING` ou `VALIDATING` pendant plus de 30 minutes (le Sweeper aurait dû le réparer). |
| **MON-03** | SLO et Error Budget | P3 | Faible | S | MON-01 | - Définition formelle : 99.9% des imports terminent en moins de 15 min sans erreur non rattrapée. |

### 1.4 Outils d'exploitation
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **OPS-01** | CLI / Interface d'Admin : Annuler un Job | P1 | Moyen | M | - | - Commande pour passer un job `PENDING`/`VALIDATING` en `CANCELLED` en toute sécurité. |
| **OPS-02** | CLI d'Admin : Extraction CSV des erreurs | P2 | Moyen | S | - | - Commande lisant `permanentFailures` d'un job pour générer un fichier d'erreurs lisible par les écoles. |

### 1.5 Sécurité
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **SEC-01** | Restriction IAM des Cloud Functions | P1 | Élevé | S | - | - Le service account par défaut est remplacé par un compte restreint à `students`, `schools`, `student_import_jobs`. |
| **SEC-02** | Audit Trail des administrateurs | P2 | Moyen | S | OPS-01 | - Toute annulation de job manuelle génère un log inaltérable dans Firestore `audit_logs`. |

### 1.6 Documentation
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **DOC-01** | Rédaction du Runbook N1/N2 | P0 | Élevé | M | - | - Playbook documenté : "Job bloqué", "Erreurs Quota", "Alertes OOM". <br>- Inclut les commandes d'investigation Firestore. |

### 1.7 Qualité
| ID | Tâche | Priorité | Risque | Effort | Dépendances | Critères d'Acceptation |
|---|---|---|---|---|---|---|
| **QA-01** | Test de charge final (100 écoles x 10 000 élèves) | P1 | Élevé | L | REL-01 | - Exécution asynchrone massive via scripts. <br>- 0 dépassement de timeout, 0 fuite de quota. |

---

## 2. JALONS DE MISE EN PRODUCTION (SPRINTS)

### Sprint Production 1 : Sécurisation & Résilience Base (Blockers)
*Objectif : Le système peut survivre à n'importe quelle panne sans intervention humaine immédiate.*
- **REL-01** : Zombie Sweeper
- **REL-02** : Lease Sweeper
- **MON-01** : Alertes Erreurs Système
- **MON-02** : Alertes Jobs Bloqués

### Sprint Production 2 : Exploitabilité N1 (Go/No-Go)
*Objectif : L'équipe de support peut gérer les incidents sans faire appel aux développeurs.*
- **DOC-01** : Runbook d'exploitation
- **OPS-01** : Annulation de Job
- **SEC-01** : Restriction IAM Cloud Functions
- **QA-01** : Test de charge ultime

### Sprint Production 3 : Confort Ops & Visibilité (Post-Lancement)
*Objectif : Piloter sereinement l'application à grande échelle.*
- **OBS-01** : Tableaux de Bord (Dashboards GCP)
- **OPS-02** : Extraction CSV
- **SEC-02** : Audit Trail
- **MON-03** : SLO / Error Budget
