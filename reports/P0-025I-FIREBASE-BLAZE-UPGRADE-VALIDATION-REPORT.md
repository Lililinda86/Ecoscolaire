# P0-025I-FIREBASE-BLAZE-UPGRADE-VALIDATION-REPORT

## Blaze Plan
**STATUT : NON VALIDÉ (ÉCHEC)**
Le déploiement Firebase échoue instantanément (en 2 secondes). Ce délai très court est caractéristique du refus immédiat de l'API de déploiement, confirmant que le projet `ecoscolaire-c5861` **n'est pas encore sous le plan Blaze** ou que la carte bancaire a été refusée/n'est pas correctement rattachée au compte de facturation GCP du projet.

## Deploy Firebase
**STATUT : ÉCHEC**
Le workflow GitHub Actions `Deploy Firebase` a été relancé avec succès (via le commit de déclenchement `54ca931`). Cependant, le job a échoué à l'étape "Deploy Firebase Rules and Functions".

## Functions
**STATUT : NON DÉPLOYÉES**
Les fonctions `initiatePayment`, `campayWebhook` et `onPaymentCreated` n'ont pas été transférées vers la production en raison du blocage lié au plan de facturation.

## APIs
**STATUT : NON ACTIVÉES**
Le blocage tarifaire empêche l'activation automatique des API nécessaires par le Firebase CLI :
- `cloudfunctions.googleapis.com` : Refusé (nécessite Blaze).
- `cloudbuild.googleapis.com` : Refusé (nécessite Blaze).
- `artifactregistry.googleapis.com` : Refusé (nécessite Blaze).

## Dry Run
**STATUT : ÉCHEC**
La requête de test vers l'URL du webhook de production retourne :
- **Erreur HTTP** : `404 Not Found`.
- Aucun log n'est créé dans Firestore.

## Verdict
NOT READY

*(Raison : Le passage au plan Blaze n'est pas effectif sur le projet GCP/Firebase. Vous devez vous connecter à la Console Firebase, accéder aux paramètres de facturation ("Upgrade"), saisir/sélectionner un compte de facturation valide, puis activer manuellement l'API Cloud Functions si nécessaire, avant de pouvoir retenter le déploiement.)*
