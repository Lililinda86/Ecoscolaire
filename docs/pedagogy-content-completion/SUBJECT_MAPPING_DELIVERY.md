# Curriculum subject configuration report

État : LIVRÉ SUR STAGING, prêt pour la revue humaine des correspondances.
PR fusionnée : https://github.com/Lililinda86/Ecoscolaire/pull/245

## Inventaire initial réel

Lecture Staging du 9 septembre 2026, 15:53 UTC ; établissement
`school-italo-official`, année `ay_school-italo-official_2026-2027_er0p`.

| Classes | Domaines officiels par classe | EXACT | SAFE_ALIAS | À confirmer |
| --- | ---: | ---: | ---: | ---: |
| SIL / CP | 10 | 2 | 5 | 3 |
| CE1 / CE2 | 10 | 3 | 3 | 4 |
| CM1 / CM2 | 10 | 3 | 3 | 4 |
| Class 1 / Class 2 | 10 | 5 | 2 | 3 |
| Class 3 / Class 4 | 10 | 4 | 2 | 4 |
| Class 5 / Class 6 | 10 | 4 | 2 | 4 |

Chaque ligne regroupe deux classes ; les nombres sont **par classe**.
Total : 60 entrées matière/source sur six tomes, réutilisées sur 120 lignes
classe/matière ; 42 EXACT + 34 SAFE_ALIAS = 76 sûres, 44 ambiguïtés,
zéro matière locale manquante au sens du moteur. Aucun nouveau sujet créé.

Le catalogue contient aussi des références CATALOG_REFERENCE_ONLY : elles ne sont
jamais comptées comme matière locale enseignée ni appliquées automatiquement.
Les programmes existants comportaient des matières actives dans trois classes ;
31 classes étaient sans matière configurée. Les propositions ne changent pas
ce compteur historique de configuration réelle.

## Contrats livrables

- Douze propositions primaires calculées depuis les sources vérifiées et le
  catalogue du tenant ; les fiches ne sont plus réduites à un zéro sans explication.
- Confirmation owner, source et catalogue relus dans une transaction, application
  idempotente en liens `proposed`, versions immuables et audit canonique.
- Aucune écriture de décision documentaire, adoption, programme publié, obligation,
  coefficient, volume, affectation enseignant ou donnée élève.
- Dix domaines préscolaires comme repères ; aucun nouveau rattachement de niveau.
- Quatorze niveaux secondaires affichés en PARTIAL_OFFICIAL_COVERAGE, dont Première
  sans corpus établi. Aucun bouton d'application secondaire.
- Douze extraits de sciences supplémentaires (26 extraits locaux au total,
  dont 24 primaires) ; colonnes et pages vérifiées. Extraction partielle, pas
  curriculum intégral ni progression annuelle complète.
- Suggestions de progression uniquement à partir de liens sûrs appliqués et de
  semaines ITALO ouvertes. Calendrier absent signalé, jamais fabriqué.

## Validation et déploiement

- Commit initial c39e0ba : gate complet 34373360696 PASS, règles/stockage,
  émulateurs de fonctions, A/B/C et résultats/suivi ; recette navigateur synthétique.
- SHA candidat final : da44bf233d09209ef90af99836b8059cf142f349.
- Gate final : 34374343080 PASS, 136 fichiers / 838 tests unitaires, règles,
  backend et régressions navigateur A/B/C/D.
- Staging SHA : 58128cc6011c2c074941e72c6ad4eecea7b960ec ; déploiement 34375130006
  PASS. Preview exacte : https://ecoscolaire-97qfraa7r-linda-lemofouet-s-projects.vercel.app/#/pedagogy/program.
- Recette exacte : 34376834668 tentative 2 PASS, confirmation RUN_PEDAGOGY_STAGING_SYNTHETIC,
  aucun test OpenAI demandé.
- Import réel : 12 créations, lecture PASS, zéro écrasement ; second dry-run zéro.
- Recette exacte et nettoyage PASS le 9 septembre 2026 à 16:48 UTC.

Première tentative live 34376834668 : correspondances PASS et fixture nettoyée
(`curriculum-review-f88480f1293db4c0`). Suivi : 4/5 contextes PASS ; primaire FR
échoue à l'affichage « Réévaluation consignée » après 30 s. Les quatre appels
managePedagogyRemediation de ce contexte ont répondu HTTP 200 (16:35:51–16:36:02
UTC), aucune erreur Cloud Functions dans la fenêtre contrôlée. Les cinq fixtures
de suivi ont toutes leur marqueur EXACT_FIRESTORE_CLEANUP_VERIFIED. Aucun
artefact navigateur disponible pour établir plus précisément l'état DOM final.
Hypothèse : lecture/rafraîchissement transitoire ; cause racine non démontrée.
Relance du seul job échoué sur le même SHA, assertions inchangées, sans redéployer.
Ne pas présenter la première tentative comme PASS ni une hypothèse comme cause prouvée.

Tentative 2 : PASS sur le même SHA, sans changement de code ni d'assertion.
Le primaire FR passe, ainsi que les quatre autres contextes, la revue des matières
et les ressources Lot B. Incident non reproduit ; cause racine non démontrée.
Reçu frontend, déploiement backend et lecture ITALO vérifiés sur ce SHA exact.
Dernière lecture ITALO dans la CI à 16:44 UTC : 0 décision enregistrée, 34 en attente.

Preuves :
- [Déploiement Staging PASS](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34375130006)
- [Gate exact et recette, tentative 2 PASS](https://github.com/Lililinda86/Ecoscolaire/actions/runs/34376834668/attempts/2)
- 136 fichiers / 838 tests unitaires PASS ; A/B/C/D, règles Firestore/Storage,
  fonctions, permissions et multi-tenant PASS.
- SUBJECT_MAPPING_LIVE PASS : douze propositions, CE1/Class3, sources/unités,
  confirmation, annulation, correspondances sûres seules, audit, aucune adoption,
  responsive 360/768/1440.
- Fixture curriculum-review-e4e2f8287900ef5e nettoyée et vérifiée.
- Cinq fixtures pedagogy-results nettoyées et vérifiées : a0d11e207b06bf03,
  8e41ee25ffec7567, 5506d61423fe4227, b9e21534738819c7, a05ccb84334dedfe.
- Lot B Staging : final cleanup verified. Aucun nettoyage restant identifié.

## Revue humaine restante

Les 34 décisions de niveau étaient encore en attente lors de la lecture réelle
du 9 septembre 2026 à 16:27 UTC, après déploiement. Aucune n'a été fabriquée. La propriétaire décide séparément
de l'application des liens sûrs et de l'adoption. Les 44 ambiguïtés restent exclues.

Informations secondaires regroupées : séries de 2nde/1re/Terminale ; combinaisons
Lower/Upper Sixth ; options et LV2 réellement ouvertes. Les sources ministérielles
ne permettent pas de déterminer l'offre locale ITALO.

OPENAI CALLS: 0
AUTOMATIC ADOPTIONS PERFORMED: 0
HUMAN DECISIONS FABRICATED: 0
REAL DATA STUDENTS MODIFIED: NO
FINANCIAL DATA MODIFIED: NO
PRODUCTION TOUCHED: NO
READY FOR PRODUCTION AUTHORIZATION: NO

Guide : [Revue propriétaire des matières](https://github.com/Lililinda86/Ecoscolaire/blob/58128cc6011c2c074941e72c6ad4eecea7b960ec/docs/pedagogy-content-completion/OWNER_SUBJECT_MAPPING_GUIDE.md).
READY FOR OWNER SUBJECT-MAPPING REVIEW: YES.
Point de reprise : revue humaine dans Pédagogie → Programme → Validation du référentiel.
Aucun autre déploiement requis ; aucune action Production autorisée.

## Compteurs et limites

PRESCHOOL DOMAINS: 10 (5 FR + 5 EN), repères sans équivalence automatique.
SECONDARY PARTIAL MAPPINGS: 95 lignes classe/discipline, sur 14 niveaux affichés ;
13 ont des sources partielles, Première reste sans corpus établi. Aucune application.

CLASSES STILL SHOWING MATIÈRES / DOMAINES À CONFIGURER (matrice détaillée réelle):
BEFORE: 31. AFTER: 31. Les douze fiches primaires affichent maintenant leurs dix
matières officielles et leurs correspondances proposées. Ce progrès documentaire
ne remplace pas une configuration de matières enseignées et ne réduit pas
artificiellement le compteur de la matrice. Le résumé propose un accès aux matières.

Contenu Staging permanent ajouté : douze curriculumUnits de sciences sourcées.
Zéro sujet local créé, zéro programme existant écrasé, zéro lien de matière appliqué
sur les classes ITALO par l'agent. L'application est réservée à la revue owner.
