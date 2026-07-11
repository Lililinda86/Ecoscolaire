# Documentation Technique : Infrastructure Backend SaaS Billing

## Contexte
Cette documentation décrit la Phase 1 de l'infrastructure Backend pour la gestion des abonnements SaaS d'EcoScolaire. Le système est conçu de façon *Backend-First* pour garantir la sécurité et l'intégrité des paiements et des statuts d'abonnement.

## Architecture

Le code backend se trouve dans le répertoire `/functions` et utilise **Firebase Cloud Functions** (Node.js 22, TypeScript).

L'architecture s'articule autour de 4 fonctions principales :

1.  **`createSaaSCheckout` (Callable)** : 
    Point d'entrée sécurisé pour le frontend. Vérifie l'identité de l'utilisateur, crée une facture `SaaSInvoice` en base de données avec le statut `pending` et initie (dans le futur) la requête vers l'API Campay.
2.  **`campayWebhook` (HTTP)** :
    Reçoit les notifications asynchrones de Campay. Valide cryptographiquement la source, identifie la facture correspondante et met à jour les privilèges d'accès de l'école (`subscriptionStatus` et `subscriptionEndDate`) via l'Admin SDK (outrepassant les règles de sécurité Firestore du client).
3.  **`verifySaaSPayment` (Callable)** :
    Fonction de secours (Polling) permettant au frontend de forcer la vérification d'un paiement si le Webhook a été perdu ou retardé.
4.  **`dailySubscriptionCheck` (Pub/Sub Cron)** :
    Tâche planifiée exécutée tous les jours à minuit. Vérifie si des abonnements ont expiré (`endDate < aujourd'hui`) et les suspend automatiquement pour bloquer l'accès à la plateforme.

## État Actuel (Phase 1)
> [!WARNING]
> - Les Cloud Functions ont été initialisées **structurellement** uniquement.
> - Les dépendances (`node_modules`) **ne sont pas installées localement**.
> - Le build des functions est **non validé** en raison de l'absence des dépendances.
> - Le déploiement des functions est **non prêt** et échouera en l'état.

## Modèles de Données

Les modèles TypeScript partagés sont stockés dans `functions/src/models/billing.ts` :
-   **`SaaSInvoice`** : Représente une facture ou tentative de paiement.
-   **`SubscriptionPlanConfig`** : Configuration des tarifs et limites par plan.

## Déploiement

Le déploiement se fait via la CLI Firebase :
```bash
cd functions
npm run build
firebase deploy --only functions
```

*(Actuellement en Phase 1 : Les fonctions sont des "stubs" vides sans intégration réelle de clé API).*
