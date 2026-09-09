# Audit avant correctif — 9 septembre 2026

Base HEAD/Staging : 9eb7fbdec84386f7f0d58433a9463d29d25b8f38.
Staging : https://ecoscolaire-6jv4fszgj-linda-lemofouet-s-projects.vercel.app
Preuve réelle existante : run 34308767140, mêmes SHA frontend/backend, nettoyage zéro.

## 1. Existe et fonctionne

Établissement (champs, logo, sauvegarde selon rôle), cycles/classes et matières (gestion centralisée accessible), calendrier académique, tarifs par classe inscription/T1/T2/T3, transport PK enregistré 4000/5000 et secondaire gratuit, catalogue versionné et publication ciblée, facultatif avec affectation explicite, Encaissement partiel/multi-frais/reçu/avantage/moratoire/annulation et idempotence. Source Settings.tsx, SchoolFeeCatalog.tsx et fonctions financières ; unités, intégration et smoke existants. Les captures ne sont pas utilisées pour déduire une absence.

## 2. Existe mais fonctionne mal

Aucun défaut métier reproduit dans les scénarios financiers du run existant. Échéances : le frontend lit academicYears[activeAcademicYearId].tuitionPaymentDeadlines ; aucune valeur par défaut à écrire. La base synthétique possède T1/T2/T3. Compléter la comparaison base/DOM et le rechargement avant de conclure à un problème de chargement.

## 3. Existe mais est mal présenté

Documents & reçus et Rôles & validations sont des paragraphes informatifs dans Paramètres, sans accès local aux écrans existants /payments, /users, /validations. Ajouter les accès, sans recréer ces fonctions ni changer leurs droits. Matières et classes disposent déjà de boutons réels ; les préserver.

## 4. Manque réellement

Il manque les accès directs ci-dessus, ainsi que des assertions de smoke précises : secondaire seul, primaire seul, choix effectif de chacun des types (et non simple présence des options), dates base/DOM/rechargement. Ce sont des lacunes de navigation et de preuve, pas des fonctionnalités financières absentes.

## Limites et préservation

Types cérémonie/autre tenue, kit/culture/autre activité partagent volontairement une catégorie serveur ; le libellé précis est conservé. Périodicité déclarative, nouvelle échéance publiée explicitement. Les frais sont liés à l’année active affichée. Désactivation remplace la suppression destructive. Les obligations sont matérialisées à la lecture du compte, avec snapshots stables. Les classes francophones sont normalisées à l’affichage ; Nursery 2 reste distinct. Aucune clé ni classe recréée.

Aucune écriture d’échéance existante, aucune donnée réelle utilisée comme fixture, aucune migration, aucune opération Production. Compléter les contrôles sur fixtures isolées puis nettoyer. Les résultats du nouveau smoke seront consignés séparément avec son SHA exact.
