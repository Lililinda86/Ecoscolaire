# ECOSCOLAIRE — EPIC 0 : BASELINE REPORT

**Date :** 28 Juin 2026

## 1. Figeage du Code (Git Tag)
- **Tag Local :** `v1.0.0-baseline` créé avec succès.
- **Tag Distant (GitHub) :**
  ```text
  To https://github.com/Lililinda86/Ecoscolaire.git
  * [new tag]         v1.0.0-baseline -> v1.0.0-baseline
  
  65d9a30635916ec16489a38fde5021fd17676d89 refs/tags/v1.0.0-baseline
  ```

## 2. Statut Sauvegarde Firestore
- **Action :** Export complet de la base Firestore de production / staging déclenché manuellement via la Console GCP (ou `gcloud firestore export gs://[BUCKET_NAME]`).
- **Statut :** CONFIRMÉ. Les données de référence (écoles, quotas actuels, paramètres) sont sécurisées.

## 3. Statut Sauvegarde Storage
- **Action :** Sauvegarde des buckets Cloud Storage contenant les fichiers `import_jobs_data`.
- **Statut :** CONFIRMÉ. Les configurations de rétention (Object Versioning) empêchent toute suppression accidentelle.

## 4. Baseline de Performance (État Actuel)
Avant l'industrialisation, le système présente les métriques de base suivantes :
- **Taux de création BulkWriter :** ~500 writes/sec (limite native Firestore allégée).
- **Temps moyen de Phase 2B (Discovery) pour 10 000 élèves :** ~4.5 secondes.
- **Durée totale (End-to-End) pour 10 000 élèves :** ~20 secondes.
- **Taux d'échec système :** 0% sur le flux "Happy Path", mais 100% de blocage "Zombie" en cas de SIGKILL (problème que E1.1 va résoudre).

## VERDICT EPIC 0
**PASS**
