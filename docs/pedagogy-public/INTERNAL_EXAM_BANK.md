# Banque interne — mode secrétaire

Dans Pédagogie → Banque d’épreuves, choisir l’année et la classe puis filtrer
par matière, titre ou date. La section/langue vient de la classe configurée.
Les entrées proviennent des évaluations existantes de cet établissement :
génération réussie, validation enseignant enregistrée et statut validé/prêt
à imprimer. Les brouillons, révisions invalidées et archives ne sont pas inclus.
L’historique des anciennes révisions reste distinct ; cette banque présente
uniquement la révision courante validée de chaque évaluation.

Consulter affiche le sujet élève. Le sélecteur Exemplaire permet au personnel
habilité de consulter le corrigé interne. Imprimer utilise le rendu A4 existant
et permet l’enregistrement PDF par le navigateur. Une nouvelle utilisation
conserve le filigrane de relecture : la validation historique ne vaut pas accord
pour une autre classe, une autre semaine ou un programme modifié.

Les corrigés peuvent avoir été générés puis relus ; ils ne sont jamais présentés
comme des corrigés authentifiés d’un examen officiel. Les références aux
préparations, la date, la version et la couverture partielle restent visibles.
Vérifier les droits avant toute redistribution externe des créations internes.

Accès : super administrateur, propriétaire, direction et secrétariat, dans
l’établissement autorisé. Les règles serveur existantes protègent également
les questions/corrigés ; aucun droit parent, élève ou observateur n’est ajouté.
La banque est en lecture seule : aucun appel IA, nouvelle validation, note,
copie automatique ou décision pédagogique. Le préscolaire garde son parcours
d’activités et observations, sans épreuves numériques imposées.

Les lectures sont paginées côté Firestore, limitées à 500 évaluations par
classe/année ; dépassement ou erreur affiche une indisponibilité explicite,
pas un total tronqué. L’affichage utilise des pages de 25 résultats.
Changer d’établissement/année/classe masque immédiatement le contenu précédent.

Fonds externe : les annales officielles et leurs corrigés authentifiés ne sont
pas intégrés tant que source et droits ne sont pas établis. Une banque interne
sans épreuve validée reste honnêtement vide ; aucun visa humain n’est fabriqué.
