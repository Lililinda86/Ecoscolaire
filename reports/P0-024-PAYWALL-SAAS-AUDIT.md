# P0-024-PAYWALL-SAAS-AUDIT

## Audit Firestore

**Ce qui existe déjà (dans `src/types/index.ts`) :**
- Collection `schools` avec des champs SaaS basiques : `subscriptionPlan` ('starter' | 'standard' | 'premium'), `subscriptionStatus` ('trial' | 'active' | 'suspended' | 'expired'), `subscriptionStartDate`, `subscriptionEndDate`.
- Collection `users` (relation utilisateur <-> école).
- Collections `students`, `payments` (pour la scolarité), `validation_requests`.

**Ce qui manque :**
- Les statuts actuels dans les types TypeScript ne correspondent pas tout à fait au nouveau besoin (`trial`/`expired` au lieu de `PAST_DUE`/`CANCELLED`).
- Absence de `studentLimit` direct dans le document `school` (bien qu'il puisse être déduit du plan).
- Absence de `subscriptionRenewalDate` (actuellement on a `subscriptionEndDate` et `nextPaymentDate`).
- Il manque une sous-collection ou collection racine `subscriptions_history` ou `saas_invoices` pour garder l'historique des paiements de l'école (à ne pas confondre avec la collection `payments` qui concerne les frais de scolarité des parents).

## Modèle de données recommandé

Mise à jour requise du modèle `School` :

```typescript
export type SaasPlan = 'STARTER' | 'STANDARD' | 'PREMIUM';
export type SaasStatus = 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';

// Dans l'interface School :
school.subscriptionPlan: SaasPlan;
school.subscriptionStatus: SaasStatus;
school.subscriptionRenewalDate: string; // ISO 8601
school.studentLimit: number | null; // null pour PREMIUM (illimité)
```

## Limites par plan

- **STARTER (50 000 FCFA/mois)** : 
  - `studentLimit` = 200
  - Tarif fixe.
- **STANDARD (100 000 FCFA/mois)** : 
  - `studentLimit` = 1000
  - Tarif fixe.
- **PREMIUM (200 000 FCFA/mois)** : 
  - `studentLimit` = null (Illimité)
  - Tarif fixe.

## Modules bloqués

Lorsque `subscriptionStatus === 'SUSPENDED'` ou lors du dépassement de la limite `studentLimit` :

1. **Ajout élève** : Bloqué (Bouton "Ajouter" grisé avec infobulle SaaS).
2. **Ajout personnel** : Bloqué (Bouton "Ajouter" grisé).
3. **Notes** : Saisie de notes bloquée.
4. **Paiements scolarité** : Enregistrement de nouveaux paiements impossible.
5. **Bulletins** : Génération et impression bloquées.
6. **Portail Parent** : Accès global bloqué pour les parents ("Le portail de votre école est temporairement indisponible").
7. **WhatsApp** : Bouton de relance désactivé.

*(Note : La lecture des données, comme la liste des élèves, reste possible pour permettre à l'école de faire le point, mais aucune mutation n'est autorisée).*

## Écrans impactés

- **Dashboard** : Bannière rouge "Abonnement suspendu" ou "Facture en retard".
- **Schools (SuperAdmin)** : Gestion des abonnements, forçage des statuts.
- **Settings (Directeur/Owner)** : Nouvel onglet "Abonnement & Facturation" pour voir le plan, les factures et payer.
- **Students** : Vérification de la limite `studentLimit` à la création.
- **Payments** : Blocage du formulaire d'encaissement.
- **ParentPortal** : Middleware de blocage global si école suspendue.
- **Users** : Vérification avant création d'un membre du personnel.

## Audit Cloud Functions

Aucune fonction n'est implémentée pour l'instant. Fonctions requises :
1. **`checkSubscriptionStatus` (Cron Job quotidien)** :
   - Parcourt toutes les écoles.
   - Si `subscriptionRenewalDate` dépassé de 1 jour -> passe en `PAST_DUE`.
   - Si dépassé de 7 jours (délai de grâce) -> passe en `SUSPENDED`.
2. **`createSaasPayment` (HTTP Callable)** :
   - Initialise un paiement Campay/Stripe pour le renouvellement du SaaS (abonnement de l'école).
3. **`saasPaymentWebhook` (HTTP Callback)** :
   - Reçoit la confirmation de paiement Campay.
   - Prolonge `subscriptionRenewalDate` de 30 jours (ou 1 mois).
   - Repasse le statut à `ACTIVE`.
4. **`enforceStudentLimit` (Firestore Trigger `onCreate` sur `students`)** :
   - Bloque la création au niveau backend si le nombre d'élèves de l'école dépasse `studentLimit`.

## Risques

- **Paiements externes (Cash/Virement)** : Le système actuel nécessite que le SuperAdmin puisse valider manuellement un paiement SaaS si l'école paie en espèces ou par virement bancaire.
- **Cache côté client** : Si l'abonnement expire à minuit, un client connecté doit recevoir la mise à jour (nécessite d'écouter les changements du document `school` en temps réel, ce qui est déjà le cas via `useAppContext`).
- **Dépassement par import Excel** : L'importation de masse des élèves doit vérifier si `countActuel + nouveauxEleves > studentLimit` avant d'accepter l'import, sinon l'école peut contourner la limite.

## Plan d'implémentation

1. **Phase 1 : Data Model & SuperAdmin**
   - Màj des types TypeScript (`SaasPlan`, `SaasStatus`).
   - UI SuperAdmin pour modifier le plan d'une école, définir les limites et le statut.
2. **Phase 2 : Paywall Frontend (Enforcement)**
   - Implémentation du blocage UI global si `SUSPENDED` (middleware route et disable buttons).
   - Blocage à la création d'élève si la limite est atteinte.
3. **Phase 3 : Espace Facturation École**
   - Onglet "Abonnement" dans les paramètres de l'école.
4. **Phase 4 : Backend & Cloud Functions**
   - Règles de sécurité Firestore (`allow create: if count < studentLimit`).
   - Webhook Campay de renouvellement (Phase future selon stratégie de facturation automatique).

## Estimation
- Modifications Frontend (Blocages, Bannière, Settings) : 1 à 2 jours.
- Implémentation Cloud Functions (Cron + Backend check) : 1 à 2 jours.
- Espace SuperAdmin & Gestion manuelle : 1 jour.
- **Total estimé : 3 à 5 jours selon le niveau d'automatisation des paiements.**
