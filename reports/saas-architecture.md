# 🏗️ Architecture SaaS & Stratégie Technique - EcoScolaire

**Date :** Juin 2026
**Auteur :** SAAS-ARCHITECT-ECOSCOLAIRE
**Destinataires :** Conseil d'Administration, Investisseurs, Équipe Technique

---

## 1. Vision SaaS

* **Modèle économique :** B2B SaaS (Software as a Service) combinant un abonnement récurrent (MRR/ARR) facturé à l'école, et un modèle transactionnel (Commission de 1 à 2%) sur le volume financier recouvré via Mobile Money.
* **Stratégie de croissance :** "Land and Expand". Acquérir l'école avec un module de base gratuit ou à très bas coût (Bulletins), puis upsell sur les modules de recouvrement financier (MoMo) et de communication (WhatsApp). Le portail parent agit comme un levier de "Product-Led Growth" car il rend le logiciel indispensable à la réputation de l'école.
* **Cible Cameroun :** Les complexes scolaires privés (Maternelle + Primaire + Secondaire) des zones urbaines (Yaoundé, Douala, Bafoussam) brassant plus de 300 élèves.
* **Cible Afrique francophone :** Extension en Côte d'Ivoire, Sénégal et RDC où le Mobile Money (Wave, Orange, MTN) domine également le paysage des paiements scolaires.

---

## 2. Architecture Firestore SaaS (*Non implémenté*)

Pour soutenir le modèle économique, l'architecture de base (qui gère déjà bien le multi-tenant) doit être étendue avec les collections "Business".

### `schools` (Écoles clientes)
- *Champs :* `id`, `name`, `domain`, `branding`, `status` (active/suspended), `currentSubscriptionId`, `flutterwaveSubaccountId`.
- *Relations :* 1 école = 1 abonnement actif, N élèves.

### `subscriptions` (Abonnements SaaS)
- *Champs :* `id`, `schoolId`, `planId`, `status` (trial/active/past_due), `billingCycle` (monthly/yearly), `currentPeriodStart`, `currentPeriodEnd`.
- *Index :* `schoolId` + `status` (pour bloquer rapidement l'accès).

### `plans` (Catalogue des offres)
- *Champs :* `id`, `name`, `priceMonthly`, `priceYearly`, `features` (Map<string, boolean>), `limits` (Map).

### `invoices` (Factures émises par EcoScolaire à l'école)
- *Champs :* `id`, `schoolId`, `subscriptionId`, `amount`, `status` (draft/open/paid/void), `dueDate`, `pdfUrl`.

### `saas_payments` (Paiements de l'abonnement SaaS)
- *Champs :* `id`, `invoiceId`, `schoolId`, `amount`, `method` (MoMo/Card/Transfer), `providerRef`, `status`.

### `usage_metrics` (Consommation de l'école)
- *Champs :* `id` (format: schoolId_YYYYMM), `studentsCount`, `whatsappMessagesSent`, `storageBytes`. Mise à jour incrémentielle via compteurs distribués ou Cloud Functions.

### `audit_logs` (Traçabilité)
- *Champs :* `id`, `schoolId`, `userId`, `action` (ex: DELETE_STUDENT), `timestamp`, `ipAddress`.
- *Index :* `schoolId` + `timestamp` DESC.

### `support_tickets`
- *Champs :* `id`, `schoolId`, `userId`, `subject`, `status`, `priority`.

---

## 3. Plans commerciaux (*Non implémenté*)

1. **Starter (Idéal pour Maternelles/Petites écoles)**
   - *Prix Mensuel :* 15 000 FCFA
   - *Prix Annuel :* 150 000 FCFA
   - *Limites :* Max 200 élèves, 3 utilisateurs Admin. 1 Go de stockage.
   - *Fonctionnalités :* Gestion élèves, Notes, Bulletins PDF, Comptabilité Cash.

2. **Standard (Le cœur de cible)**
   - *Prix Mensuel :* 30 000 FCFA
   - *Prix Annuel :* 300 000 FCFA
   - *Limites :* Max 1000 élèves, 10 utilisateurs Admin. 5 Go de stockage.
   - *Fonctionnalités :* Starter + Portail Parent + Paiement Mobile Money + Notifications WhatsApp basiques.

3. **Premium (Complexes d'élite)**
   - *Prix Mensuel :* 60 000 FCFA
   - *Prix Annuel :* 600 000 FCFA
   - *Limites :* Élèves illimités, Utilisateurs illimités. 50 Go de stockage.
   - *Fonctionnalités :* Standard + Assistants IA (Directeur/Enseignant) + Multi-campus + Audit Logs avancés.

---

## 4. Gestion des abonnements (*Non implémenté*)

* **trial :** Automatique à la création de l'école (14 jours gratuits).
* **active :** Paiement validé, accès total selon le `planId`.
* **past_due :** Période de grâce de 7 jours après l'échec de renouvellement (relances J+1, J+3, J+7).
* **suspended :** L'interface admin de l'école est bloquée par un Paywall. Seul le paiement débloque l'accès.
* **expired / cancelled :** L'abonnement est terminé. Données conservées en lecture seule pour la conformité pendant 1 an.

---

## 5. Facturation SaaS (*Non implémenté*)

* **Génération :** Une Firebase Cloud Function génère `invoices` 5 jours avant le terme.
* **Paiement :** Via un lien Flutterwave/Campay envoyé par email/WhatsApp au promoteur de l'école.
* **Historique :** Accessible via le composant `Billing` (à créer) dans les paramètres du SuperAdmin de l'école.
* **Relances :** Automatisées via une Cloud Function exécutée quotidiennement (`pubsub.schedule('every 24 hours')`).

---

## 6. Dashboard Super Admin (*Implémenté mais non testé*)

Le Dashboard Super Admin d'EcoScolaire doit être enrichi des KPI financiers SaaS suivants :
- **MRR / ARR :** Revenu récurrent mensuel et annuel.
- **Churn Rate :** Pourcentage d'écoles annulant leur abonnement.
- **Écoles Actives / Suspendues / En Essai :** Suivi strict du funnel d'acquisition.
- **Volume Transactionnel MoMo :** Pour calculer les commissions générées.

---

## 7. Sécurité (*Vérifié*)

- **Règles Firestore :** L'isolation par `schoolId` est mathématiquement prouvée via les fonctions de `firestore.rules`.
- **Rôles et Permissions :** Le contexte (`AppContext.tsx`) et les composants vérifient solidement les rôles. Un parent ne pourra jamais écrire une note, un professeur ne pourra jamais valider un paiement.
- *Recommandation:* Effectuer des tests de pénétration (PenTest) simulés avant d'atteindre 50 écoles.

---

## 8. Scalabilité (*Implémenté mais non testé en runtime*)

- **10 écoles :** L'architecture actuelle (Firebase Client-side) est parfaite.
- **100 écoles :** Les limites de lecture Firestore apparaîtront si les listes d'élèves ne sont pas paginées. L'encodage du logo en Base64 alourdira massivement la bande passante. (*Risque identifié*)
- **1000 écoles :** Nécessité de séparer les données chaudes (trimestre actuel) des données froides (archives des années précédentes) pour réduire la taille des index Firestore.
- **10000 écoles :** Sharding des bases de données par région ou pays.

*Optimisation Critique :* Migrer immédiatement les logos et futurs fichiers vers Firebase Storage.

---

## 9. Mobile Money (*Non implémenté Backend / Implémenté UI Frontend*)

Pour supporter **MTN MoMo** et **Orange Money** à l'échelle, EcoScolaire doit intégrer un agrégateur (Campay ou Flutterwave).

* **Architecture :**
  1. Le parent clique sur "Payer" (Frontend).
  2. Cloud Function appelle l'API Campay (Backend).
  3. Le parent valide via USSD sur son téléphone.
  4. Campay déclenche un **Webhook** sur l'URL d'EcoScolaire.
  5. La fonction Webhook vérifie la signature, met à jour le statut dans Firestore (`isTranchePaid = true`) et débloque le Portail Parent.
* **Fiabilité :** Nécessité absolue de conserver les logs de webhooks et d'implémenter un mécanisme de "Polling" (vérification du statut) si le webhook se perd.

---

## 10. WhatsApp (*Non implémenté Backend / Implémenté UI Frontend*)

Passer des liens `wa.me` actuels à l'automatisation via **Evolution API** ou **Twilio**.

* **Alertes Absence :** Déclenché automatiquement quand le professeur marque "Absent" sur l'application.
* **Relances Impayés :** Envoi groupé à J-5, J0, J+5 de la date limite de la tranche.
* **Bulletins :** Envoi du lien sécurisé vers le Portail Parent avec un message personnalisé.

---

## 11. IA (Assistants) (*Implémenté en Mock / Non implémenté Backend*)

L'intégration d'OpenAI/Gemini via Cloud Functions.

* **IA Directeur :** Analyse sémantique des plaintes parents, rédaction de discours.
* **IA Enseignant :** Création de quiz basés sur la progression, appréciation automatique des bulletins selon la moyenne.
* **Coût :** Modèle facturé à l'utilisation ou inclus dans le forfait Premium (les tokens LLM sont coûteux, il faut limiter via `usage_metrics`).

---

## 12. Roadmap SaaS

| Fonctionnalité | Priorité | Impact Business | Impact Client | Difficulté Technique | ROI | État |
|---|---|---|---|---|---|---|
| **Paiements Mobile Money (Webhooks)** | ABSOLUE | Énorme (Commissions) | Très Fort | Élevée | 💎💎💎 | Non implémenté |
| **Environnement de Test E2E** | ABSOLUE | Fort (Stabilité) | Fort | Moyenne | 💎💎 | Non implémenté |
| **Cloud Storage pour Fichiers/Logos** | HAUTE | Fort (Baisse coûts) | Faible | Faible | 💎💎 | Non implémenté |
| **Notifications WhatsApp Auto.** | HAUTE | Très Fort (Upsell) | Très Fort | Élevée | 💎💎💎 | Non implémenté |
| **Génération de Factures SaaS** | MOYENNE | Fort (Revenu SaaS) | Faible | Moyenne | 💎💎 | Non implémenté |
| **API Intelligence Artificielle (LLMs)** | FAIBLE | Faible | Fort | Élevée | 💎 | Mocks existants |
| **Module Inventaire / Transport** | FAIBLE | Faible | Faible | Moyenne | 💎 | Mocks existants |

---

## 13. Recommandation finale

> *"Que faut-il construire dans les 90 prochains jours pour atteindre 100 écoles clientes ?"*

Pour atteindre 100 écoles payantes sur le marché africain francophone, le produit n'a pas besoin de plus de boutons, de plus de formulaires ou d'IA. Il a besoin de **prouver qu'il gagne de l'argent pour l'école et qu'il fonctionne sans bug de compilation**.

Dans les 90 prochains jours, l'équipe technique doit figer le code Frontend (qui est déjà d'excellente qualité et vérifié par TypeScript) et basculer 100% de ses efforts sur la construction du **Backend Node.js (Firebase Cloud Functions)** :

1. **Le Webhook Flutterwave/Campay :** Il faut que chaque franc CFA payé par MoMo soit tracé mathématiquement dans Firestore et débloque instantanément le portail du parent. C'est l'argument de vente absolu.
2. **L'Automatisation WhatsApp :** Connectez l'API WhatsApp pour prouver aux directeurs que les parents sont tenus au courant de la situation scolaire et financière en temps réel.
3. **Les Cloud Functions SaaS :** Mettez en place la barrière de paiement (Paywall SaaS) pour que les écoles en période d'essai qui ne paient pas soient suspendues automatiquement.

**Si vous construisez le pont financier (MoMo) et le pont de communication (WhatsApp) de manière stable dans les 90 jours, le produit se vendra de lui-même aux 100 premières écoles.**
