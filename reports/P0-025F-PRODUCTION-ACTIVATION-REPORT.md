# P0-025F-PRODUCTION-ACTIVATION-REPORT

## Workflow
**STATUT : PRÊT**
Le fichier `.github/workflows/firebase-deploy.yml` a été mis à jour avec succès :
- `workflow_dispatch` : Actif (déclenchement manuel sécurisé).
- Build functions : Actif (`npm ci && npm run build` dans le dossier `functions`).
- Déploiement ciblé : Restreint à `firestore,functions:initiatePayment,functions:campayWebhook,functions:onPaymentCreated`.

## IAM
**STATUT : EN ATTENTE DE VÉRIFICATION**
*Blocage d'accès* : L'environnement d'exécution de l'agent ne possède pas les identifiants locaux (`gcloud auth`) pour lister les rôles IAM du projet `ecoscolaire-c5861`. Une vérification manuelle dans Google Cloud Console est requise pour certifier que le compte de service (`App Engine default service account`) possède bien le rôle `Datastore User` (ou éditeur Firestore) pour enregistrer le paiement, et que le Scheduler a les bons droits d'exécution.

## Secrets
**STATUT : NON PROVISIONNÉS**
L'accès direct à la base de données de production étant scellé, les secrets `campayAppUsername`, `campayAppPassword` et `campayEnvironment` (fixé à `"production"`) doivent être créés manuellement par un administrateur dans la collection `schools/{school_test_id}/secrets/payment`.

## Functions
**STATUT : NON DÉPLOYÉES**
Les fonctions `initiatePayment`, `campayWebhook` et `onPaymentCreated` ne sont pas encore présentes en production. Le workflow de déploiement manuel ayant été sécurisé, il requiert l'intervention d'un administrateur pour cliquer sur "Run workflow" dans l'onglet Actions de GitHub.

## Campay
**STATUT : NON CONFIGURÉ**
L'URL de production `https://us-central1-ecoscolaire-c5861.cloudfunctions.net/campayWebhook` attend d'être enregistrée dans le portail développeur Campay (Live Mode).

## Dry Run
**STATUT : ÉCHEC (Attendu)**
Une requête POST de simulation a été envoyée vers l'URL du webhook de production.
- **Résultat** : Erreur HTTP `404 Not Found`.
- **Analyse** : Ce résultat est parfaitement normal à ce stade, puisqu'aucune fonction n'a été déployée manuellement par l'administrateur. Le Dry Run devra être ré-exécuté après le déploiement de l'Étape 5.

## Risks
- Lancer le test réel sans exécuter le workflow de déploiement conduira inévitablement à un paiement orphelin (404 au moment de la réception du statut).
- L'oubli de configuration des secrets ou de la sélection `campayEnvironment=production` fera échouer silencieusement la validation Server-to-Server.

## Verdict
READY WITH BLOCKERS

**(Actions manuelles requises par l'Administrateur pour lever les bloqueurs) :**
1. Créer une école/élève/parent de test sur l'application en Production.
2. Saisir les secrets dans la base de données Firestore de Production.
3. Exécuter le workflow GitHub Actions `Deploy Firebase`.
4. Renseigner l'URL du webhook dans le Dashboard Campay.
5. Autoriser l'agent à relancer le Dry Run.
