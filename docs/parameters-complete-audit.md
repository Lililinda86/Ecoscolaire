# Audit Paramètres — 8 septembre 2026

Base : `origin/staging` eb6e3c6. Travail isolé ; aucune migration ni opération Production.

| Domaine | Source / consommateurs | Constat et traitement |
| --- | --- | --- |
| Établissement, noms officiels | schools ; entêtes, documents | Champs et sauvegarde conservés ; accordéon établissement. |
| Gouvernance, agréments, coordonnées, logo | schools ; reçus et documents | Champs conservés, aucune réécriture des données existantes. |
| Cycles et classes | classes ; Students, tarifs, transport, pédagogie | Ancien formulaire local créait des classes sans école/cycle. Gestion redirigée vers /classes ; collection réelle pour les sélections. |
| Nomenclature maternelle | classCatalog ; options de classes | Normalisation d’affichage PS/MS/GS, identifiants et libellés historiques stockés conservés. Résolveur serveur étendu aux noms officiels. |
| Matières | catalogue académique central | Accès conservé ; affectations gérées dans Classes. |
| Année et calendrier | schools.activeAcademicYearId, academicYears, periods | Contrôles existants conservés. Les cibles de frais excluent les années antérieures. |
| Finances et tarifs | schoolFeeCatalog, financialTariffConfiguration | Backend existant versionné conservé ; cascade, récapitulatif de publication et métadonnée ponctuel/récurrent ajoutés. |
| Catalogue | schools.feeCatalog ; studentFeeAssignments | Aucune seconde liste de classes. Cases à cocher, sélection multiple, recherche, purge des sélections devenues hors périmètre. Serveur valide école/année/activité/cycle/classe. |
| Obligations / Encaissement | studentFeeAssignments, studentFinancialObligations ; account V3 | Snapshots conservés. Obligatoire matérialisé par transaction du compte ; facultatif uniquement par affectation explicite. Récurrence déclarative : chaque échéance doit être publiée explicitement, pas de dette automatique supplémentaire. |
| Transport | fiche élève, studentPrivate, studentTransportPlans | PK et périodes configurées existants ; 4000/5000 par défaut, secondaire gratuit. Aucun recalcul des snapshots. |
| Documents et reçus | receipt, allocation et reversal snapshots | Libellé précis existant conservé de bout en bout ; PDF/historique/reversal inchangés. |
| Avantages et moratoires | financialBenefits / moteur serveur | Workflow d’approbation et échéance effective conservés. |
| Politiques | schools.transportPolicy et réglages existants | Aucun champ supprimé ; accordéon avec navigation interne. |
| Rôles, sécurité et intégrations | serveur + Firestore Rules ; secrets de paiement | Tarifs gérés par Owner/Direction, secrétaire en lecture. Secrets réservés au propriétaire par Rules. Aucun secret consulté. |

## Points de compatibilité

- `schools.classFees` reste indexé par les noms historiques pour compatibilité du moteur. Les nouvelles options viennent de `classes` ; les clés existantes ne sont ni renommées ni supprimées.
- Une classe sans isActive explicite reste active selon le résolveur legacy existant. Une classe portant une autre année explicite est exclue. Les élèves de l’année active seuls sont proposés.
- Les doublons d’identifiants sont résolus à l’affichage. Les vraies classes homonymes gardent leurs identifiants et des libellés distinctifs.
- Les anciens frais globaux de tenues et transport restent des tarifs de secours. Les types de tenues et autres frais détaillés utilisent le catalogue existant.
- Aucun changement du workflow scolaire Inscription / Scolarité / T1 T2 T3 ni du moteur d’allocation.

## Validation

Tests ajoutés : cascade multi-cycle/multi-classe, classes inactives/anciennes/étrangères, élèves inactifs/anciens/étrangers, noms officiels, recherche matricule, purge de sélection, revue avant publication, payload facultatif ; refus serveur des cycles/classes/élèves incohérents. Suites financières et Rules via émulateur CI. Smoke Staging et responsive sur fixtures isolées requis avant livraison.
