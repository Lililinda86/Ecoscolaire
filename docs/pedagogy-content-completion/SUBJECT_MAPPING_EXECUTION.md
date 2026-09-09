# Configuration documentaire des matières — exécution

Mandat reçu le 9 septembre 2026. Base Staging vérifiée par fetch :
`d1f7c854ddfc855dc377bf40ef6aebf570b69dfb`. Checkpoint documentaire local :
`805d38f`. Les sorties générées `functions/lib` présentes sont préservées.

## Limites

- A : source officielle ; B : catalogue documentaire ; C : proposition ITALO ;
  D : adoption humaine. Ne jamais fusionner ces quatre niveaux.
- Aucune décision documentaire existante modifiée. Aucun appel OpenAI.
- Aucune écriture élèves, finances ou Production.
- Aucun coefficient, horaire, série, option ou matière inventé.
- Aucun PDF intégral ni extraction intégrale dans le dépôt public.

## Blocs et preuves à compléter

1. Inspection ciblée `subjects`, `classSubjects`, `classPrograms`,
   `teacherAssignments`, classes et métadonnées de sources Staging en lecture seule.
2. Vérification des intitulés des six sources primaires ; mapping déterministe
   EXACT / SAFE_ALIAS / AMBIGUOUS / MISSING_LOCAL_SUBJECT avec provenance.
3. Propositions consultables pour les douze classes primaires. Application owner
   explicite, confirmée, transactionnelle, idempotente et auditée ; aucune adoption.
4. Domaines préscolaires indicatifs, secondaire PARTIAL_OFFICIAL_COVERAGE,
   extraction supplémentaire fiable et garde-fous de planification.
5. Tests unitaires, émulateurs Linux, règles, régressions A/B/C/D, responsive.
6. PR Staging, CI, merge normal, déploiement et recette sur SHA exact.

## Inspection déjà effectuée

- Le catalogue documentaire `minedubSubjectIndex.ts` existe : six groupes
  primaires de dix intitulés et deux ensembles préscolaires de cinq domaines.
  Contrôler les termes par niveau avant de les utiliser comme vérité serveur.
- `subjects` porte schoolId, section, cycles et isActive.
- `classPrograms` distingue brouillon et version publiée ; `classSubjects` porte
  revisionId. La publication n'est pas une adoption du curriculum.
- Le contrat `updateClassProgramDraft` requiert notamment isRequired : ne pas
  inventer cette décision métier pour contourner un contrat.
- Les propositions et décisions de niveau de la PR #242 restent indépendantes.

## État

EN COURS — PR #245, commit initial c39e0ba, CI Linux 34373360696.
Typechecks frontend/Functions, lint ciblé et 18 tests unitaires ciblés PASS.
Tests émulateurs, CI complète et recette Staging : EN ATTENTE, pas déclarés PASS.

Lecture réelle 15:53 UTC : 97 entrées catalogue, 13 programmes, deux affectations,
31 classes sans matière active configurée. Sur 120 lignes primaires : 42 EXACT,
34 SAFE_ALIAS, 44 AMBIGUOUS, zéro MISSING_LOCAL_SUBJECT. Voir baseline JSON.
Les entrées CATALOG_REFERENCE_ONLY sont exclues des matières locales candidates.

Six PDF primaires retrouvés dans le fonds privé existant. Empreintes identiques
au registre. Texte natif relu ; six tableaux de sciences vérifiés visuellement :
FR pages PDF 82, 95, 93 ; EN pages PDF 51, 52, 53. Douze reformulations ajoutées,
une par classe, sans horaires. Les images et les PDF restent hors dépôt.

Dry-run de l'import Staging : exactement 12 créations d'unités ; huit programmes,
12 anciennes unités et 25 entrées documentaires inchangés. Zéro adoption,
affectation de matière de classe ou écriture élève. Import réel pas encore exécuté.

Recherche complémentaire ciblée des lacunes Première/mathématiques, anglais
Form 1 et SVTEEHB 4e : les résultats supplémentaires obtenus sont des copies,
mémoires ou autres systèmes nationaux, pas un nouveau document MINEDUB/MINESEC
authentifié. Rien intégré depuis ces candidats. Réutilisation du corpus antérieur.

Choix de contrat : collection de liens proposés distincte, car classSubjects
requiert isRequired. Ne pas inventer une obligation pour remplir un brouillon.
Les décisions documentaires et adoptions existantes restent séparées et intactes.
OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.
