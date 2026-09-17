# Reprise — mission complète, après PR 252

Base : 5b4eb6d7748b78cc25f2cc8e28e3b1da335f0cd0. Ce SHA est un checkpoint validé, pas la fin de la mission.

## Blocs de travail et preuves attendues

1. Étendre les recettes préscolaires existantes aux huit niveaux, sans remplacer le parcours secrétaire. Conserver les preuves des quatre parcours précédents ; les nouvelles assertions ne sont PASS qu'après exécution.
2. Structurer davantage le corpus MINEDUB/MINESEC déjà authentifié : unités, objectifs, compétences et locateurs, sans republication non autorisée ni équivalence inventée. Recherche complémentaire ciblée sur les lacunes.
3. Enrichir ressources, modèles et banque d'épreuves avec provenance/droits explicites ; isoler CEDUC si non authentifié.
4. Vérifier en environnement isolé puis sur Staging les automatismes exécutables sans fournisseur payant : semaine, préparations attendues/manquantes, vendredi, veille/changement, suivi. Ne pas activer une configuration sur un établissement réel par simple besoin de test.
5. Vérifier la lisibilité secrétaire ; reprendre le diagnostic navigateur sans contourner l'authentification. Recettes Linux si le contrôle local reste indisponible.
6. Gate consolidé, PR et livraison Staging du SHA final, nettoyage exact et rapport de complétion distinguant les lacunes restantes.

## Préservé

12 niveaux primaires, 76 relations sûres et 18 composantes documentaires déjà appliqués : ne pas réappliquer. Sept groupes de décisions ITALO restent distincts des preuves documentaires. 130 ressources dédupliquées, 40 activités et huit niveaux préscolaires conservés. Modifications générées préexistantes dans functions/lib non incluses dans les commits.

## État au démarrage

origin/staging confirmé égal à la base. Couverture actuelle : quatre parcours préscolaires navigateur et serveur, pas huit. Le test transactionnel utilise des indices pour distinguer FR/EN et des effectifs fixes de quatre : remplacer par une classification explicite et des assertions adaptées aux huit niveaux.

OPENAI CALLS: 0. PRODUCTION TOUCHED: NO. Aucun résultat futur anticipé.

## Checkpoint 2 — structuration secondaire

36 modules de mathématiques indexés pour 6e/5e/4e/3e et Form 1–5, à partir des tableaux MINESEC 35 p.19, 52 p.15, 8 p.20, 62 p.18–19. Empreintes du cache recalculées et cinq pages inspectées visuellement. Résumés courts de la famille de situations, pas extraction complète des objectifs détaillés. Les 36 entrées restent à l’intérieur des quatre notices existantes : le compteur documentaire reste 130.

Durées conservées comme valeurs documentaires, aucune écriture d’horaire. Form 4 et Form 5 distinctes. Compétences détaillées, activités et évaluations non encore extraites laissées nulles. Bibliothèque existante et export de provenance enrichis, sans décision/adoption.

Tests ciblés : 2 fichiers / 5 tests PASS. Gate du checkpoint 05d83ff : 35143755109 en cours à la rédaction ; statique PASS. Le contrôle navigateur local a été réessayé puis réinitialisé : même erreur Windows ACL au démarrage, aucune interaction ni contournement. Poursuivre Linux et serveur pendant ce blocage externe.

## Checkpoint 3 — preuves et références d’examen

Gate 35143755109 terminé PASS (05d83ff) : huit niveaux, régressions et sécurité de ce checkpoint. Modules/veille : 31 tests ciblés PASS. Types frontend et lint ciblé PASS avant le checkpoint d9e1bec.

Quatre références supplémentaires provenant de https://camgceb.org/downloads/ : Logic 0590 (mars 2024, première session juin 2025), rapports Ordinary Level 2023, Advanced Level 2023 et 2024. Quatre PDF téléchargés légalement, format et hashes contrôlés, couvertures/sommaires inspectés. Liens/métadonnées uniquement publiés ; ni rapports assimilés à des corrigés, ni listes nominatives de résultats importées. Catalogue 134, dont 7 GCE. Banque externe filtrée séparément de la banque interne ; une année de copyright ne devient pas une session d’examen. Tests banque/bibliothèque : 5 fichiers / 14 tests PASS.

Recherche ciblée : CEDUC.CM se décrit comme Communauté Éducative Camerounaise sur sa page LinkedIn (https://www.linkedin.com/company/ceduc-cm), sans droit de redistribution vérifié ; site direct indisponible via le lecteur web. Piste IFADEM « CM livret 4 » contrôlée : couverture COMORES, donc non importée comme document camerounais. L’IFEF annonce des livrets camerounais mais leur accès exact reste à retrouver ; aucune fausse attribution. Recherche Première officielle ne fournit pas encore de programme suffisamment identifié ; ne pas remplacer par un programme français/technique.

Préflight serveur Staging en lecture seule : zéro configuration vendredi activée, zéro veille activée. Les champs série/option/combinaison des cinq classes du second cycle sont vides. Il reste à vérifier les configurations associées avant de regrouper la question ITALO. L’ancien identifiant strictement synthétique prévu par le garde-fou vendredi n’existe pas actuellement ; un essai isolé reste à préparer et exécuter, pas encore PASS.


## Checkpoint 4 — reprise du 17 septembre 2026

Baseline indépendante : Staging 5b4eb6d, backend déployé par 35083384689 ; Preview 6478524527 réussi. Main/Production Ecoscolaire e38ed140, aucun changement. Les deux SHA fournis dans la nouvelle mission ne sont pas des références utilisables de ce dépôt. Le navigateur interactif reste bloqué par Windows ACL ; aucun succès visuel Staging présumé. Les lectures Staging agrégées ont confirmé zéro plan, préparation, évaluation, observation et remédiation ; ces comptes ne signifient pas absence des fonctionnalités.

Reprise de la même branche/PR 253, aucun développement concurrent. Les 22 fichiers générés préexistants sont préservés. Le gate 35273058033 sur 9e46b03 a trouvé une assertion périmée : elle exigeait CHECK_FAILED pour MINESEC malgré les documents récupérés. 884 autres tests unitaires étaient PASS. L’assertion conserve désormais la réserve sur l’applicabilité et la version définitive. Pas de suppression de garde-fou.

Empreintes des 81 PDF du cache MINESEC recalculées : 81 correspondances, zéro différence. Présentations des 36 modules mathématiques lues individuellement ; 36 résumés courts de compétences ajoutés avec page PDF dédiée, portée MODULE_OVERVIEW, aucune activité/évaluation/adoption inventée. Pages 35/p23 et 62/p71 inspectées visuellement. Form 1 : le module 4 devient Elementary statistics, sans lui attribuer la probabilité du niveau suivant. Les sommaires et durées restent des données documentaires, pas un emploi du temps.

Tests locaux : 11 tests bibliothèque/modules PASS, test de réserve documentaire PASS, lint ciblé et types frontend PASS. Nouveau parcours navigateur : 14 routes avec identité secrétaire synthétique, 360/768/1440, captures sans données réelles, blocage des appels de génération/analyse, contrôle d’absence d’adoption et nettoyage exact. Sa présence dans le code ne constitue pas encore une preuve d’exécution ; attendre le prochain gate et la recette Staging.

STATE: IN_PROGRESS. REMAINING: gate du nouveau SHA, intégration Staging, recettes réelles vendredi/veille, inventaire visuel et complétion documentaire utile. OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.


Complément de reprise : lecture indépendante ITALO, 34 classes, 12 décisions de niveau approuvées, 22 en attente. Dry-run du manifeste primaire : 94 relations attendues et présentes, 76 sûres, 18 composantes, 86 documents, zéro conflit, idempotent, zéro écriture. Les relations ne sont pas rejouées. Les quatre langues des sources mathématiques inspectées sont désormais utilisables dans les filtres ; les 71 autres documents MINESEC sans langue établie restent explicitement à vérifier. Compteur GCE rendu dynamique. Accueil secrétaire : actions avant les indicateurs, compteurs expliqués dans un détail, liens corrects vers préparation, bilan par classe et observations. Tests ciblés : six catalogue, quatre dashboard PASS ; garde multi-tenant conservée.

### Reprise du 17 septembre — preuve serveur et préparation de la recette finale
- Staging 5b4eb6d : huit parcours serveur FR/EN réellement exécutés et nettoyés, bilan qualitatif, contenu confirmé seulement, idempotence, refus inter-école, remédiation avec nouvelle observation. Préparation amont synthétique, aucun appel fournisseur.
- Catalogue MINEDUB Staging contrôlé à blanc : 8 programmes, 24 extraits structurés, 25 matières attendues ; zéro création nécessaire. Les décisions primaires existantes sont conservées.
- Les 14 routes se rendent à 360/768/1440 dans le gate 35274530114. Le gate complet reste en cours de correction du test de libellé documentaire ; ne pas assimiler le rendu à un parcours fonctionnel complet.
- Veille Staging réelle : première empreinte et contrôle inchangé PASS. Configuration dédiée désactivée, utilisateur synthétique supprimé entre phases. Le fichier témoin v3 permet le prochain contrôle de changement réel après intégration ; aucune publication/adoption automatique.
- Les captures attendent la fin du mouvement de fermeture du menu mobile après redimensionnement afin de montrer le contenu stable.
- Le catalogue public GCE a été relu : la page Past Questions and Others ne fournit pas de sujet téléchargeable ; aucun corrigé supplémentaire authentifié. La circulaire officielle Geography du 18 novembre 2023 confirme la première session de juin 2025, cohérente avec la référence existante.
STATE: IN_PROGRESS. Production inchangée. OPENAI CALLS: 0.

### Contrôle du code déployé et correctif de finalisation
Le gate du merge4e60c893 (35276993782) est PASS, et le déploiement35276986788 est affiché SUCCESS. Toutefois, une inspection de l’archive réellement active du planificateur de veille révèle l’ancienne sourceWatchPolicy, sans camgceb.org. Le journal de déploiement indique un quota dépassé pour ce planificateur ; son statut ACTIVE ne prouve donc pas la présence du nouveau code.
La finalisation ajoute un petit lot dédié aux trois fonctions de veille et une comparaison des modules compilés réellement archivés avec ceux du commit, sans journaliser les URL signées ni des identifiants. Trois tests hors réseau vérifient l’acceptation du bon code et le rejet d’un code périmé ou manquant.
La veille du fichier synthétique, déjà autorisé dans les deux versions, a réellement passé baseline, unchanged, file_changed, revue explicite sans publication et nettoyage. Empreintes: d50677a2a32a7106cc3755966c0c4866bd11be92fe7fdb4144c060a4aced5702 puis9a7345dd2a771f5b7ff79183057cd768e6d23c061be3d7e5cc5442566764ac15.
La revue tablette a aussi déplacé la bibliothèque avant les exports et simulations ; les détails restent ouvrables. Le premier test adapté avait un double clic qui refermait la provenance : corrigé. Les huit parcours préscolaires de ce gate étaient PASS, pas le gate complet ; attendre la relance.
STATE: IN_PROGRESS. Staging uniquement. OpenAI0. Production inchangée.
