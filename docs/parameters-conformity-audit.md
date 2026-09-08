# Audit de conformité avant correction

Référence inspectée : 6df4766fee3eddd6d0ba70689a76ae563d8e9b5a (Staging). Aucun changement produit avant cette matrice.
Les captures réelles du même déploiement, artefact all-fees-responsive-staging / exécution 34233096344, complètent la lecture du code. Elles ne prouvent pas les parcours absents du scénario. Le navigateur intégré est techniquement indisponible ; la validation finale utilisera une session Playwright authentifiée avec données isolées sur Staging.

| Exigence | État initial | Preuve code et comportement Staging de référence |
|---|---|---|
| Administration visible / découvrable | PARTIEL | Settings.tsx : accordéons fermés ; navigation Finances pointe sous SchoolFeeCatalog. Capture settings : création sous deux niveaux, pas de bouton par groupe. |
| Conservation établissement, agréments, contacts, logo, sécurité, politiques, documents | CONFORME | Settings.tsx conserve champs et sauvegardes ; smoke navigue vers chaque section. |
| Conservation gestion classes / matières | PARTIEL | Liens Classes et programme présents ; ancien texte prétend affectations matières dans Classes, sans action correspondante. Contrôler le parcours central, corriger le guidage. |
| Créer / publier frais (direction, propriétaire) | CONFORME | SchoolFeeCatalog form + manageSchoolFee create ; publication UI attestée sur Staging. |
| Modifier tous les attributs / archiver | PARTIEL | revise ne modifie que amount ; archive disponible seulement schéma 2 ; pas de bouton Modifier sur chaque ligne. |
| RBAC | CONFORME | authorize refuse secrétaire en écriture et école étrangère ; UI secrétaire sans actions sensibles, direction peut publier. |
| T1/T2/T3 configurables | CONFORME | TuitionDeadlineSettings, academicYears.tuitionPaymentDeadlines ; affichage Staging et tests dédiés. |
| Tarifs scolaires liés aux classes | CONFORME | Settings classFees indexé sur c.name réel ; moteur conserve clés historiques ; révision prospective contrôlée. |
| Transport cycles / 4000 et 5000 | PARTIEL | transportPaymentPolicy applique 4000/5000 sans pkRates, secondaire gratuit ; FinancialSettingsReadOnly passe undefined à formatCurrency et affiche / mois seul. Captures avec rates explicites ne couvrent pas ce défaut. |
| Toutes catégories du catalogue | CONFORME | 14 catégories serveur et groupes UI ; visibles sur captures Staging. |
| Métadonnées complètes des frais | PARTIEL | Création complète, ligne catalogue ne montre pas description/périmètre/périodicité ; édition absente. |
| Types et libellés personnalisés réutilisables | PARTIEL | Types fixes + saisie libre ; aucun choix réutilisable des libellés personnalisés déjà publiés. |
| Gestion catalogue historique | NON CONFORME | Liste isolée sans chemin de gestion ni explication de compatibilité. |
| Cycle → classes → élèves / multi-sélection | CONFORME | feeTargeting partagé + fieldsets ; Staging vérifie Primaire/CP/3 élèves et exclusions cycles. |
| Sélection individuelle publiée | PARTIEL | Unitaire couvre sélection et purge ; smoke publie sans sélection individuelle puis affecte par API, pas preuve bout en bout. |
| PS/MS/GS et équivalents configurés | PARTIEL | classCatalog normalise anciens noms, filtres actifs/année ; tests unitaires PS/MS/GS/Nursery2, fixture Staging générique Maternelle. Ajouter preuve UI sur noms configurés. |
| Doublons remplacés exclus | CONFORME | Classes inactives exclues, noms Maternelle1/2/3 normalisés, IDs dédupliqués ; ne fusionne pas arbitrairement deux vraies classes. |
| Publication → Encaissement des seuls ciblés | PARTIEL | Moteur lit automatiquement frais obligatoires ; smoke nouvelle publication facultative + affectation API, pas parcours UI complet. |
| Paiements total / partiel / multi-frais | CONFORME | secretaryCollections et StudentAccountCollection ; smoke transaction multi-frais API et paiement partiel UI existant. Refaire pour le frais nouvellement créé. |
| Snapshots établis figés / historique préservé | CONFORME | studentFeeAssignments et obligations : lecture snapshot prioritaire ; tests révision, archive, reçu inchangé, avantage, moratoire. Aucun accès Production. |
| États vides et chargement | NON CONFORME | fees=[] au chargement affiche Aucun tarif configuré avant réponse ; aucun CTA local. |
| Responsive | PARTIEL | Captures 360/768/1440 sans débordement, mais ne démontrent pas le CRUD complet ni la découvrabilité. |
| Cleanup / orphelins / écritures inattendues | PARTIEL | Suppression fixtures + 0 résidus vérifiée ; renforcer le contrôle de non-écriture financière du catalogue/consultation et les assertions d’historique. |

Cette matrice remplace les conclusions trop générales du précédent audit. Les états finaux nécessitent les corrections et une nouvelle validation du SHA effectivement déployé.
