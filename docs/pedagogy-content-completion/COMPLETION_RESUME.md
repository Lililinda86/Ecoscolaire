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
