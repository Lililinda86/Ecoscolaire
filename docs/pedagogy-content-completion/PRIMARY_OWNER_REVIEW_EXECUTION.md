# Revue primaire owner — exécution

Base Staging : 58128cc6011c2c074941e72c6ad4eecea7b960ec.
Branche : codex/pedagogy-primary-owner-review ; worktree dédié existant.
Les modifications functions/lib préexistantes sont préservées et exclues.

Périmètre : trois étapes compactes, 12 niveaux, 76 correspondances sûres et
44 ambiguïtés sur le catalogue ITALO observé. Compteurs calculés, jamais figés.
Pas de recherche documentaire, pas de changement du moteur de correspondance.
Français / Français et littérature demeure AMBIGUOUS malgré l'exemple du mandat.

1. Réutiliser les décisions de niveau et leur transaction existantes.
2. Étendre le callable de correspondances : sélections explicites par matière,
   décisions versionnées avec révision, historique et audit, transaction atomique.
3. Vue trois étapes ; sélection vide ; confirmation chiffrée ; provenance repliée.
4. Préserver les 8 préscolaires et 95 mappings secondaires partiels, hors groupée.
5. Tests unités, UI, émulateurs Linux, règles, E2E exact SHA et responsive.
6. PR/CI/merge normal/Staging ; preuves finales et guide.

Les anciennes propositions ne deviennent pas des décisions approuvées.
Mapping validé = niveau approuvé courant ET décision de mapping explicite courante.
À revoir plus tard ne compte pas comme ambiguïté résolue.
Aucune adoption, matière enseignée, affectation, horaire ou coefficient créé.
OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.

État : PR #246 fusionnée, SHA Staging ce419539999a569399be9c1ecd016d32a9fda5ae.
Gate candidat 34380833094 PASS : 137 fichiers / 844 tests unitaires ; transactions,
règles, A/B/C/D et nouvelle revue navigateur 12/76/44, responsive 360/768/1440.
Gate initial 34380352967 FAIL avant scénario : import named/CommonJS du catalogue
dans Playwright. Corrigé par chargement du catalogue compilé avec createRequire ;
aucune assertion assouplie. Tests chargés localement, gate complet ensuite PASS.
Fixture Linux curriculum-review-40d848e54d4ada91 nettoyée et vérifiée.
Déploiement 34381513388 tentative 2 PASS. Première tentative : échec de liste
Functions avant le dernier service de veille. Services ACTIVE vérifiés, liste
relue avec succès ; relance du seul job sans modification du code ou IAM.
Reprise du 14 septembre : recette exacte 34899381349 PASS, confirmation
RUN_PEDAGOGY_STAGING_SYNTHETIC seulement, SHA ce419539999a569399be9c1ecd016d32a9fda5ae.
Preview : https://ecoscolaire-kojvhw4u1-linda-lemofouet-s-projects.vercel.app.
137 fichiers / 844 tests unitaires PASS ; nouvelle revue 12/76/44 et régressions
A/B/C/D PASS ; nettoyages live tous vérifiés. Lecture ITALO réelle : 0/12 niveaux,
0/76 correspondances sûres et 0/44 ambiguïtés décidés/résolus.
Prochaine action : revue humaine owner dans la nouvelle Preview. Aucun travail
technique restant pour cette livraison ; aucune autorisation Production.
Rapport final : PRIMARY_OWNER_REVIEW_DELIVERY.md.
