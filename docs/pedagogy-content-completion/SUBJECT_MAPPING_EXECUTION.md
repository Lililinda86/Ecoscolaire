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

EN COURS — aucune livraison de cette nouvelle mission déclarée.
OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.
