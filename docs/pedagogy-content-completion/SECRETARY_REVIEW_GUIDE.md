# Guide secrétaire — revue du contenu Staging

Environnement exclusivement `ecoscolaire-staging`. Utiliser la Preview immuable
du SHA indiqué dans le rapport final, puis son accès Vercel autorisé. Aucun secret,
compte CI ou bypass ne figure dans ce guide. Le compte manuel reste distinct de la CI.

## 1. Examiner une classe sans approuver par défaut

Ouvrir **Pédagogie → Programme de référence → Référentiel par classe**. Choisir la
classe. Lire la correspondance proposée, les disciplines/domaines du sommaire,
l'édition, la source et les extraits localisés. `PARTIAL` ne signifie pas complet.
Les noms de maternelle utilisent les libellés corrigés ; leurs IDs historiques
ne changent pas. Le niveau technique ITALO ne décide pas de l'année MINEDUB.

Les cartes **Programmes de vos classes** signalent les actions locales restantes.
Les preuves détaillées sont dans **Détails / Administration / Couverture** ;
l'export JSON conserve aussi les classes dépourvues de matières.

## 2. Configurer les disciplines seulement après vérification

Le catalogue local contient des références MINEDUB supplémentaires. Ce ne sont pas
des matières automatiquement affectées à toutes les classes. Utiliser le workflow
canonique de programme de classe pour son brouillon. Conserver les matières déjà
saisies. Confirmer le choix local des disciplines, leur caractère requis, les
coefficients et horaires avant publication ; ne pas remplacer une valeur inconnue
par une valeur prétendument officielle. Les 25 ajouts ne créent aucune affectation
d'enseignant et ne remplacent aucun programme publié.

## 3. Consigner une décision reçue

Dans **Adoption par niveau**, choisir le niveau et la version du programme.
Lire les matières, la source, les lacunes et les unités avant de choisir :
**APPROUVER**, **DEMANDER CORRECTION** ou **NON APPLICABLE**. Aucun choix prérempli.
Saisir l'auteur réel, la date et la référence de transmission ; cocher la réception
uniquement si cette décision a effectivement été reçue. Une correction ou une
non-applicabilité est historisée sans modifier l'adoption active. Une approbation
reste une décision locale, pas une certification ministérielle de la source.

Les références sans unité publiée pour le niveau ne peuvent pas être adoptées
par simple ressemblance. CP FR et Class 1 EN disposent chacun d'un extrait court
structuré : cela ne suffit pas à couvrir leur année scolaire.

## 4. Travail quotidien

1. **Planning** : vérifier l'année et la semaine ; préparer puis ajuster la proposition.
2. **Préparations** : générer les attendus depuis le planning ; enregistrer les documents réellement reçus et leur revue.
3. Consigner séparément ce qui a réellement été enseigné. Une préparation validée n'est pas une preuve d'enseignement.
4. **Évaluations** : examiner seulement les contenus enseignés ; consigner l'accord reçu, puis imprimer sujet ou corrigé. Aucun nouvel appel IA n'est autorisé dans cette mission.
5. **Activités et observations** : au préscolaire, saisir une observation contextualisée sans note ni classement ; « non observé » n'est pas un échec.
6. **Résultats et suivi** : transcrire la correction reçue ; absent, non évalué et zéro sont distincts.
7. **Suivi individuel et remédiation** : choisir une preuve initiale, proposer une activité, puis consigner séparément l'accord, la réalisation et la réévaluation reçus. Aucune difficulté durable ou compétence acquise n'est déduite d'un seul chiffre.

## 5. Cinq parcours de recette

Dans **Ressources**, le laboratoire propose cinq simulations de lecture réinitialisables :
préscolaire, primaire FR/EN, secondaire FR/EN. Il n'écrit rien dans ITALO et ne constitue
pas une preuve d'exécution backend.

La recette Linux `tests/pedagogy-results-emulator-e2e.spec.ts` instancie séparément
les cinq contextes dans des établissements fictifs jetables. Le curriculum,
planning, modèle, préparation et déclaration d'enseignement de départ sont des
fixtures stockées liées. Les formulaires et Functions de résultats/observations et
remédiation sont ensuite réellement exercés. Les données amont ne sont pas une
planification réelle ni une décision enseignante. Chaque exécution nettoie son
manifeste exact et son compte Auth, y compris en cas d'échec.

Ces tenants CI ne sont pas accessibles au compte owner d'ITALO ; ses droits ne
sont pas élargis. Aucun élève synthétique n'est mélangé à ses classes réelles.
Un bac à sable manuel persistant distinct nécessite un accès dédié : il n'est pas
présenté comme livré par les simulations de lecture.

## Décisions humaines restantes

- Édition effectivement applicable en 2026–2027 et sources réglementaires.
- Correspondance des trois niveaux maternels ITALO avec les deux années des documents MINEDUB ; programme interne prématernel.
- Disciplines locales, obligations, coefficients, horaires et affectations enseignants.
- Séries du secondaire FR, options du secondaire EN et corpus disciplinaires complets.
- Validations pédagogiques de toutes les propositions ; aucune n'a été fabriquée.
- Droits de réutilisation document par document, distincts de l'accès public à un PDF.

Le passage Production demande une revue humaine et une autorisation distinctes.
Il n'est pas exécuté par cette mission.
