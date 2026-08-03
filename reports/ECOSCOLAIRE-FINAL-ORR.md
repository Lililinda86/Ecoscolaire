# ECOSCOLAIRE — FINAL OPERATIONS READINESS REVIEW (ORR)

**Comité d'Exploitation :** Principal SRE, Incident Response Lead, Cloud Operations Specialist
**Date :** 28 Juin 2026

## 1. Observabilité
**Verdict : PROUVÉ**
Le code génère des logs structurés (via `console.log` / `console.error`) préfixés par le `jobId`. L'état du job dans Firestore est extrêmement riche : il stocke un `bulkWriterSummary` contenant `successfulCreates`, `successfulUpdates`, `failedCreates`, et un tableau détaillé `permanentFailures` (incluant `matricule`, `code`, et `message`). La durée `durationMs` est également capturée. L'observabilité applicative est de haut niveau.

## 2. Monitoring & 3. Alerting
**Verdict : NON CONFIGURÉ**
Bien que les données existent dans Firestore et Cloud Logging, **aucune alerte automatisée n'a été configurée** (ex: via Terraform ou Google Cloud Monitoring). L'équipe SRE est aveugle si un pic d'erreurs survient.
**Actions Requises :** Créer des alertes pour :
- Nombre d'exceptions "System Error" dans Cloud Logging > 0.
- Jobs en état `RUNNING` avec un `updatedAt` > 15 minutes.

## 4. Exploitation
**Verdict : SUPPOSÉ (Basique)**
- **Comprendre un échec / Retrouver un élève :** L'opérateur peut lire le tableau `permanentFailures` directement dans la console Firestore.
- **Relancer / Annuler :** Il n'existe pas de bouton ou de script d'administration (CLI) packagé pour relancer un job proprement. L'opérateur doit manipuler Firestore à la main (risque d'erreur humaine).

## 5. Journalisation (Transitions)
**Verdict : PROUVÉ**
Chaque étape métier vitale grave un statut immuable (PENDING, VALIDATING, RUNNING, SUCCESS, PARTIAL_SUCCESS, FAILED) accompagné de timestamps (`startedAt`, `finishedAt`, `quotaReconciledAt`). La traçabilité asynchrone est parfaite.

## 6. Runbooks
**Verdict : NON CONFIGURÉ**
Aucune documentation d'exploitation (Runbooks) n'a été rédigée pour le support de niveau N1/N2 (ex: "Que faire si un job est bloqué en RUNNING ?", "Comment interpréter l'erreur ALREADY_EXISTS ?").

## 7. Sauvegarde et Résilience
**Verdict : PROUVÉ**
Le fichier source JSON (`import_jobs_data/{schoolId}/{jobId}.json`) reste dans Cloud Storage. En cas de corruption totale de la base, l'import peut être rejoué depuis la source de vérité asynchrone (Event Sourcing primitif).

## 8. Scalabilité
**Verdict : PROUVÉ**
Le moteur repose sur `BulkWriter` (limitation de taux automatique) et l'isolement multi-tenant (transactions bloquées sur `schoolId` uniquement). L'architecture supporte mathématiquement des imports parallèles sur des écoles distinctes sans contention globale (aucun index partagé mutable).

## 9. Sécurité Opérationnelle
**Verdict : PROUVÉ**
Les logs dans Cloud Logging ne fuient aucune donnée personnelle sensible (PII), uniquement des IDs (JobId, SchoolId, Erreurs de parsing génériques). Le principe du moindre privilège peut être appliqué via un Service Account dédié, bien qu'il utilise actuellement les droits par défaut de Firebase Admin.

---

# TABLEAU D'ÉVALUATION ORR

| Domaine       | Verdict | Action Requise |
| ------------- | ------- | ------ |
| Observabilité | PROUVÉ  | Aucune (Excellent) |
| Monitoring    | NON CONFIGURÉ | Configurer des métriques Cloud Monitoring basées sur les logs |
| Alerting      | NON CONFIGURÉ | Configurer des alertes (Slack/Email) sur les erreurs système |
| Exploitation  | SUPPOSÉ | Développer des scripts d'administration (CLI/UI) pour l'équipe Support |
| Logs          | PROUVÉ  | Aucune |
| Runbooks      | NON CONFIGURÉ | Rédiger les Playbooks N1/N2 |
| Sauvegarde    | PROUVÉ  | Aucune (Fichiers immuables sur GCS) |
| Scalabilité   | PROUVÉ  | Aucune |
| Sécurité Ops  | PROUVÉ  | Aucune |

---

# 10. Dette Opérationnelle Critique (Blockers)
1. **Absence de Sweeper automatisé** : Les jobs bloqués nécessitent aujourd'hui une intervention manuelle dans Firestore.
2. **Absence d'Alerting** : Si le système tombe, personne ne sera réveillé.
3. **Absence de Runbooks** : Le support ne saura pas comment traiter les incidents.

---

# VERDICT FINAL

L'ingénierie logicielle est prête et mathématiquement solide, mais l'ingénierie d'exploitation (SRE) n'est pas encore amorcée. Déployer ce code en production aujourd'hui obligerait l'équipe de développement à agir comme équipe de support à temps plein (Tier 1).

**NOT READY**
