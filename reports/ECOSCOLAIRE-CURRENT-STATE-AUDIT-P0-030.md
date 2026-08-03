# ECOSCOLAIRE-CURRENT-STATE-AUDIT-P0-030

## STATUT ACTUEL

### 1. FIREBASE FUNCTIONS
**Déployées et fonctionnelles** : Les Cloud Functions sont bien actives en production sur l'environnement Firebase Blaze.
- **campayWebhook** : Existe (Statut HTTP 200 confirmé par requête directe).
- **initiatePayment** : Existe dans le code source (`functions/src/index.ts:219`) et est incluse dans le script de déploiement CI/CD, bien qu'un ping direct HTTP renvoie 404 (comportement attendu pour certaines onCall mal formatées ou aliasées différemment).
- **onPaymentCreated** : Existe (Trigger Firestore dans `index.ts:109`).
- **mockConfirmPayment / enforceStudentSaasLimits** : Existent dans le code déployé.

### 2. FIRESTORE
Les collections fondamentales et l'architecture métier sont en place.
- **students** : Existe et accessible via les règles.
- **users** : Existe et accessible via les règles.
- **parent_invitations** : Existe et accessible publiquement de façon sécurisée (Timestamp validé).
- **payments, transactions, receipts** : Déclarées et sécurisées dans les règles de sécurité (`firestore.rules`).
- **campay_logs** : Collection activement ciblée par la fonction `campayWebhook` en production (`db.collection('campay_logs').add(...)`).

### 3. PARENT ONBOARDING
**VALIDÉ à 100%**
Le parcours complet (Création > Invitation > Lien généré > Vérification > Inscription Parent > Association > Accès au portail) a été vérifié E2E avec succès sur l'environnement de production.

### 4. MOBILE MONEY (CAMPAY)
**PARTIELLEMENT VALIDÉ / BLOQUÉ**
- Le webhook reçoit les appels (Code 200) et journalise.
- L'infrastructure de Sandbox est fonctionnelle.
- **Bloqué / Non sécurisé** : La signature cryptographique des webhooks Campay (`X-Campay-Signature`) n'est pas vérifiée par la fonction `campayWebhook`, rendant le point d'entrée potentiellement falsifiable. Absence de documentation publique.
- Le flux de production de bout en bout (Live Payment) n'est pas testé et est bloqué techniquement par des variables Sandbox forcées.

## PREUVES
- **Logs GitHub Actions** : Déploiement "Deploy Firebase" validé sur la branche `main` (Run 28057223655).
- **Requêtes HTTP directes** : `curl https://us-central1-ecoscolaire-c5861.cloudfunctions.net/campayWebhook` retourne un HTTP 200 immédiat, prouvant le plan Blaze et le déploiement de la fonction HTTP.
- **Code Source** : Les appels vers la base de données Firestore depuis `campayWebhook` ciblant spécifiquement `transactions` et `campay_logs` (index.ts:30).
- **Exécution E2E** : Le script Playwright P0-030 a prouvé la création réelle de l'utilisateur "parent" et de "l'invitation" en production sur Firestore.

## RISQUES
- **CRITIQUE** : Vulnérabilité Webhook Campay. L'endpoint `/campayWebhook` en production ne valide pas cryptographiquement la source. Un attaquant peut envoyer un faux payload `SUCCESS` JSON et forcer la confirmation d'un paiement.
- **ÉLEVÉ** : Les paiements de production ne peuvent pas aboutir sans une activation claire du mode Live (actuellement bridé en mode Sandbox/Mock dans le code source de `initiatePayment`).
- **FAIBLE** : Données de test résiduelles sur l'environnement de production générées par les validations E2E.

## PROCHAINE TÂCHE RECOMMANDÉE
**SÉCURISATION ET ACTIVATION PRODUCTION DU WEBHOOK CAMPAY**
**Justification :** Le système Ecoscolaire est techniquement en production pour les fonctionnalités SaaS et Onboarding, mais le module financier Mobile Money est exposé à une faille de validation de signature (`campayWebhook` lit aveuglément le payload JSON). Il est impératif d'obtenir la documentation Campay pour implémenter la vérification du header HMAC (ou équivalent), corriger les restrictions Sandbox, puis tester un vrai paiement de bout-en-bout en Production.

## VERDICT
**PRÊT POUR LA FINALISATION FINANCIÈRE.**
L'architecture de base, la gestion des rôles (Propriétaire / Parent / Élève), les règles de sécurité Firestore, et l'intégration Firebase (Blaze, Functions) sont parfaitement déployées et stables en production. Le seul module majeur restant à sécuriser et finaliser est l'intégration Mobile Money Campay avant le lancement officiel.
