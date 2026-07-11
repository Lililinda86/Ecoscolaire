# P0-025C-PRODUCTION-READINESS-REPORT

## Campay
- **URL API Production** : 🔴 **NON CONFIGURÉE**. L'audit du fichier `campayService.ts` révèle que l'URL est codée en dur sur `https://demo.campay.net` pour tous les environnements (ligne 7). Une modification de code est strictement nécessaire pour ajouter l'URL de production (`https://campay.net/`).
- **Credentials Production** : ⚠️ Les identifiants réels (Username/Password Campay Prod) doivent être insérés manuellement dans Firestore Production.

## Firebase
- **Cloud Functions** : 🔴 **NON DÉPLOYÉES**. L'audit du fichier de déploiement en production `.github/workflows/firebase-deploy.yml` montre que la commande actuelle est : `firebase deploy --only firestore --project ecoscolaire-c5861`. Les Cloud Functions (dont `campayWebhook`) ne sont donc pas synchronisées ni déployées en Production.

## Secrets
- ⚠️ La variable `campayEnvironment` doit impérativement être réglée sur `'production'` dans la collection secrète de l'école de test en production, une fois le code corrigé.

## Webhook
- ⚠️ L'URL de production `https://us-central1-ecoscolaire-c5861.cloudfunctions.net/campayWebhook` devra être saisie manuellement dans le tableau de bord Campay (section Développeur) une fois la fonction déployée. Actuellement, cette URL retournera une erreur 404.

## School Test
- ⚠️ Une école de test doit être explicitement créée ou identifiée dans l'environnement de Production.

## Student Test
- ⚠️ Un élève de test et un compte Parent associé doivent être créés en Production pour simuler le parcours réel du paywall SaaS.

## Risks
1. **Perte de fonds sans déblocage (Paiement orphelin)** : Si un test à 100 FCFA est lancé maintenant, le paiement sera prélevé sur le compte Mobile Money, mais Campay frappera un Webhook 404 (Cloud Function absente). La transaction restera `PENDING` dans EcoScolaire.
2. **Échec API par croisement d'environnements** : Même si la fonction était déployée, le code actuel frapperait l'API Sandbox (`demo.campay.net`) avec les identifiants de Production, déclenchant une erreur `401 Unauthorized`. Le serveur ne pourrait pas vérifier le statut.

## Go / No-Go
**Verdict** : NOT READY

**Actions correctives requises avant le test :**
1. Mettre à jour `campayService.ts` pour supporter l'URL de Production Campay.
2. Modifier `firebase-deploy.yml` pour y inclure le déploiement des `functions` vers la production.
3. Saisir les secrets Firebase et configurer le webhook Campay Production.
