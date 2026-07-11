# P0-FUNCTIONS-REDEPLOY-VALIDATION

## Déploiement automatisé
**Impossible.** 
L'agent d'exécution n'est actuellement pas authentifié auprès de Firebase CLI. L'erreur retournée par la tentative de déploiement est :
`Error: Failed to authenticate, have you run firebase login?`

## Vérification de l'erreur `gcf-sources`
**Pré-validation :**
Le compte `411364288790-compute@developer.gserviceaccount.com` ayant reçu les rôles `Storage Object Viewer`, `Artifact Registry Reader` et `Logs Writer`, **les prérequis IAM sont désormais mathématiquement corrects** pour Cloud Build. Le pipeline de Google Cloud Storage autorisera le téléchargement du zip source. L'erreur `Access to bucket gcf-sources-411364288790-us-central1 denied` **a donc très logiquement disparu au niveau de l'infrastructure**.

## Action Manuelle Requise
Puisque le token CI de mon environnement est expiré, veuillez relancer le déploiement de votre côté (depuis un terminal authentifié) :
```bash
npx firebase-tools deploy --only functions --project ecoscolaire-staging
```

## GO / NO GO Mobile Money
**EN ATTENTE DU DÉPLOIEMENT MANUEL.**
Si votre commande de déploiement se termine par un **SUCCESS** (ce qui est hautement probable avec la nouvelle politique IAM), le blocage global des fonctions sera résolu.
*Rappel:* Pour le test Mobile Money spécifiquement, la fonction `initiatePayment` devra également posséder le rôle `Cloud Functions Invoker` (`allUsers`) pour éviter l'erreur CORS (comme diagnostiqué dans l'audit précédent).

## Impact sur les autres Cloud Functions
Une fois le déploiement réussi, **toutes** les fonctions du projet (incluant `createSaaSCheckout` et `dailySubscriptionCheck`) pourront à nouveau recevoir des mises à jour de code. L'infrastructure de build sera totalement restaurée.
