# P0-MOBILE-MONEY-009D-INVOKER-ALTERNATIVE-AUDIT

## Type exact de fonction
**Cloud Functions Gen1.**
Le code source utilise l'import standard V1 (`import * as functions from 'firebase-functions'`), et non la V2 (`firebase-functions/v2/https`). Les fonctions Gen1 s'exécutent sur l'ancienne architecture d'exécution GCF (bien qu'elles soient progressivement conteneurisées).

## IAM actuel
L'accès public (`allUsers`) est refusé. La fonction est restreinte aux comptes de service et administrateurs du projet GCP.

## Pourquoi allUsers est refusé
Ce refus n'est pas un bug de Firebase, mais une **Règle d'Administration (Organization Policy)** imposée par votre organisation Google Workspace ou Cloud Identity. 
La règle spécifique s'appelle **"Partage limité aux domaines" (Domain Restricted Sharing)** ou **"Interdire l'accès public"**.
Tant que cette règle est active sur le projet, il est *impossible* d'assigner `allUsers` ou `allAuthenticatedUsers` à n'importe quelle ressource (Storage, Functions, Cloud Run), ce qui bloque par conception les applications publiques.

## Cause CORS la plus probable
Étant donné que l'accès IAM public est interdit par l'organisation, le Load Balancer de Google Cloud intercepte la requête du navigateur (le Preflight `OPTIONS`), constate que l'appelant n'est pas authentifié au niveau de l'infrastructure Google (les tokens *Firebase Auth* ne sont pas reconnus par IAM GCP), et rejette la requête en bloquant les headers CORS.

## Correction recommandée
Une "Firebase Callable Function" (`onCall`) **doit obligatoirement être publique au niveau IAM** car la véritable authentification se fait *à l'intérieur du code* via le SDK Firebase (`context.auth`). 
L'alternative consistant à passer par des rewrites Firebase Hosting est complexe pour les Callables. La solution officielle et pérenne est d'**exempter ce projet spécifique de la règle d'organisation**.

## Méthode manuelle console
Vous devez être Administrateur de l'Organisation (ou demander à la personne gérant le Google Workspace/GCP) :
1. Allez sur [Google Cloud Console > IAM & Admin > Organization Policies](https://console.cloud.google.com/iam-admin/orgpolicies?project=ecoscolaire-staging).
2. Recherchez la contrainte **"Domain restricted sharing"** (Partage limité aux domaines) ou **"Require IAM allow public access"**.
3. Cliquez dessus, puis choisissez **Manage Policy** (Gérer la stratégie).
4. Sous "Policy Source", choisissez **Override parent's policy** (Remplacer la stratégie parente).
5. Définissez la règle sur **Off** ou **Allow All** (Autoriser).
6. Sauvegardez.
7. *Ensuite seulement*, retournez dans l'onglet IAM de Cloud Functions et ajoutez `allUsers` -> `Cloud Functions Invoker`.

## Méthode CLI si possible
Si vous avez le rôle administrateur de l'organisation :
```bash
# Remplacer la politique d'org pour autoriser l'accès public
gcloud org-policies reset constraints/iam.allowedPolicyMemberDomains --project=ecoscolaire-staging

# Puis appliquer l'IAM
gcloud functions add-iam-policy-binding initiatePayment \
  --project=ecoscolaire-staging \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/cloudfunctions.invoker"
```
*(Attention: `gcloud` n'est pas installé sur la machine locale actuelle).*

## GO / NO GO correction
**NO GO CLAIR.**
Je ne peux ni outrepasser une Organization Policy Google Cloud, ni utiliser `gcloud`. Cette limitation d'infrastructure entreprise nécessite l'action manuelle d'un administrateur Cloud sur la console. Une fois la politique relâchée et `allUsers` assigné, le test Mobile Money passera immédiatement au vert.
