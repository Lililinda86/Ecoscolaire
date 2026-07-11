# Checklist Pré-Déploiement C3-C (Blaze, IAM, Secrets)

Ce document détaille les opérations strictement manuelles à réaliser par l'administrateur système sur Google Cloud Console et Firebase Console avant toute tentative de déploiement automatisé des Cloud Functions.

### 1. Checklist activation Blaze sécurisée
- [ ] Se connecter à la [Firebase Console](https://console.firebase.google.com/).
- [ ] Sélectionner le projet `ecoscolaire-c5861`.
- [ ] Dans le menu latéral (en bas à gauche), cliquer sur **Mettre à niveau** (Upgrade).
- [ ] Sélectionner le forfait **Blaze (Pay-as-you-go)**.
- [ ] Associer un **Compte de facturation** (Billing Account) valide avec une carte bancaire.
- [ ] Valider l'activation.

### 2. Budget alert Google Cloud recommandé
Dès l'activation de la facturation, il est vital de configurer une alerte pour éviter toute mauvaise surprise.
- [ ] Se rendre sur la [Google Cloud Console - Billing](https://console.cloud.google.com/billing).
- [ ] Aller dans **Budgets et alertes** (Budgets & alerts).
- [ ] Créer un budget :
  - **Nom** : `Alerte Securite EcoScolaire`
  - **Montant cible** : `10 €` (ou `10 $`)
  - **Actions** : Cocher l'envoi d'e-mails aux administrateurs de la facturation aux seuils de 50%, 90% et 100%.

### 3. Liste IAM minimale exacte
Pour que le pipeline GitHub Actions fonctionne de manière autonome via Workload Identity Federation, le Service Account utilisé (ex: `github-actions-sa@ecoscolaire-c5861.iam.gserviceaccount.com`) doit avoir les rôles suivants :
- [ ] `roles/cloudfunctions.admin` (Administrateur de Cloud Functions) : Pour créer et mettre à jour les fonctions.
- [ ] `roles/iam.serviceAccountUser` (Utilisateur de compte de service) : Pour permettre à la fonction de s'exécuter avec le compte de service par défaut d'App Engine ou de Compute Engine.
- [ ] `roles/cloudscheduler.admin` (Administrateur Cloud Scheduler) : Pour déployer la tâche Cron `dailySubscriptionCheck`.

*(À configurer dans [Google Cloud Console - IAM](https://console.cloud.google.com/iam-admin/iam))*

### 4. Liste des secrets nécessaires (Cloud Secret Manager)
Actuellement, les fonctions sont mockées (stubs). Néanmoins, pour la future implémentation réelle de Campay, les secrets suivants devront être configurés via la CLI Firebase (`firebase functions:secrets:set <SECRET_NAME>`) :
- `CAMPAY_API_KEY`
- `CAMPAY_API_SECRET`
- `CAMPAY_WEBHOOK_SECRET` (pour la validation des signatures entrantes)

### 5. Risques de facturation
- **Boucles infinies (Infinite Loops)** : Même si le code actuel ne contient pas de triggers Firestore (qui sont les causes les plus fréquentes de boucles), une erreur dans un appel récursif ou une planification peut consommer du quota.
- **Attaques par déni de service (DDoS)** : L'endpoint HTTP public `campayWebhook` peut être spammé. Google Cloud absorbe cela dans la limite des 2 millions de requêtes gratuites/mois, mais un trafic extrême pourrait générer des coûts marginaux.

### 6. Risques de sécurité
- **Fuite de secrets** : Les clés API de paiement (Campay) ne doivent jamais être écrites en dur dans le code ou les variables d'environnement simples. Elles doivent obligatoirement utiliser Firebase Secret Manager.
- **Appels non autorisés** : Le webhook (`campayWebhook`) est public. Il nécessitera absolument de vérifier la signature (hash) envoyée par Campay pour éviter qu'un pirate ne valide de fausses transactions. (Les fonctions Callables vérifient déjà l'authentification `context.auth`).

### 7. Ordre manuel des actions dans Google Cloud Console
Pour éviter tout conflit lors du déploiement, voici l'ordre strict des manipulations :
1. **Facturation** : Activer le Plan Blaze sur Firebase.
2. **Alertes** : Créer l'alerte budget (10€) dans GCP Billing.
3. **IAM** : Ajouter les 3 rôles manquants au Service Account sur GCP IAM.
4. **Validation CI** : Revenir sur GitHub et lancer le workflow de déploiement (quand nous l'aurons activé).

### 8. Recommandation finale
**NO GO** (pour le déploiement C3).

**Action requise :** Le déploiement doit rester suspendu. Cette checklist vous est confiée pour exécution manuelle. Je reste en attente de votre confirmation (ex: *"Checklist C3-C terminée"*) avant d'écrire le moindre workflow de déploiement Functions ou de toucher au code pour implémenter Campay.
