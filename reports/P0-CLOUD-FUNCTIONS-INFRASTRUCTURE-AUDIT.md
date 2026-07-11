# P0-CLOUD-FUNCTIONS-INFRASTRUCTURE-AUDIT

## Diagnostic racine
Le problème central n'est pas lié au code métier, mais à une **désynchronisation des permissions IAM du pipeline de déploiement (Cloud Build) sur Google Cloud**.
Lors d'un déploiement (`firebase deploy`), Firebase CLI zippe le code et l'uploade dans un bucket de stockage Google Cloud (`gcf-sources-411364288790-us-central1`). Ensuite, Cloud Build tente de télécharger ce zip pour le compiler.
L'erreur formelle :
`Access to bucket gcf-sources-411364288790-us-central1 denied`
indique que le compte de service utilisé par le système de build n'a plus le droit de lire ce bucket. Cela survient généralement lorsque les permissions par défaut (le rôle `Editeur`) du **Compute Engine Default Service Account** ont été révoquées pour des raisons de sécurité, sans pour autant lui réattribuer les accès explicites minimaux nécessaires au build.

## Niveau de risque
**CRITIQUE (Bloquant pour les déploiements)**.
L'application en elle-même (Frontend + Base de données + Auth) ne crashe pas. Cependant, le backend (Cloud Functions) est figé dans le temps. Il est impossible de mettre à jour ou de corriger les API.

## Fonctions impactées
**Toutes les fonctions.**
Le problème intervient au niveau du *Cloud Build* (la compilation du code source), et non lors de l'exécution individuelle.
Fonctions listées dans le projet (bloquées au déploiement) :
- `createSaaSCheckout`
- `campayWebhook`
- `verifySaaSPayment`
- `dailySubscriptionCheck`
- `initiatePayment`

## Services impactés
- **Firebase Deploy CLI** : Échoue systématiquement sur l'étape `functions`.
- **Cloud Build** : Ne peut pas télécharger le code source.
- **Google Cloud Storage** : Le bucket `gcf-sources-*` refuse l'accès au compte de service.

## Rôles IAM & Comptes de Service
1. **Cloud Functions Gen1 (Runtime)** : Utilise typiquement l'App Engine Default Service Account (`ecoscolaire-staging@appspot.gserviceaccount.com`). *Non impacté ici.*
2. **Cloud Build (Builder)** : Historiquement pour GCF, Cloud Build peut utiliser le Compute Engine Default Service Account :
   `411364288790-compute@developer.gserviceaccount.com`
3. **Rôles Requis** : Pour télécharger le code source du bucket, le compte `411364288790-compute@developer.gserviceaccount.com` doit posséder au minimum le rôle **Storage Object Viewer** (Consultant des objets de l'espace de stockage) sur le bucket `gcf-sources-411364288790-us-central1`, ou le rôle **Administrateur de l'espace de stockage** (`roles/storage.admin`) sur le projet.
4. **Rôle Manquant** : `roles/storage.objectViewer` pour le compte Compute Engine sur le bucket `gcf-sources`.

## Correctifs IAM précis à appliquer
Vous devez accorder le rôle d'affichage du stockage au compte de service Compute Engine.

**Méthode Console GCP :**
1. Allez dans **IAM et administration > IAM** sur Google Cloud Console.
2. Trouvez le compte principal : `411364288790-compute@developer.gserviceaccount.com`.
3. Cliquez sur le crayon (Modifier le principal).
4. Cliquez sur **Ajouter un autre rôle**.
5. Cherchez et sélectionnez **Administrateur de l'espace de stockage** (Storage Admin) ou au minimum **Lecteur des objets en espace de stockage** (Storage Object Viewer).
6. Sauvegardez.

## Commandes gcloud correspondantes
Si un terminal avec les droits d'administration de projet est disponible, exécutez la commande suivante pour attribuer le rôle au niveau du projet :
```bash
gcloud projects add-iam-policy-binding ecoscolaire-staging \
    --member="serviceAccount:411364288790-compute@developer.gserviceaccount.com" \
    --role="roles/storage.admin"
```
*Note : Assigner `roles/storage.admin` au niveau projet est la pratique classique Firebase pour résoudre ce problème.*

## GO / NO GO pour poursuivre Mobile Money
**NO GO.**
Impossible de tester un déploiement Mobile Money (si un correctif est requis dans la fonction `initiatePayment`) tant que le pipeline de compilation Cloud Functions est cassé. Les fonctions actuellement déployées continuent de tourner, mais toute modification est impossible.

## GO / NO GO pour poursuivre le développement EcoScolaire
**GO PARTIEL.**
Le développement Frontend, Firestore, Storage et Authentication peut continuer sans le moindre problème. Seules les tâches nécessitant une mise à jour d'une Cloud Function (comme l'intégration de nouveaux webhooks ou d'API complexes) sont bloquées.
