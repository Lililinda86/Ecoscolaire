# P0-021B-WEBHOOK-DRYRUN-EVIDENCE-REPORT

### PREUVES
- **Appel HTTP** : L'exécution du script `POST` avec le payload `{"external_reference": "dry-run-prod-test"}` sur l'URL `https://us-central1-ecoscolaire-c5861.cloudfunctions.net/campayWebhook` a bien été reçue et a retourné une réponse HTTP 200 avec le texte `OK`.
- **ID du document** : NON VÉRIFIABLE
- **timestamp** : NON VÉRIFIABLE
- **contenu enregistré** : NON VÉRIFIABLE
- **statut enregistré** : NON VÉRIFIABLE
*(L'accès en lecture à la collection `campay_logs` de production est bloqué par défaut sur le projet `ecoscolaire-c5861`. En l'absence de Firebase Admin SDK / compte de service configuré localement pour la production, il est techniquement impossible d'extraire la preuve cryptographique ou visuelle de la création du document).*

### OBSERVATIONS
- L'analyse stricte du code source actuellement déployé (`functions/src/index.ts`) démontre la logique métier suivante pour ce payload précis :
  1. Le payload fourni `{"external_reference": "dry-run-prod-test"}` omet le champ obligatoire `reference`.
  2. La condition `if (!external_reference || !reference)` est déclenchée.
  3. Le système est codé pour écrire dans la collection `campay_logs` un document contenant `requestType: 'webhook_aborted'` avec la raison `Missing external_reference or reference in payload`.
  4. La fonction renvoie HTTP 200 `OK` et utilise l'instruction `return;`, stoppant net l'exécution.
- La fonction `campayWebhook` **n'écrit PAS** dans `transactions`, `payments` ni `receipts` suite à la réception de ce payload partiel.

### RISQUES
- **Visibilité Opérationnelle (Boîte Noire)** : L'impossibilité d'accéder aux journaux Firestore de production (`campay_logs`) depuis l'environnement de développement limite drastiquement la capacité d'auditer de façon indépendante et de prouver formellement le comportement asynchrone des fonctions Cloud. Seul un administrateur ayant accès à la console GCP/Firebase peut extraire les logs exacts.

### VERDICT
PREUVE INSUFFISANTE
