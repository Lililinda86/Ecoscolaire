# État réel du projet
- **Git** : Branche `main` synchronisée avec origin. Dernier commit `fdbd363` (préparation Node 20 pour Functions). Aucun fichier source non commité (seuls les rapports locaux de tests ont bougé).
- **Build** : `npm run build` réussit systématiquement. Temps de compilation ~11s. *Warning de Vite sur la taille des chunks (dû à `jspdf` et `html2canvas`).*
- **Tests (Playwright)** : Sur les 27 tests E2E couvrant toute l'application :
  - **Résultat CI (GitHub Actions)** : 27/27 **PASS**.
  - **Résultat Local** : 26/27 **PASS**. (1 échec sporadique / flake sur `audit-logs.spec.ts` dû à un timeout d'affichage UI de 5s).
- **Firebase** : `Auth`, `Firestore` et `Storage` sont pleinement configurés, déployés et sécurisés par les rules. Les `Functions` sont codées et prêtes au déploiement, mais physiquement absentes du Cloud pour le moment.

# Fonctionnalités terminées
- **Authentification** (Firebase Auth, connexion par rôle)
- **Super Admin** (Supervision globale, accès root bloqué pour les utilisateurs standards)
- **Gestion écoles** (Isolation totale Multi-tenant via `schoolId`)
- **Élèves** (CRUD, affectation classe, historique d'audit)
- **Classes** (CRUD, attribution prof principal)
- **Notes** (Encodage par matière)
- **Bulletins** (Génération PDF complexe via jsPDF/html2canvas)
- **Présences** (Pointage journalier)
- **Personnel** (Multi-rôles : Directeur, Secrétaire, Comptable, Prof, Chauffeur)
- **Bus** (Flotte de transport et mapping chauffeur)
- **Paiements** (Caisse, frais de scolarité, reçus PDF imprimables)
- **Dépenses** (Suivi financier interne)
- **Validation Requests** (Workflows d'approbation pour la suppression des notes/élèves)
- **Audit Logs** (Traçabilité immuable des actions sensibles)
- **Branding École** (Paramétrage et logo dynamique stocké dans Firebase Storage)
- **Portail Parent** (Filtrage stricte : un parent ne voit que son propre enfant)

# Fonctionnalités partielles
- **Cloud Functions** : Base de code structurée (TypeScript, Node 20), build OK, dépendances OK. Déploiement bloqué volontairement.
- **SaaS Billing** : Le mur de paiement (Paywall) est implémenté dans le Frontend (`/saas`), mais les fonctions de webhook et de paiement associées sont des stubs/mocks.
- **Inventaire** : L'interface est en place, mais nécessite potentiellement une consolidation selon les flux logistiques avancés de l'école.

# Fonctionnalités manquantes
- **Mobile Money (Campay)** : Vraie connexion API backend manquante.
- **WhatsApp** : Interface de communication présente, mais l'envoi réel de messages via API n'est pas codé.
- **IA Directeur** : Dashboard existant mais statique (Mock sans LLM).
- **IA Enseignant** : Assistant existant mais statique (Mock sans LLM).

# Dette technique
- **Taille du Bundle (Frontend)** : Les librairies PDF sont trop lourdes. Un code-splitting (Dynamic Imports) est urgent pour accélérer le chargement initial de l'application sur réseau 3G.
- **Test Flakiness** : Le test des logs d'audit manque de tolérance (timeout strict). À stabiliser.
- **Gen 1 Cloud Functions** : Les fonctions sont écrites en v1. C'est fonctionnel, mais Google recommande la v2 (Cloud Run) pour les nouveaux projets.

# Risques
- **Coûts DDoS / Webhooks** : L'endpoint public de paiement (une fois déployé) doit être protégé contre l'envoi de requêtes massives.
- **Données de Test vs Prod** : Le script de seeding actuel écrase et recrée des documents. Séparer de toute urgence les environnements (Projet Firebase de Staging vs Projet de Prod) avant d'accueillir des vrais clients.

# Recommandation CTO
**🟢 EXCELLENT ÉTAT DE SANTÉ. GO POUR FINALISER L'INFRASTRUCTURE.**
Le socle (Frontend + Firestore + Sécurité) est extrêmement solide et robuste. L'isolation des données multi-écoles fonctionne à 100%. L'urgence absolue n'est plus l'ajout d'écrans React, mais le **désenclavement backend** : nous devons activer le déploiement Cloud Functions pour enfin brancher la vraie logique de paiement Mobile Money.

# Roadmap priorisée
1. **Activer la Facturation & IAM (C3)** : Débloquer le déploiement Cloud Functions.
2. **Implémentation Mobile Money (Campay)** : Remplacer les stubs par l'API réelle.
3. **Automatisation SaaS Billing** : Activer le Cron Job de suspension automatique des écoles non payantes.
4. **Environnement Staging (QA)** : Créer un projet Firebase `ecoscolaire-staging` dédié à la CI.
5. **Code-Splitting Frontend** : Isoler jsPDF/html2canvas pour alléger le site.
6. **Intégration WhatsApp API** : Notification des absences/paiements aux parents.
7. **Intégration IA Directeur** : Insights générés par LLM.
8. **Intégration IA Enseignant** : Création de cours générés par LLM.
9. **Migration Functions Gen 2** : Mise à jour technique de la syntaxe backend.
10. **Lancement Pilote** : Onboarding des 2 premières écoles clientes réelles.
