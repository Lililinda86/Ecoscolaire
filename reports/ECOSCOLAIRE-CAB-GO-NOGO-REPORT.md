# ECOSCOLAIRE — FINAL GO / NO-GO PRODUCTION BOARD

**Comité (CAB) :** Change Advisory Board (Staff Engineers, SRE, Architectes, Release Managers)
**Date :** 28 Juin 2026

## 1. Synthèse Exécutive
Le CAB s'est réuni pour statuer sur la mise en production du moteur d'import massif d'élèves (P0-003). 
Le noyau logiciel (moteur transactionnel, comptabilité Firestore, BulkWriter) est certifié d'un point de vue algorithmique. L'intégrité des données est garantie par l'implémentation de la *Reality-Based Reconciliation*. 
Cependant, l'enveloppe opérationnelle (SRE) et la boucle d'auto-guérison (Zombie Sweeper) **n'ont pas été implémentées ni déployées**. Le système dépend donc d'une intervention humaine directe en base de données pour survivre à un crash d'infrastructure (OOM, Timeout).

## 2. Analyse par Domaine

### 2.1 Moteur Transactionnel (Architecture, OCC, Quota)
Le code (`importStudents.ts`, `studentImportReconciler.ts`) fait preuve d'une robustesse exceptionnelle. Les tests unitaires confirment que les transactions empêchent formellement les Lost Updates. Le quota s'appuie sur `transaction.get(query.count())`, documenté par le SDK Firebase Admin, garantissant l'absence de dérive mathématique.

### 2.2 Résilience et Idempotence (Auto-Guérison)
L'idempotence des relances dépend d'un cron job (Cloud Scheduler) censé intercepter les jobs `RUNNING` qui dépassent 15 minutes. **Ce cron job n'existe pas dans le dépôt de code.** La reprise après crash est donc une fonction purement théorique à ce stade.

### 2.3 Opérations (Monitoring, Alerting, Runbooks)
L'observabilité passive (logs JSON) est bonne. Néanmoins, l'équipe ne dispose d'aucun dispositif d'alerte, ni de métriques (Cloud Monitoring), ni de manuels de résolution d'incidents (Runbooks). L'exploitation en conditions réelles (Nuits/Week-ends) est impossible sans solliciter l'équipe de développement.

---

## 3. Matrice de Certification CAB

| Domaine        | Verdict | Niveau de confiance | Preuve |
| -------------- | ------- | ------------------- | ------ |
| Architecture   | PROUVÉ | Élevé | Code source et machine à états |
| Transactions   | PROUVÉ | Élevé | Usage exhaustif de `runTransaction` |
| OCC            | PROUVÉ | Élevé | Lectures systématiques avant écritures |
| Idempotence    | NON VÉRIFIABLE | Faible | Code du Sweeper manquant (Trigger Scheduler) |
| BulkWriter     | PROUVÉ | Élevé | Usage de `Promise.allSettled` et `onWriteError` |
| Quota          | PROUVÉ | Élevé | Modèle Reality-Based avec agrégation Firestore |
| Reconciliation | PROUVÉ | Élevé | Tests automatisés (6 PASS) sur `studentImportReconciler` |
| Sécurité       | PROUVÉ | Moyen | Firestore Rules non auditées, mais IDs déterministes blindés |
| Résilience     | NON VÉRIFIABLE | Faible | Pas de mécanisme de récupération autonome (Zombie) |
| Monitoring     | NON VÉRIFIABLE | Faible | Infrastructure-as-code inexistante |
| Alerting       | NON VÉRIFIABLE | Faible | Aucune alerte configurée |
| Runbooks       | NON VÉRIFIABLE | Faible | Aucun document existant |
| Tests          | PROUVÉ | Élevé | Scripts `.cjs` réussis |
| Build          | PROUVÉ | Élevé | Sortie `tsc` propre |
| CI/CD          | NON VÉRIFIABLE | Faible | Pipeline de déploiement et rollback non implémentés |

---

## 4. Registre des Risques Résiduels
1. **Gel Permanent d'un Job :** Si Google Cloud preempt/tue l'instance Cloud Function, le job restera infiniment en statut `RUNNING`. L'école ne pourra plus rien importer.
2. **Burnout Opérationnel :** Les SRE devront modifier Firestore en production manuellement (reset de statut) pour débloquer les écoles.

---

## 5. Décision du CAB

Conformément à la règle d'évaluation stricte : 
> *Obligatoire si une propriété critique est NON VÉRIFIABLE ou si un mécanisme indispensable à l'exploitation est absent.*

**DÉCISION FINALE : NO-GO**

## 6. Liste des Actions Obligatoires (Avant prochain CAB)
Pour obtenir un "GO", l'équipe d'ingénierie doit valider le "Sprint Prod 1 & 2" du Backlog :
1. Implémenter et tester la Cloud Function Scheduled (Sweeper).
2. Fournir les scripts Terraform / Scripts de configuration pour le Monitoring et l'Alerting.
3. Rédiger le Runbook de Niveau 1 détaillant la résolution manuelle d'un job bloqué.
4. Mettre en place la CI/CD pour un rollback automatisé en cas d'échec du déploiement.
