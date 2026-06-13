# Rapport C3-B

## État actuel
- **Dossier `functions/`** : L'environnement Node.js 20 est sain, le fichier `package-lock.json` est en place, la compilation `tsc` s'exécute sans erreurs (validé en étape C3-A).
- **Fonctions définies** : 4 fonctions de 1ère génération (v1) sont prêtes :
  1. `createSaaSCheckout` (HTTPS Callable)
  2. `campayWebhook` (HTTP Request)
  3. `verifySaaSPayment` (HTTPS Callable)
  4. `dailySubscriptionCheck` (Cron Job planifié via Pub/Sub)
- **CI/CD Actuelle** : Le fichier `.github/workflows/firebase-deploy.yml` déploie uniquement `firestore`. Il ne procède à aucune installation de dépendances dans le dossier `functions/` et omet l'argument `functions` de la commande Firebase.

## Risques
- **Variable d'Environnement** : Les fonctions liées à Campay risquent d'échouer au runtime si les clés API Campay ne sont pas configurées via le Secret Manager de GCP ou la configuration Firebase (`firebase functions:secrets:set`).
- **Déploiement Incomplet** : Si le compte de service n'a pas les droits pour Cloud Scheduler, la fonction `dailySubscriptionCheck` bloquera tout le déploiement.

## Blocages
Il n'y a pas de blocage au niveau du code. Les seuls blocages possibles sont infrastructurels côté Google Cloud :
1. Plan Firebase (Blaze) non activé.
2. Permissions IAM manquantes sur le Service Account `github-actions-sa`.

## Coûts
- **Plan requis** : Blaze (Pay-as-you-go).
- **Tarification** : Cloud Functions offre un quota gratuit très large (2 millions d'invocations/mois, 400 000 Go-secondes de calcul, 5 Go de sortie réseau).
- **Cloud Scheduler** : Gratuit pour 3 tâches/mois (nous n'en avons qu'une).
- **Coût prévisionnel** : **0 FCFA / 0$** en phase d'audit et de test.

## Permissions IAM nécessaires
Pour que GitHub Actions puisse déployer ces fonctions en utilisant Workload Identity Federation, le compte de service (`github-actions-sa`) **doit obligatoirement** posséder ces 3 rôles :
1. `Cloud Functions Admin` (ou `Cloud Functions Developer`)
2. `Service Account User` (pour attacher le compte d'exécution aux fonctions)
3. `Cloud Scheduler Admin` (obligatoire en raison de la fonction planifiée `dailySubscriptionCheck`)

## Vérifications à effectuer (par l'Admin)
1. **Google Cloud Console** : Vérifier qu'une carte bancaire est bien attachée au projet (Plan Blaze).
2. **IAM Console** : Vérifier que le compte de service `github-actions-sa` possède bien les 3 rôles cités ci-dessus.
3. **Secrets Firebase** : Récupérer les identifiants Campay (`CAMPAY_API_KEY`, etc.) pour les injecter plus tard dans les fonctions.

## Recommandation finale
**NO GO** (Temporaire).

**Justification** : Le code est prêt, mais un déploiement aveugle depuis la CI échouera si l'infrastructure GCP (Blaze + Scheduler Admin) n'a pas été explicitement configurée par l'administrateur du projet. Une fois les "Vérifications à effectuer" validées de votre côté, le statut passera en GO.
