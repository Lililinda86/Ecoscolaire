# ECOSCOLAIRE-CURRENT-STATE-AUDIT-v2

## 1. État Git

* **Branche active** : `main`
* **Dernier commit** : `b76479a` (ci: setup java 21 for firebase emulator)
* **Derniers commits importants** :
  - `b76479a` : ci: setup java 21 for firebase emulator
  - `020e8b7` : ci: separate e2e tests and firestore rules tests
  - `0f2655d` : test(e2e): dynamically check current count and limits in live validation
  - `d342033` : fix(ci): add @firebase/rules-unit-testing
  - `20b20c3` : ci: rerun after IAM scheduler fix
  - `79b8710` : ci: rerun staging functions deployment
  - `1536b31` : ci(firebase): deploy functions to staging
  - `7559892` : feat(saas): enforce student limits at backend
  - `f4edcf3` : chore(tests): fix E2E navigation and assertions for SaaS limits
  - `1775546` : feat(saas): enforce student limits by subscription plan
  - `93089b1` : feat(security): protect SaaS fields and prevent role escalation
  - `9c31b03` : feat(saas): implement manual paywall enforcement
  - `6342725` : fix(pwa): force cache clearing on fatal synchronous top-level errors
  - `bfeff8c` : fix(firebase): prevent fatal crash on missing env vars
  - `3513b35` : feat(finance): add manual WhatsApp reminders for unpaid fees
  - `a563b09` : feat(parent): block portal access for severe tuition debt
  - `0a0c1c2` : feat(webhook): force push real campayWebhook implementation
  - `4a2851f` : feat(webhook): implémentation métier P0-021A webhook Campay
  - `e7fbbe8` : fix(momo): Add missing campayService.ts file
  - `50814ed` : fix(momo): P0-MOBILE-MONEY-020 Sandbox activation logic

## 2. État CI/CD

* **GitHub Actions** : VALIDÉ (Pipeline CI/CD complet implémenté et vert)
* **Déploiement Frontend** : VALIDÉ (Build Vite / TypeScript automatisé via `npm run build`)
* **Déploiement Rules** : VALIDÉ (Déploiement automatisé via Firebase CLI dans la CI)
* **Déploiement Functions** : VALIDÉ (Déploiement automatisé avec les Rules)
* **Staging** : VALIDÉ (Base de données et fonctions synchronisées `ecoscolaire-staging`)
* **Production** : PARTIELLEMENT VALIDÉ (Le CI actuel cible staging en priorité ; déploiement manuel ou via workflow dédié `firebase-deploy.yml` pour la prod).

## 3. État Firebase

* **Auth** : VALIDÉ (Connexion par email/mot de passe et gestion des rôles fonctionnelle)
* **Firestore** : VALIDÉ (Modèle de données relationnel plat, index créés, règles de sécurité renforcées)
* **Storage** : VALIDÉ (Stockage des reçus/logos)
* **Functions** : VALIDÉ (`campayWebhook`, `enforceStudentSaasLimits`, Cloud Functions déployées)
* **Scheduler** : VALIDÉ (`dailySubscriptionCheck` configuré, permissions IAM Cloud Scheduler accordées)

## 4. Modules VALIDÉS

* **Élèves** : VALIDÉ (Commit `7559892` / Limites SaaS respectées / Test : Playwright E2E)
* **Classes** : VALIDÉ (CRUD opérationnel / Test : Playwright E2E)
* **Présences** : VALIDÉ (Appel journalier fonctionnel / Test : Playwright E2E)
* **Notes** : VALIDÉ (Saisie des notes / Test : `grades-bulletins.spec.ts`)
* **Bulletins** : VALIDÉ (Génération PDF via jsPDF / Test : `grades-bulletins.spec.ts`)
* **Personnel** : VALIDÉ (Gestion des rôles et login testés / Test : `login-roles.spec.ts`)
* **Inventaire** : VALIDÉ (CRUD des équipements)
* **Transport** : VALIDÉ (Gestion des bus et trajets)
* **Finance** : VALIDÉ (Tableau de bord financier, suivi des encaissements / Test : E2E Dashboard)
* **Mobile Money** : VALIDÉ (Sandbox Campay + Webhook / Commit `0a0c1c2` / Testé via requêtes réelles)
* **SaaS** : VALIDÉ (Paywall, restrictions de création, sécurité backend / Commit `7559892` / Testé via rules.spec.mjs et live validation)
* **Portail Parent** : VALIDÉ (Blocage si dettes / Commit `a563b09` / Testé via E2E)
* **WhatsApp** : VALIDÉ (Envoi manuel des rappels / Commit `3513b35`)

## 5. Modules PARTIELLEMENT VALIDÉS

* **Paiements Mobile Money (Production réelle)** : L'environnement Sandbox est validé, mais le passage en credentials de production pour Campay nécessite une ultime vérification des clés secrètes. (Travail restant : Injection des clés réelles, test final réel).
* **Intelligence Artificielle (AI Teacher/Director)** : L'interface est prête (Mock), mais la connexion réelle aux API LLM (OpenAI/Gemini) nécessite l'intégration des clés backend et la facturation.

## 6. Modules NON COMMENCÉS

* **Rappels WhatsApp Automatiques (via Cron)** : Actuellement, les rappels sont déclenchés manuellement. (Priorité : P1 / Impact : Réduction du travail administratif / Effort : Moyen).
* **Application Mobile Native (PWA avancée ou React Native)** : (Priorité : P2 / Impact : Accessibilité hors-ligne étendue / Effort : Élevé).
* **Intégration Flutterwave / Orange Money direct** : Pour l'instant seul Campay est fonctionnel. (Priorité : P2).

## 7. Dette technique

* **Versions obsolètes / Incohérences** : Le SDK `firebase-admin` est présent dans les `devDependencies` du frontend. Il devrait être strictement cantonné au backend (`functions/`).
* **Firebase Functions** : Utilisation de Node 20 (Très bien, à jour).
* **Régions Firebase** : Région par défaut (us-central1). Pour des écoles en Afrique Francophone / Europe, `europe-west1` offrirait de meilleures performances et respecterait mieux les normes RGPD.
* **Sécurité** : Règles Firestore excellentes (Validées par l'émulateur).
* **Performance** : Build Vite incluant des chunks un peu larges (> 500kb). Utilisation intensive de code-splitting requise pour accélérer le FCP (First Contentful Paint) sur mobile.

## 8. Top 10 Priorités Produit

**P0 (Bloquant pour le lancement commercial) :**
1. Validation d'un paiement Mobile Money en production réelle (100 FCFA).
2. Vérification de la configuration domaine personnalisé (SSL, DNS) pour l'URL finale.

**P1 (Essentiel pour la rétention et la valeur perçue) :**
3. Automatisation des rappels WhatsApp via Cloud Scheduler (Cron).
4. Exportation massive des bulletins en un clic (ZIP/PDF).
5. Branchement réel de l'Assistant IA (Gemini/OpenAI).
6. Optimisation des performances PWA (Code Splitting).

**P2 (Améliorations SaaS) :**
7. Tableau de bord SuperAdmin consolidé (Graphiques de revenus globaux).
8. Intégration d'un second agrégateur de paiement.
9. Refonte UI/UX des formulaires complexes (Multi-step).
10. Migration potentielle des Cloud Functions vers `europe-west` ou `af-south1` (Afrique du Sud).

## 9. Roadmap MVP

* **MVP utilisable par 3 écoles pilotes** : ATTEINT. Le produit actuel couvre la gestion scolaire complète, la facturation, et la limitation SaaS. Prêt pour les tests utilisateurs réels.
* **Produit commercialisable** : Nécessite la validation des paiements Mobile Money en environnement de production (Campay Live) et l'ajout de l'automatisation des relances pour garantir le ROI des écoles.
* **SaaS prêt pour 100 écoles** : Nécessitera un monitoring avancé (Datadog/Sentry), une infrastructure Cloud résiliente (Multi-région), et un SuperAdmin Dashboard analytique robuste.

## 10. Recommandation finale

**Tâche unique la plus importante à réaliser immédiatement :**
Tester un paiement Mobile Money de bout en bout en environnement de **PRODUCTION RÉELLE** (montant de test : 100 FCFA). C'est le cœur du modèle d'affaires ; s'assurer que l'argent transite réellement et que le Webhook déverrouille le portail parent en temps réel est la priorité absolue avant d'onboarder la moindre école.
