# Revue primaire owner — rapport de livraison

État : LIVRÉ SUR STAGING — recette exacte 34899381349 PASS le 14 septembre 2026.

STAGING SHA: ce419539999a569399be9c1ecd016d32a9fda5ae
STAGING URL: https://ecoscolaire-kojvhw4u1-linda-lemofouet-s-projects.vercel.app/#/pedagogy/program
PR: https://github.com/Lililinda86/Ecoscolaire/pull/246 — fusionnée

## Produit

Étape 1 : douze niveaux primaires, sources et justification, sélection explicite
et approbation groupée confirmée par le callable de décisions existant.
Étape 2 : 76 correspondances sûres regroupées par classe, sélection par classe
ou matière ; récapitulatif chiffré, annulation et confirmation. Les anciennes
propositions ne comptent pas comme décisions.
Étape 3 : 44 ambiguïtés uniquement ; lien avec candidat explicite, conservation
distincte, non applicable ou report. Justification et confirmation individuelles.
Le report ne compte pas comme résolution. Aucun classement du moteur modifié.

Les versions courantes du niveau et du mapping doivent être approuvées pour
afficher MAPPING VALIDÉ. Aucune matière n'est déclarée enseignée.
Versions documentaires et de mapping, révisions, auteur/date serveur, historique,
audit ; garde contre décisions concurrentes, idempotence des mêmes décisions.
Les détails techniques sont repliés ; les 34 dossiers antérieurs restent accessibles.

## Compteurs ITALO observés, lecture seule 21:40 UTC le 14 septembre 2026

LEVEL REVIEW: available 12 / approved 0 / pending 12
SAFE SUBJECT MAPPINGS: available 76 / approved 0 / pending 76
AMBIGUOUS: available 44 / resolved 0 / pending 44
PRESCHOOL: unchanged — huit niveaux, réserves préservées, hors groupée
SECONDARY: unchanged — 95 mappings partiels préparés, aucune application

## Preuves

Gate candidat 34380833094 PASS : 137 fichiers / 844 tests unitaires, serveur,
règles Firestore/Storage, A/B/C/D, trois étapes navigateur et responsive 360/768/1440.
Contrôles standard PR et secret guard PASS.
Premier gate 34380352967 FAIL avant exécution navigateur : import CommonJS corrigé
dans le test uniquement ; assertions et code métier inchangés par le correctif.
Déploiement 34381513388 tentative 2 PASS. Première tentative arrêtée au dernier
service de veille : Failed to list functions. Revue matières et veille vérifiées
ACTIVE, lecture de liste ensuite réussie sans changement IAM ; relance du seul
job échoué sur le même SHA, succès. Aucun code modifié pour cette relance.
Recette exacte 34899381349 PASS dès sa première tentative sur ce SHA : 137 fichiers /
844 tests unitaires, fonctions, règles Firestore/Storage, A/B/C/D, revue primaire
et ressources. Reçu frontend vérifié à 21:39 UTC, PRIMARY_OWNER_LIVE PASS à 21:41 UTC.
La lecture CI ITALO à 21:41 confirme également 0 décision documentaire sur les
34 niveaux. Aucune décision réelle n'a été enregistrée par l'agent.

- [Déploiement Staging, tentative 2 PASS](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34381513388/attempts/2)
- [Gate et recette exacte PASS](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34899381349)
- Revue primaire : 12/76/44, zéro présélection, confirmation groupée, report puis
  lien individuel synthétique, historique/audit, propriétaire uniquement,
  secrétaire en lecture, multi-tenant, responsive 360/768/1440 PASS.
- Nettoyage vérifié de curriculum-review-2f6314a15516cbd6, y compris historiques
  de décisions de matières et comptes synthétiques.
- Cinq nettoyages pedagogy-results vérifiés : 76b61ec3cf4f99c3, c329cc689946daf7,
  2f357defbb50a8a7, baafe6f9e8069ac7, e9f5d578f37e0619.
- Lot B Staging : final cleanup verified à 21:47 UTC. Aucun nettoyage restant.

AUTOMATIC HUMAN DECISIONS: 0
OPENAI CALLS: 0
PRODUCTION TOUCHED: NO
READY FOR OWNER PRIMARY REVIEW: YES
READY FOR PRODUCTION AUTHORIZATION: NO

Guide : [Revue propriétaire en trois étapes](https://github.com/Lililinda86/Ecoscolaire/blob/ce419539999a569399be9c1ecd016d32a9fda5ae/docs/pedagogy-content-completion/OWNER_PRIMARY_REVIEW_GUIDE.md).
Seules les fixtures synthétiques autorisées sont utilisées par les tests.
Aucune affectation enseignant, horaire, coefficient, adoption ou donnée réelle
d'élève/finance créée ou modifiée. Aucun changement de protection Vercel.

Point d'arrêt : revue humaine dans la nouvelle Preview, Pédagogie → Programme →
Validation du référentiel. L'ancienne Preview hegxiowix ne contient pas cette
livraison. Utiliser l'accès Vercel autorisé puis le compte owner habituel.
Checkpoint documentaire local uniquement ; aucun nouveau déploiement requis.
