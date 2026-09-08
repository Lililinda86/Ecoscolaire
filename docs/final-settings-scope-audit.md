# Audit final — mission Paramètres, périmètres vides et Encaissement

Base vérifiée : ee9dfc0be2bcce0ea350084fd0dd1d2fdaa32bec, Staging brn92gy34. Audit effectué avant les corrections de cette mission. Les captures et interactions réelles du run 34240393141 portent sur ce SHA ; elles ne valident pas les nouveaux cas ci-dessous.

| Domaine demandé | État initial | Code et preuve / contrôle à compléter |
|---|---|---|
| A — Paramètres complets et actions selon RBAC | CONFORME | Settings.tsx, SchoolFeeCatalog, TuitionDeadlineSettings ; navigation et sauvegarde direction exécutées, secrétaire en lecture. Fonctions et données conservées. |
| B — Inscription/T1/T2/T3 et échéances | CONFORME | Tarifs par classe, échéances administrables et snapshots serveur. Nouvelle non-régression requise. |
| B — Transport 4000/5000, secondaire gratuit, calendrier | CONFORME | transportPaymentPolicy, financialTariffConfiguration ; barème visible et règles Staging testées sur la base. |
| B — Réutilisation automatique du PK | PARTIEL | Encaissement lit studentPrivate/plan. L’activation setStudentTransportPlan exige encore raw.zonePk même si la fiche possède un PK valide ; ajouter un repli sur la fiche et un test réel sans ressaisie. |
| B — Catalogue CRUD et métadonnées | CONFORME | Création, édition complète, désactivation, versionnement, libellés réutilisables ; parcours Staging réel sur la base. |
| C — Aucune sélection = tout le périmètre | NON CONFORME | feeTargetClasses impose cycles.includes ; formulaire bloque sans cycle/classe ; absence de classe donne zéro élève. Nouvelle règle explicite à implémenter et vérifier sur les trois niveaux. |
| C — Multi-sélection / tout sélectionner / tout désélectionner | PARTIEL | Cases fonctionnelles ; pas de commande explicite de désélection globale, ni commandes globales pour les cycles. |
| C — Recherche / listes de l’établissement | PARTIEL | Recherche élèves présente, classes issues des données réelles mais non recherchables. |
| C — Nomenclature officielle et doublons | PARTIEL | Cascade exclut les anciennes classes inactives ; tableaux Paramètres comparent encore les noms aux classes inactives, ce qui ajoute parfois un suffixe d’identifiant inutile. |
| D — Publication → Encaissement ciblé / facultatif explicite | CONFORME | Frais obligatoire sélection individuelle, absence hors cible et facultatif par affectation ; contrôle de tous les périmètres vides à ajouter. |
| E — Sections compactes incluant Frais ponctuels | PARTIEL | accountGroups range exam avec activités et exceptional avec autres ; aucune section ponctuelle dédiée. |
| E/G — Partiel/multi-frais/reçus/avantages/moratoires/reversal/legacy | CONFORME | Parcours métier et conservation déjà exercés sur la base ; exécuter à nouveau après modifications. |
| F — Scénario réel spécifique maternelle avec multi-désélections | PARTIEL | Le scénario actuel vérifie les noms maternels puis publie pour un élève CP ; étendre à une publication maternelle et aux valeurs vides. |
| H — Gates de la nouvelle version | À EXÉCUTER | Unités, intégration, Rules, builds, lint, CI, déploiement, fonctions actives, aucun 404, responsive, nettoyage intégral et zéro orphelin. |
| I — Production interdite | CONFORME | Branche et workflow Staging uniquement ; aucune migration de données réelles. |
