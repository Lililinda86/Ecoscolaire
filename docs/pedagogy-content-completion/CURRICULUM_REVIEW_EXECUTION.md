# Mise en revue des 34 propositions

## Point d’arrêt atteint

Les cinq blocs sont terminés. Déploiement Staging et gate exact 34366188898 PASS sur d1f7c854ddfc855dc377bf40ef6aebf570b69dfb. Lecture ITALO : 34/12/22, 18 sources insuffisantes, 0 décision enregistrée, 34 en attente. Fixtures de recette nettoyées et vérifiées. Rapport : CURRICULUM_REVIEW_DELIVERY.md. Prochaine action : revue humaine dans Programme → Validation du référentiel ; aucune relance technique ni opération Production à effectuer.

Le journal ci-dessous conserve les étapes intermédiaires, y compris les incidents diagnostiqués puis corrigés.

Périmètre : correspondances documentaires, distinctes de l’adoption d’un programme. Source : OWNER_CURRICULUM_PROPOSALS.md au checkpoint 85c980c. Aucun nouveau travail de recherche, aucune décision réelle, aucun appel OpenAI, aucune opération Production.

## Blocs et preuves à compléter

1. Manifeste déterministe de 34 propositions, sourceVersion et mappingVersion calculées ; conservation des limites documentaires.
2. Callable owner uniquement, transactions atomiques, concurrence, historique immuable et audit ; lecture tenant strictement cloisonnée.
3. Programme > Validation du référentiel : six groupes, synthèse, aucune présélection, confirmation groupée limitée aux 12 correspondances fortes.
4. Tests unitaires, règles et émulateurs Linux, navigateur synthétique 360/768/1440. Aucun résultat non exécuté ne sera marqué PASS.
5. PR staging, CI, merge normal, déploiement et recette sur SHA exact ; guide propriétaire et rapport final.

État initial : branche codex/pedagogy-content-completion ; HEAD 85c980c ; origin/staging 99c2daacd8ead63c9337456ea72c81bfe4f822b5 après fetch. Worktree dédié existant, propre. Préserver les modifications des autres worktrees.

Décisions humaines enregistrées par cette mission : 0. Les tests utiliseront uniquement des établissements synthétiques isolés avec nettoyage exact.

## Contrôles exécutés avant livraison

- PR : https://github.com/Lililinda86/Ecoscolaire/pull/242 — fusion normale le 9 septembre 2026, après tous les checks PASS et vérification de l’absence de modification concurrente de staging.
- SHA fusionné : d1f7c854ddfc855dc377bf40ef6aebf570b69dfb.
- Gate Pédagogie PASS sur le dernier commit de PR 70e1042a973e376075be3d656f18e1b5f5010cd8 : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34363849180.
- Régression locale complète : 134 fichiers / 825 tests PASS. Types frontend/Functions, build, lint ciblé et Secret Guard PASS.
- Nouveau backend : propriétaire authentifiée, droits relus dans la transaction, version périmée rejetée, lot atomique, idempotence, historique immuable, audit et cloisonnement PASS sur émulateurs Linux.
- Nouveau navigateur : 34/12/22, six groupes, aucune présélection, décisions individuelles/groupées, audit, versions, lecture secrétaire, tenant étranger exclu et 360/768/1440 PASS sur émulateurs Linux. Fixture curriculum-review-66ccd8ee88ad25a6 nettoyée et absence vérifiée.
- Régressions Linux conservées : règles Firestore, Storage, impression A4, Lots A/B/C et cinq contextes de suivi/remédiation PASS.
- Déploiement du SHA fusionné en cours : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34364587150. Recette Staging exacte encore à exécuter ; ne pas confondre avec le PASS émulateur.

Mise à jour déploiement : PASS, création du callable confirmée à 14:42 UTC, statut ACTIVE à 14:47 UTC. Preview attestée par le déploiement GitHub 6352258759 : https://ecoscolaire-hegxiowix-linda-lemofouet-s-projects.vercel.app (SHA d1f7c854ddfc855dc377bf40ef6aebf570b69dfb).

Recette exacte lancée : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34366188898. Le lancement direct de pedagogy-staging-validation.yml répond 404 car le workflow n’est pas enregistré sur la branche par défaut. Utiliser le gate existant, sans modifier main :

`gh workflow run pedagogy-release-gate.yml --ref staging -f expected_sha=d1f7c854ddfc855dc377bf40ef6aebf570b69dfb -f app_url=https://ecoscolaire-hegxiowix-linda-lemofouet-s-projects.vercel.app -f confirmation=RUN_PEDAGOGY_STAGING_SYNTHETIC`

Pour une reprise, lire d’abord l’état du run 34366188898 : ne pas relancer une recette déjà en cours et ne pas répéter ses fixtures.

## Incidents résolus

Le premier build dépassait la limite PWA : page Programme chargée à la demande, sans augmenter la limite. Le premier test navigateur attendait un libellé implicite de select : aria-label rendu explicite, actions bornées à 15 secondes et phase d’erreur tracée. Le test suivant passe ; aucun contournement de permissions.

L’approbation groupée demeure limitée aux 12 propositions fortes. Quatre équivalences préscolaires documentées peuvent être examinées individuellement ; les 18 dossiers à source insuffisante restent non approuvables. Aucun choix humain n’a été fabriqué.
