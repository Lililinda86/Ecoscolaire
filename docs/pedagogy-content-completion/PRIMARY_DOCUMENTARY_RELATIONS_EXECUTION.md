# Revue primaire — affinage documentaire et ergonomie

Base Staging : ce419539999a569399be9c1ecd016d32a9fda5ae (#246).
Branche : codex/pedagogy-primary-documentary-relations.

## Périmètre et plan

Aucune recherche générale, aucun appel OpenAI, aucune intervention Production,
aucune décision à la place de la propriétaire. Préserver les décisions et leurs
versions ainsi que les modifications locales préexistantes.

1. Vérifier les six PDF MINEDUB existants et les 76 correspondances sûres.
2. Préciser les relations des 44 cas sans inventer leur périmètre ITALO.
3. Simplifier les trois étapes : groupes FR/EN, sélection volontaire, détails repliés.
4. Vérifier transactions, versions, audit, isolation tenant/année et absence d'effets implicites.
5. Tests ciblés puis gate Linux, PR staging, merge normal, déploiement et recette sur SHA exact.

## Constats à conserver

Les couvertures 2018 des six PDF déjà authentifiés désignent explicitement
SIL/CP, CE1/CE2, CM1/CM2 et Class 1/2, 3/4, 5/6 dans le bon sous-système.
Les 12 rattachements restent à forte confiance, sans approbation automatique.
Histoire/Géographie apparaissent comme composantes des sciences humaines et
sociales FR aux niveaux 2/3, mais pas dans le sommaire du niveau 1.
Ne pas extrapoler cette relation à SIL/CP.
La littérature est une composante explicite supplémentaire d'English Language
and Literature aux niveaux II/III : pas une équivalence globale avec English Language.
Une relation clarifiée documentairement reste soumise au choix owner d'utilisation
locale. Ne pas confondre clarification et approbation.

## État

Lecture ciblée native effectuée. Couvertures des six PDF, sommaires FR p.6,
langue/littérature EN niveaux II/III p.24 vérifiés visuellement.
Matrice et limites conservées dans PRIMARY_DOCUMENTARY_RELATIONS_AUDIT.md.
Types frontend/Functions : PASS. Lint CI local : PASS avant les derniers ajouts.
Tests ciblés : 3 fichiers, 15 tests PASS après les gardes de version et les relations.
Gate Linux, PR, déploiement et recette exacte : encore à exécuter.
Staging non modifié par cette mission. Les PASS de #246 restent attachés à
ce419539999a569399be9c1ecd016d32a9fda5ae, pas à ces changements.

OPENAI CALLS: 0
PRODUCTION TOUCHED: NO
