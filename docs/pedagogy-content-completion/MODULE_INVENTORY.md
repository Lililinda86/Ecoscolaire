# Matrice du Centre pédagogique existant

Source code : src/App.tsx, src/features/pedagogy/pages, components, services et resources.
Inspection ciblée du code, pas validation visuelle. Navigateur indisponible (kernel/ACL).
Lecture agrégée Staging du 9 septembre 2026 : 34 documents classes, 38 classSubjects,
13 classPrograms, 0 schoolCurriculumAdoptions, 0 teachingWeeks, 0 teachingPlans,
0 lessonPreparations, 0 weeklyAssessments. Catalogue global : 1 programme, 5 unités.
Ces comptes ne prouvent ni activation, ni révision courante, ni couverture officielle.
Résultats/observations/remédiations non recomptés : ne pas les déclarer vides par inférence.

| Écran / route après /pedagogy | Fonction et actions existantes | Données attendues / constatées | Manque et source nécessaire | Action |
| --- | --- | --- | --- | --- |
| racine | Pilotage, semaines, préparations, évaluations, plannings à traiter | Workspace et compteurs, semaines/plans à zéro | Données opérationnelles et calendrier ITALO | Conserver les compteurs honnêtes ; démonstration isolée |
| program | Catalogue, couverture, adoption avec auteur/date/référence reçue | 1 programme global, 0 adoption locale | Contenus sourcés et mapping vérifié | Consultation détaillée ; proposer sans approuver |
| planning | Créer semaines, brouillon, proposer, ajuster, consigner validation | 0 semaine et plan local | Calendrier, unités adoptées, enseignants, contraintes ITALO | Distinguer progression proposée du programme ministériel |
| preparations | Attendus, documents reçus, revue et confirmations enseignées | 0 préparation locale | Planification / apports enseignants | Modèles adaptés, parcours de démonstration séparé |
| preparations/import | Import fichier planifié ou hors planning et analyse | Uploads immuables avec checksum | Apport enseignant ; aucune nouvelle IA autorisée | Utiliser uniquement fixtures et sorties enregistrées |
| preparations/missing | Repérer les préparations attendues non reçues | Attendus issus des plans | 0 plan local | Garder la distinction attendu/reçu |
| assessments | Génération, correction, visa matière, prêt à imprimer, brouillon/corrigé | 0 évaluation locale | Préparations vérifiées + portions enseignées | Conserver tous les contrôles ; pas d'appel OpenAI |
| observations | Activités et observations préscolaires qualitatives | Non recomptées | Observations réellement reçues ; modèles préscolaires | Démonstration explicitement synthétique |
| results | Résultats, preuves question/objectif, difficultés | Non recomptés | Réponses et barèmes, pas simple note globale | Ne pas attribuer de compétence sans preuve |
| follow-up | Suivi individuel, difficultés, remédiations | Non recomptés | Résultats/observations et décisions humaines | Conserver lien preuve/remédiation |
| resources | Modèles FR/EN, provenance, extraits, dossier de revue | 8 modèles originaux ; 10 fichiers MINEDUB référencés, 4 extraits courts | Matières/contenus secondaires, droits et identité CEDUC | Enrichir légalement, distinguer lien et contenu intégré |
| exam-bank | Banque interne et filtres du périmètre | Non recomptée ; pas d'archive officielle intégrée démontrée | Sources officielles examens et droits | Référencer séparément sujets, corrigés et exercices |
| settings | Automatisation vendredi et configuration veille de sources | Configurations existantes, état live non relu | Sources autorisées, décisions de configuration | Aucun changement d'activation IA |
| history | Historique des plans et états | 0 plan local | Traçabilité générée par actions effectives | Conserver l'historique |

La confirmation d'enseignement est une action du parcours Préparations, pas un écran absent.
La veille est configurée dans les paramètres ; l'adoption figure dans Programme.
La publication du catalogue est distincte de l'adoption locale ; ne pas ajouter de droits au compte owner.

## Pistes documentaires complémentaires

- Catalogue MINESEC FR : https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels
- Catalogue EN : https://www.minesec.gov.cm/web/index.php/en/systeme-educatif-en/progammes-d-etudes-en
- Fichier sciences 6e/5e indexé : https://files.minesec.gov.cm/2d/sciences.pdf
- Enseignement à distance candidat : https://minesec.schoolfaqs.net/learn/mathematics/form-one
- Portail vidéo institutionnel : https://vod.minesec.gov.cm/

Les catalogues et le fichier sciences ont expiré en accès direct ; les résultats indexés
ne suffisent pas à certifier l'édition applicable ou à calculer une empreinte du PDF.
Ne pas intégrer une copie tierce comme document authentifié. Poursuivre les chemins institutionnels.
CEDUC : identité camerounaise non établie ; ne pas confondre automatiquement CEDUC, CAMEDU et les homonymes.
