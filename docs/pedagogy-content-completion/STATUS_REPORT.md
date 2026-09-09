# Remplissage pédagogique — livraison technique Staging validée

## Revue documentaire des 34 classes — 9 septembre 2026

Nouvelles fonctionnalités gelées. Aucune écriture Staging, aucun déploiement,
aucun appel OpenAI ni action Production pendant cette phase.

Livrable courant : OWNER_CURRICULUM_PROPOSALS.md, 34 propositions en six groupes,
avec sources, matières réellement affectées, recommandations et cases humaines
vides. Les douze correspondances primaires sont recommandées à l'approbation
de correspondance uniquement ; 22 autres fiches sont conditionnelles/à examiner.

Recherche MINESEC : catalogues FR/EN accessibles par HTTP direct ; 91 dossiers
publics parcourus, 81 PDF récupérés avec empreintes, conservés hors dépôt. Les
index publiables sont des métadonnées, pas les textes. Contrôles dans
MINESEC_SOURCE_ASSESSMENT.md et MINESEC_SOURCE_CHECKS.json. Les anciennes mentions
« pas de source secondaire » sont des états historiques : 13 niveaux secondaires
ont maintenant des propositions documentées partielles ; Première reste sans
corpus général établi. Rien de ce nouveau fonds n'est importé dans Staging.

Lecture locale ITALO : CP 2 matières, CE1 8, CE2 3 dans les révisions courantes ;
31 autres classes sans affectation active retrouvée. Les classes de second cycle
existent bien dans la configuration générale : la question des séries y est
pertinente, pas dans toutes les classes. Aucun compte ou permission changé.

Contrôles documentaires PASS : 34 jeux de champs, six groupes, zéro décision
cochée, 81 empreintes PDF, exclusions/corrections des niveaux et des faux intitulés.
UI Staging des 34 fiches groupées : NOT READY. Le dossier est prêt pour revue
documentaire humaine ; aucune adoption de programme n'a été simulée pour créer
une prétendue approbation groupée. Pas de nouveau gate applicatif revendiqué.

Reprise locale : `node scripts/check-pedagogy-owner-proposals.mjs`, puis lire
OWNER_CURRICULUM_PROPOSALS.md et les décisions effectivement reçues. Ne pas
rejouer le crawl ni les anciennes commandes de déploiement sans nécessité.

## État final faisant foi — 9 septembre 2026

SHA déployé et testé : `99c2daacd8ead63c9337456ea72c81bfe4f822b5`.
Déploiement 34316453874 SUCCESS ; gate consolidé exact 34316962304 SUCCESS,
y compris navigateur live, cinq contextes et nettoyages ciblés.
URL : https://ecoscolaire-o2n01ucdn-linda-lemofouet-s-projects.vercel.app
PR 238 fusionnée ; correctifs Settings des PR 237/240 préservés.
Rapport faisant foi : [FINAL_REPORT.md](FINAL_REPORT.md).
Les sections suivantes sont un journal historique, pas des commandes à rejouer.
Contenu PARTIEL prêt pour revue humaine ; produit pédagogiquement complet : NON.
OpenAI : zéro appel pendant cette reprise. Production : aucune action.
Branche locale : codex/pedagogy-content-completion ; worktree :
ecoscolaire-pedagogy-content-completion. Le checkpoint documentaire final est local
uniquement et ne remplace pas le SHA déployé ci-dessus. Aucune fixture de cette
recette conservée. Prochaine étape : revue humaine selon SECRETARY_REVIEW_GUIDE.md,
pas de nouveau déploiement ni passage Production automatique.

## SHA courant après fusion concurrente PR 240

Le déploiement 34315982579 de 5d63299 a réussi. Avant le dispatch, la garde SHA a
détecté la PR Settings 240 ; aucun test live sur 5d63299 n'a été lancé. Son correctif
de préservation du calendrier est conservé par fast-forward, sans conflit.
SHA courant : `99c2daacd8ead63c9337456ea72c81bfe4f822b5`.
Déploiement 34316453874 en cours ; Preview 6343458146 success :
https://ecoscolaire-o2n01ucdn-linda-lemofouet-s-projects.vercel.app.
Gate consolidé exact lancé : 34316962304, confirmation RUN_PEDAGOGY_STAGING_SYNTHETIC.
Ses contrôles live exigent le succès du déploiement exact. Aucun appel OpenAI.
Les mentions 5d63299 ci-dessous décrivent la livraison Pédagogie avant la PR 240.

## Livraison fusionnée — recette exacte encore en attente

PR 238 MERGED le 9 septembre 2026. SHA staging :
`5d632993f8631dae94a0c8636f43101b84ef399b`.
Le travail Settings PR 237 est préservé (base 9bac813, fusion dans 73625d7).
Gate combiné 34315530071 PASS : 133 fichiers / 820 tests unitaires, Functions,
Rules, Storage, A4, A/B/C et cinq contextes navigateur ; nettoyages exacts vérifiés.
CI 34315532376 et sécurité financière 34315532420 PASS.

Déploiement Firebase du SHA fusionné : run 34315982579 en cours après les trois
CI obligatoires PASS. Preview Vercel du même SHA : déploiement 6343377824 success,
URL protégée https://ecoscolaire-8je360dxq-linda-lemofouet-s-projects.vercel.app.
NE PAS considérer la recette Staging exacte comme PASS avant sa propre exécution.

Reprise exacte après succès du déploiement :
`gh workflow run pedagogy-release-gate.yml --ref staging -f expected_sha=5d632993f8631dae94a0c8636f43101b84ef399b -f app_url=https://ecoscolaire-8je360dxq-linda-lemofouet-s-projects.vercel.app -f confirmation=RUN_PEDAGOGY_STAGING_SYNTHETIC`
Cette confirmation n'exécute aucun appel OpenAI. Pas de cleanup global, pas de main.

Compteurs ITALO relus : 34 classes, 97 entrées subjects (dont 25 ajouts de références),
38 classSubjects, 13 classPrograms, 0 adoption, 0 planning, 0 préparation locale.
Catalogue global : 9 programmes (8 références partielles + 1 démonstration),
17 unités (12 extraits primaires sourcés + 5 de démonstration). Tous les 34 niveaux
techniques sont rattachés ; aucune décision pédagogique réelle créée.

## Diagnostic de la première recette cinq contextes

Gate 34314426019 : primaire FR et secondaire FR PASS ; deux échecs EN car le
test attendait le filigrane français alors que le produit affichait correctement
`DRAFT - TEACHER APPROVAL REQUIRED`. Préscolaire : sélecteur getByLabel exact sur
un label contenant les options d'un select. Reproduction locale Chromium sur HTML
minimal : labelExact=0, roleExact=1. Correction vers les noms accessibles des
combobox et délais d'action bornés ; aucune permission ni logique métier modifiée.
Readback des dix extraits primaires supplémentaires PASS ; import suivant zéro
création. Le gate du correctif doit encore être exécuté avant merge.

## Extension des extraits primaires

Douze extraits mathématiques primaires structurés (un par niveau SIL/CP/CE1/CE2/
CM1/CM2 et Class 1–6) issus des colonnes exactes des six PDF MINEDUB déjà vérifiés.
Deux extraits préscolaires restent sans équivalence ITALO forcée : 14 extraits dans
l'application, dont 12 destinés à curriculumUnits. Aucun horaire ni leçon détaillée
inventé. Les anciennes mentions de « deux extraits primaires » ci-dessous décrivent
l'import initial. Couverture toujours PARTIAL, pas un programme annuel complet.

## Rattachement technique final des niveaux

Les six classes maternelles historiques ont désormais leur catalogLevelId issu
des alias existants de classCatalog/defaultClasses : 34/34 classes avec niveau
technique. Noms et IDs inchangés ; aucune équivalence aux années MINEDUB décidée.
Écriture des six seuls champs sous préconditions updateTime ; readback PASS,
dry-run suivant zéro changement. Total du mandat : 18 champs de configuration
catalogLevelId ajoutés (12 primaire + 6 maternel), aucune donnée élève modifiée.
Les mentions « six niveaux manquants » plus bas sont historiques.

Les affectations locales de disciplines ne sont pas forcées : le workflow canonique
de publication exige des coefficients et horaires valides pour les matières actives.
Ils ne sont pas renseignés à partir de valeurs inventées ou de sommaires seuls.
Le catalogue de références est prêt à servir à cette décision locale.

## État complémentaire après 25efadd

Gate Linux 34313816879 : PASS intégral (statique, Functions, Rules Firestore,
Storage, A4 et navigateurs A/B/C/D). CI 34313819827 et sécurité financière
34313819839 : PASS. PR 238 encore brouillon, pas encore intégrée à ce stade.

Import Staging additif vérifié : 8 curriculumPrograms MINEDUB partiels, 2 unités
reformulées (CP FR / Class 1 EN seulement), 25 références de matières/domaines dans
le catalogue ITALO. Aucun écrasement ; readback PASS, dry-run suivant zéro création.
Pas d'adoption, d'horaire, de coefficient, d'obligation disciplinaire, d'affectation
enseignante ou de classSubject créé par cet import. Les programmes préscolaires
n'ont pas d'unité rattachée arbitrairement aux années ITALO. Les PDF restent privés.

Cinq recettes navigateur préparées dans des tenants synthétiques jetables : les
états curriculum/plan/modèle/préparation reçue/enseignement sont des fixtures
explicitement synthétiques ; observations ou résultats et remédiation utilisent
les vrais formulaires/Functions. Préscolaire sans note. Leur exécution sur cette
nouvelle version reste PENDING jusqu'au gate Linux puis au Staging exact.
Le laboratoire Ressources reste une simulation de lecture, pas ces écritures.

Prochaine étape : gate sur le prochain SHA, diagnostic des échecs éventuels,
puis PR prête/merge staging normal, déploiement et gate exact sans OpenAI.
Les sections suivantes conservent l'historique et ne remplacent pas cet état.

## Reprise active après 243d2e9

PR 238 vers staging, branche codex/pedagogy-content-completion, code publié.
Les anciens « aucun push » ci-dessous décrivent le premier checkpoint seulement.
Gate Linux 34313264513 : statique PASS, Functions/règles Firestore/Storage/A4 PASS ;
échec Lot A sur ancien texte « Progression planifiée uniquement », diagnostic établi,
sélecteur corrigé pour le nouveau libellé. Nouvelle exécution après push du correctif.

Configuration Staging appliquée : uniquement catalogLevelId ajouté à 12 classes
primaires historiques (noms/IDs inchangés), commit Firestore atomique avec updateTime.
Lecture après écriture PASS ; deuxième dry-run : zéro changement. Aucun élève,
résultat, matière, horaire, affectation ou adoption modifié. Ne pas déclarer qu'aucune
configuration Staging n'a changé. Six classes préscolaires historiques restent sans
niveau canonique renseigné ; correspondance aux années MINEDUB à décision humaine.

Contenu intégré : index de 10 disciplines pour chacun des six référentiels primaires
et 5 domaines pour chacun des deux référentiels préscolaires. Ce sont des références
documentées consultables, PAS 70 matières locales configurées. Cinq simulations en
mémoire accessibles dans Ressources, distinctes d'une recette backend complète par
cycle. Les collections ITALO ne reçoivent aucune fixture.

MINESEC : PDF Seconde anglais pour francophones, 2018, 33 pages consultables par
chemin direct. Arrêté non numéroté/date non renseignée et téléchargement local expiré :
OFFICIAL_PENDING_VERIFICATION, aucune empreinte inventée. Courte reformulation du
module 1 p.11 consultable ; série A/C/D et applicabilité à confirmer.
GCE Board : règlements/syllabus et annales via bureaux, aucun achat. CEDUC : candidat
Communauté Éducative Camerounaise identifié par sa présentation publique ; identité
juridique, URL canonique active et licence restent inconnues, LINK_ONLY.

OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.

Base vérifiée : origin/staging 9eb7fbdec84386f7f0d58433a9463d29d25b8f38.
Branche : codex/pedagogy-content-completion. Worktree : ecoscolaire-pedagogy-content-completion.
Les anciens worktrees et leurs modifications sont préservés.

## Contraintes

- Zéro appel OpenAI. Production et merge main interdits.
- Pas d'adoption, de décision enseignante ni de conformité officielle fabriquée.
- Documents sans droit de redistribution : métadonnées et liens seulement.
- Démonstration isolée des données ITALO ; recréation/suppression ciblées et idempotentes.

## Blocs d'exécution

1. Inventaire du module et données Staging, sans données personnelles ; matrice écran/données/source/action.
2. Recherche MINEDUB complémentaire et MINESEC prioritaire ; provenance, datation, droits et localisation.
3. Correspondances des classes, matières/domaines et contenus structurés ; ne pas modifier les IDs historiques.
4. Consultation par classe et propositions d'adoption lisibles ; séparer détails administratifs.
5. Ressources et épreuves sourcées, CEDUC complémentaire ; planning distinct du programme.
6. Cinq parcours de démonstration isolés, aucun appel IA ; conserver les garde-fous A/B/C/D.
7. Tests impactés puis gate Linux final ; PR et livraison Staging exacte ; rapport consolidé.

## État et limites observés

- Lecture code : couverture actuellement fondée sur des candidats nominaux, aucune preuve matière/source ; ne pas convertir ces candidats en adoptions.
- Consultation navigateur tentée : outil indisponible (échec ACL du kernel). Aucune inspection visuelle déclarée PASS.
- Recherche MINESEC : page institutionnelle des programmes indexée ; ouverture web en timeout. Des PDF sont indexés sur files.minesec.gov.cm ; authenticité et version applicable restent à vérifier.
- Nouveau travail : aucun déploiement, aucune donnée métier Staging modifiée, aucun appel OpenAI.
- Tests nouveaux : non exécutés à ce stade.

## Reprise

### Checkpoint d'implémentation du 9 septembre 2026

- Synthèse secrétaire par classe, détails techniques repliables, consultation des unités publiées par niveau.
- Présentation du programme sélectionné et des classes concernées, sans adoption automatique.
- Distinction explicite programme / progression hebdomadaire proposée / confirmation d'enseignement.
- Deux liens complémentaires consultés ajoutés : portail vidéo ministériel et candidat schoolfaqs. Aucun nouveau curriculum certifié et aucun média copié.
- Tests ciblés : 18 PASS / 7 fichiers. TypeScript frontend PASS. ESLint des fichiers modifiés PASS. git diff --check PASS (avertissements de conversion LF/CRLF uniquement).
- Recette navigateur / responsive / A4 : NON EXÉCUTÉE. Gate final et régressions complètes A/B/C/D : NON EXÉCUTÉS pour ce nouveau code.
- PR : aucune. Push : aucun. Staging inchangé au SHA de base. Aucun compte ni document métier modifié pendant cette mission.
- Inventaire enregistré dans MODULE_INVENTORY.md ; les compteurs agrégés sont réels mais ne prouvent pas l'activation ou la révision courante.
- Les extractions privées MINEDUB existantes restent dans le worktree privé : aucun PDF ni texte intégral copié ici.
- À terminer : structuration documentaire et matières, mapping des classes, décisions non-approbatrices persistées, cinq parcours synthétiques isolés, tests et livraison complète.

Commande de contrôle pour reprendre : `git status --short` puis `git log -1 --oneline` dans ce worktree.
Les modifications ci-dessus ne constituent PAS la livraison demandée ni un centre pédagogique rempli.

Continuer dans ce worktree. Lire les changements locaux avant de reprendre.
Achever l'inventaire de toutes les pages et l'extraction des métadonnées MINESEC via les chemins institutionnels alternatifs, puis tester les changements de consultation.
Ne pas rejouer les anciennes recettes IA ni publier le dossier privé des missions précédentes.
