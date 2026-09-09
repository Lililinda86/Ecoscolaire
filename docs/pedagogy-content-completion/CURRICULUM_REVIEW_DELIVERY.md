# Livraison — revue propriétaire des 34 propositions

Livraison technique validée le 9 septembre 2026. Point d’arrêt atteint : Staging prêt pour les décisions de la propriétaire, pas autorisation Production.

STAGING SHA: `d1f7c854ddfc855dc377bf40ef6aebf570b69dfb`

STAGING URL: https://ecoscolaire-hegxiowix-linda-lemofouet-s-projects.vercel.app/#/pedagogy/program

PR: https://github.com/Lililinda86/Ecoscolaire/pull/242 — MERGED

CURRICULUM REVIEW UI: PASS

| Groupe | Résultat | Propositions |
|---|---|---:|
| PRIMARY FR | PASS | 6 |
| PRIMARY EN | PASS | 6 |
| PRESCHOOL FR | PASS | 4 |
| PRESCHOOL EN | PASS | 4 |
| SECONDARY FR | PASS | 7 |
| SECONDARY EN | PASS | 7 |

TOTAL PROPOSALS: 34

HIGH CONFIDENCE: 12

TO REVIEW: 22

MISSING SOURCE: 18 dossiers sans source officielle **suffisante** (dossiers partiels compris ; pas 18 absences de PDF).

## Décisions ITALO réellement observées

Lecture seule du 9 septembre 2026 à 14:56:44 UTC, dans `ecoscolaire-staging`, établissement `school-italo-official`, année `ay_school-italo-official_2026-2027_er0p`. Aucune lecture des collections utilisateurs/élèves ni consultation de Secret Manager par cette vérification ; aucune écriture ITALO.

OWNER DECISIONS RECORDED: 0

APPROVED: 0

REQUEST_CHANGE: 0

NOT_APPLICABLE: 0

PENDING: 34

Les recommandations ne sont pas des décisions. Les 12 fiches fortes sont proposées à l’approbation de correspondance seulement. Quatre équivalences préscolaires documentées nécessitent une décision individuelle explicite. Les 18 dossiers sans source suffisante ne peuvent pas être approuvés. Aucune adoption de programme, authentification de source ou validation enseignante n’est créée par la revue de correspondance.

## Résultats et preuves exécutées

GROUP APPROVAL: PASS — sélection manuelle de fiches fortes uniquement, récapitulatif, confirmation et annulation ; aucune présélection.

AUDIT: PASS — identité propriétaire authentifiée, heure serveur, note, sourceVersion, mappingVersion ; transaction atomique, révisions immuables et audit_logs.

MULTI-TENANT: PASS — refus serveur inter-écoles, règles de lecture isolées, document étranger exclu des compteurs, changement de tenant testé.

RESPONSIVE: PASS — 360 / 768 / 1440, navigateur réel, ouverture des détails et contrôle du débordement horizontal.

SECRETARY: consultation seule du nouvel espace ; aucune permission métier élargie.

- PR / CI finale : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34363849180 — PASS.
- Déploiement du SHA exact : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34364587150 — PASS ; `recordCurriculumProposalDecisions: ACTIVE`.
- Gate et recette sur le SHA exact : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34366188898 — PASS.
- Job de recette réelle : https://github.com/Lililinda86/Ecoscolaire/actions/runs/34366188898/job/102517456487 — reçu frontend SHA / mode staging / projet Firebase vérifié, test des 34 fiches PASS, lecture ITALO PASS, cinq régressions de suivi PASS, ressources/import Lot B PASS.
- Sur ce même SHA : 134 fichiers / 825 tests unitaires PASS, types/lint/build, tests Functions, règles Firestore/Storage, impression A4 et régressions Lots A/B/C/suivi sur émulateurs Linux PASS. Les services IA et automatisations externes ne sont pas revalidés par cette mission.

## Fixtures et sécurité

La recette des décisions a exclusivement utilisé le tenant synthétique `curriculum-review-228e5c567e319064`. Nettoyage Firestore/historique/audit/requêtes et compte Auth vérifié à 14:56:42 UTC. Aucun compte manuel de revue n’a été modifié.

Les cinq tenants synthétiques du suivi (`pedagogy-results-da3ff0b7a3ae153e`, `pedagogy-results-4594fc124715bfb9`, `pedagogy-results-f5e4e5089298556f`, `pedagogy-results-7be23cab93088d4d`, `pedagogy-results-a5f6dcd0de212206`) sont nettoyés et vérifiés. Nettoyage Lot B Firestore, Storage et Auth vérifié à 15:01:26 UTC. Nettoyage Staging restant pour cette mission : aucun.

Protection Vercel conservée. Aucun secret ni bypass publié. Aucun PDF ministériel privé ni extraction intégrale ajouté au dépôt. Les sources sont liées et documentées, avec réserves d’authentification et d’applicabilité.

READY FOR OWNER CURRICULUM REVIEW: YES

READY FOR PRODUCTION AUTHORIZATION: NO

OPENAI CALLS: 0

PRODUCTION TOUCHED: NO

## Action suivante — humaine uniquement

Se connecter à Vercel avec le compte autorisé, puis à Ecoscolaire comme owner. Ouvrir **Pédagogie → Programme → Validation du référentiel** sur l’URL ci-dessus. Lire les fiches et enregistrer soi-même les décisions. Voir `OWNER_CURRICULUM_REVIEW_GUIDE.md`. Ne pas effectuer de passage Production.

Le worktree est conservé sur `codex/pedagogy-content-completion`. Les sorties de compilation locales sous `functions/lib` restent hors commit et hors push ; elles ne sont pas les preuves déployées. Les preuves ci-dessus concernent le SHA Staging, pas le commit local de documentation ultérieur.
