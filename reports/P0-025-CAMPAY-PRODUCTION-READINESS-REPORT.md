# P0-025-CAMPAY-PRODUCTION-READINESS-REPORT

## Architecture
Le flux d'initiation et de traitement de paiement Mobile Money est architecturé de manière asynchrone autour de Cloud Functions et de déclencheurs Firestore (Triggers). Cette approche assure la séparation des préoccupations (création de transactions, confirmation asynchrone via webhook, et génération de reçus en cascade). Bien que l'architecture soit saine, son implémentation actuelle est strictement bridée.

## Secrets
- **Campay Username & Password** : Lus de manière sécurisée depuis la sous-collection protégée `schools/{schoolId}/secrets/payment`.
- **Campay App ID & App Secret** : L'API Campay utilise traditionnellement l'URL `/api/token/` avec un username et password, ce qui est correctement implémenté.
- **Statut** : PARTIELLEMENT VALIDÉ (Le mécanisme de lecture sécurisé existe, mais les clés de production réelles n'y sont pas provisionnées, et le backend ne sait pas encore traiter un mode autre que `sandbox`).

## Environnements
- **Sandbox** : Fonctionnel et configuré.
- **Production** : **ABSENT**. Le fichier `functions/src/services/campayService.ts` a l'URL de sandbox codée en dur :
  `this.baseUrl = isSandbox ? CAMPAY_BASE_URL_SANDBOX : CAMPAY_BASE_URL_SANDBOX; // Force sandbox for now`.
- **Statut** : NON VALIDÉ. Le backend ne possède physiquement pas l'URL pour contacter les serveurs de production Campay.

## Functions
- **initiatePayment** : Bloquée délibérément sur l'environnement de test. La condition `if (secrets.campayEnvironment === 'sandbox')` est le seul chemin possible pour déclencher l'API Campay. Tout autre mode (ex: `production`) déclenche un fallback automatique vers le mode `MOCK`.
- **campayWebhook** : Fonctionnelle au niveau transactionnel (gestion d'idempotence et de journalisation).
- **mockConfirmPayment / onPaymentCreated** : 100% Fonctionnelles.
- **Statut** : NON VALIDÉ (La fonction d'initiation interdit les requêtes de production).

## Firestore
- **transactions, payments, receipts, campay_logs** : Tous les modèles de données sont correctement structurés, générés en cascade avec isolation par école, et historisés pour l'audit.
- **Statut** : VALIDÉ.

## Webhook & Sécurité
- **URL publique & Accessibilité** : La fonction `campayWebhook` est déployée et accessible via HTTP.
- **Sécurité et Signature** : **ABSENT**. La fonction lit actuellement `req.body` de façon aveugle, sans vérifier l'authenticité de la source. Il n'y a aucune validation de signature (par exemple via l'en-tête `X-Campay-Signature` vérifié avec une clé secrète Webhook).
- **Statut** : NON VALIDÉ. C'est une faille de sécurité bloquante. N'importe qui possédant l'URL du webhook peut envoyer un faux payload `SUCCESS` avec une référence aléatoire et déverrouiller un compte scolaire.

## Checklist Go Live
1. **Intégration URL de Production Campay** : NON VALIDÉ.
2. **Autorisation du mode Production dans `initiatePayment`** : NON VALIDÉ.
3. **Sécurisation du Webhook (Vérification Signature)** : NON VALIDÉ.
4. **Provisionnement des clés Live dans Firestore** : NON VALIDÉ.
5. **Robustesse Idempotence Firestore** : VALIDÉ.

## Test réel recommandé
Une fois la production activée (corrections de code effectuées), le test "Go Live" devra s'effectuer selon ce protocole strict :
* **Montant** : 100 FCFA (montant minimum technique)
* **Compte test** : Compte Parent ou Owner de test (`owner@test.com`)
* **Téléphone** : Un numéro MTN ou Orange Mobile Money Cameroun réel (avec au moins 100 FCFA de solde).
* **École** : École pilote déployée en base Staging/Prod.
* **Élève** : Élève factice rattaché à cette école.
* **Données à surveiller de bout en bout** :
  1. Affichage effectif du prompt USSD sur le téléphone physique.
  2. Vérification par le Webhook sécurisé que la signature correspond bien au payload (Signature Check).
  3. Réception du statut `SUCCESS` réel via le Webhook.
  4. Création immédiate des documents `payments` et `receipts` en base.
  5. Déblocage du système (levée des dettes / compteur SaaS ajusté si facture d'abonnement).

## Risques
- **Piratage d'abonnement / Fausse facturation** : Mettre en ligne en l'état entraînerait la possibilité d'injecter de fausses transactions payées du fait de l'absence de vérification de signature Webhook.
- **Échec technique** : L'incapacité actuelle du système à brancher l'URL Campay live empêche tout paiement réel.

## Verdict
**NOT READY**

*L'implémentation doit être débloquée (ajout de l'URL de prod + vérification de signature du Webhook) avant d'envisager le moindre test de transaction en argent réel.*
