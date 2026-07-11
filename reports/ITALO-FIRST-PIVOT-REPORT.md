# PROJET ECOSCOLAIRE — PIVOT ITALO-FIRST : RAPPORT D'AUDIT ET ROADMAP

## 1. Diagnostic de l'état actuel
L'application dispose actuellement d'une base SaaS multi-tenant solide et fonctionnelle. L'architecture supporte la séparation par école (`schoolId`), les rôles granulaires (`owner`, `director`, `secretary`, `parent`, etc.), et la gestion asynchrone des données via Firebase/Firestore. 
Cependant, pour gérer les **inscriptions réelles 2026-2027 du Groupe Scolaire ITALO**, l'approche générique actuelle manque de spécificité métier sur le flux d'inscription :
- **Absence de statut d'élève** : Impossible de distinguer formellement un "Ancien" d'un "Nouvel" élève dans le modèle de données.
- **Frais d'inscription vs Pension** : Le modèle agrège les paiements, mais ne distingue pas explicitement l'acte isolé du "paiement de l'inscription" qui valide l'intégration de l'élève.
- **UX de masse** : Le formulaire d'ajout d'élève est conçu pour de la gestion classique, mais pas encore optimisé pour la saisie à la chaîne ("data entry") caractéristique d'une période d'inscription scolaire.

## 2. État de préparation des modules

### Prêt pour usage réel
- **Auth / Rôles** : Parfaitement opérationnel, sécurisé, et testé (E2E validés).
- **Parent Portal** : L'invitation, l'onboarding et l'interface de suivi parent sont prêts.
- **Classes** : Gestion des classes et des sections (Francophone/Anglophone) opérationnelle.

### Presque prêt
- **Transport / Buses** : Le module existe (bus, chauffeurs), mais la liaison avec la tarification par quartier lors de l'inscription doit être finalisée.
- **Exports (Excel/CSV)** : Import/Export existant mais nécessite d'intégrer les nouveaux champs spécifiques aux inscriptions (statut, frais d'inscription payés).
- **WhatsApp Relances** : Présent nativement dans le tableau des paiements via des liens `wa.me`, mais mériterait un filtrage "inscriptions non finalisées".

### Incomplet (Nécessite développement)
- **Students (Inscriptions)** : Le formulaire doit devenir un véritable tunnel d'inscription (Statut, Année, Frais d'inscription).
- **Payments / Receipts** : Doit gérer le reçu spécifique "Frais d'inscription" indépendamment de la 1ère tranche de pension.
- **Paramètres école (ITALO)** : Configuration en dur ou via UI des tarifs 2026-2027 officiels d'ITALO (pensions par classe, frais d'inscription, tarifs de transport).

### À reporter (SaaS)
- L'onboarding autonome d'une nouvelle école (SuperAdmin créant une nouvelle école à la volée). Pour l'instant, on se concentre sur le tenant ITALO.
- Tableaux de bord multi-écoles croisés.

## 3. Risques identifiés
- **Régression de l'architecture SaaS** : Le plus grand risque est de "hardcoder" les règles ITALO partout et de casser le multi-tenant. **Atténuation** : Toute configuration ITALO (tarifs, tranches) doit être stockée dans le document `School` de Firestore (ou `Settings`), même si on pré-remplit manuellement la base pour ITALO.
- **Lourdeur de saisie** : Si l'inscription nécessite trop de clics, les secrétaires seront bloquées. **Atténuation** : Optimiser le formulaire `Students.tsx` pour l'ergonomie (navigation clavier, validation rapide).

## 4. Roadmap ITALO-first (MVP Inscriptions)

- **ITALO-1** : Audit modules réels inscriptions *(Présent rapport — **TERMINE**)*
- **ITALO-2** : Paramètres école ITALO 2026–2027 (Configuration des tarifs d'inscription, de pension et de transport).
- **ITALO-3** : Formulaire inscription complet (Ajout statut ancien/nouveau, champs d'inscription dans le modèle `Student`).
- **ITALO-4** : Paiement inscription + reçu (Flux de caisse spécifique pour l'inscription).
- **ITALO-5** : Pension / tranches / reste à payer (Mise à jour des calculs de solde).
- **ITALO-6** : Transport / quartier / tarif (Liaison élève -> quartier -> tarif transport).
- **ITALO-7** : Export liste inscriptions (Ajustement du CSV/Excel).
- **ITALO-8** : Relances WhatsApp (Filtres spécifiques Inscriptions/Tranche 1).
- **ITALO-9** : Dashboard direction ITALO (Suivi financier et effectif des inscriptions).
- **ITALO-10** : Déploiement production ITALO (Go-live avec vraies données).

## 5. Premier ticket recommandé à exécuter

**Nom du ticket** : `ITALO-3 — Formulaire inscription complet (Modèle Élève)`
*(Nous sautons techniquement le ITALO-2 qui peut être une simple configuration de base, pour attaquer la valeur métier la plus urgente : pouvoir saisir un dossier d'inscription complet avec son statut).*

- **Objectif** : Mettre à jour le type `Student` et le formulaire `Students.tsx` pour inclure les données fondamentales de la campagne d'inscription sans casser la base SaaS.
- **Ajouts prévus** : 
  - `status: 'nouveau' | 'ancien'`
  - `enrollmentYear: '2026-2027'` (ou équivalent)
  - `registrationFee: number`
- **Fichiers concernés** : 
  - `src/types/index.ts`
  - `src/pages/Students.tsx`
- **Tests à prévoir** : 
  - Modification de `tests/students-crud.spec.ts` pour s'assurer de la bonne sauvegarde et relecture des nouveaux champs (idempotence garantie).

## 6. Décision finale
**READY FOR EXECUTION**. 
L'audit est terminé. Le périmètre ITALO-first est clair, isole les risques, et s'appuie sur la fondation SaaS existante sans la corrompre. En attente de l'instruction de l'utilisateur pour ouvrir officiellement le ticket **ITALO-3**.
