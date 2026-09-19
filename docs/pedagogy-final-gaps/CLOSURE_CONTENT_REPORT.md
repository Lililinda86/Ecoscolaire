# Clôture pédagogique ciblée — contenu livré

Départ Staging : b7c92feb1a6f8aa4f2b2e379aa4ebd6192aebc5f (PR de référence #257).

## Préservation

Aucune écriture Firestore, aucune réapplication des 59 groupes / 448 enregistrements. Les 12 rattachements primaires, 94 relations, 8 programmes préscolaires, 40 activités et 134 notices restent inchangés. Les revues complémentaires sont versionnées dans le dépôt et affichées seulement si école, année, identifiant, empreinte source et version de mapping correspondent à la décision initiale.

## Décisions ITALO

20 initiales ; 0 résolue automatiquement ; 20 TRUE_OWNER_DECISION_REQUIRED dans 6 contextes. Lecture Staging du 19 septembre 2026 à 22:01 UTC : 34 classes, 97 matières, 13 programmes de classe, 38 rattachements, aucune spécialité technique et 2 affectations d’enseignant (primaire). Aucun des six contextes ne possède de rattachement disciplinaire ni de programme prouvant l’organisation demandée. Le catalogue global des matières ne prouve pas leur enseignement dans une classe.

La liste détaillée figure dans ITALO_DECISIONS.md. Six fiches de classe suffisent : options de 4e et 3e ; séries et disciplines de 2nde et Terminale ; combinaisons de Lower Sixth et Upper Sixth. Aucune matière, langue, option, série, combinaison, durée ni coefficient local créé.

Choix délégué distinct des 20 : reprise des 40 activités préscolaires en trois phases souples, classée ITALO_PEDAGOGICAL_CHOICE / ECOSCOLAIRE_PROPOSED_PROGRESSION. Proposition réversible, sans calendrier ministériel ni activité nouvelle comptée.

## Corpus annuel

289 couples documentaires connus : **0 complet ; 243 partiels ; 46 sans source définitive exploitable ; 0 sans première structuration ; 0 non applicable**.

| Segment | Couples | Partiels | Source inexploitable/manquante |
|---|---:|---:|---:|
| Préscolaire FR | 20 | 20 | 0 |
| Préscolaire EN | 20 | 20 | 0 |
| Primaire FR | 60 | 60 | 0 |
| Primaire EN | 60 | 60 | 0 |
| Secondaire FR | 61 | 40 | 21 |
| Secondaire EN | 68 | 43 | 25 |

84,08 % des couples documentaires disposent de contenu partiel ; **0 % sont certifiés annuellement complets**. 84,08 % ne mesure pas la proportion du programme annuel extraite. Le total des couples réellement obligatoires à ITALO reste indéterminable sans séries et combinaisons ; la Première est notamment hors dénombrement disciplinaire faute de périmètre fiable. Les 289 lignes ne sont pas une liste de matières à ouvrir.

286 nouvelles entrées : 204 synthèses avec objectifs/compétences et 82 index de modules sans objectifs extraits. 108 synthèses primaires hors mathématiques portent sur les objectifs communs d’un niveau de deux ans, pas sur les tableaux complets de chaque classe. Les programmes scannés de Sixth fournissent quatre cadres introductifs séparés et conditionnels.

Restent : tableaux détaillés par classe, leçons, évaluations, activités et ressources complémentaires ; détail des 82 modules indexés ; résolution des pièces non exploitables. PARTIAL inclut ces travaux : le zéro STRUCTURING_PENDING ne signifie pas extraction terminée. Aucune synthèse n’est présentée comme une leçon officielle complète.

Préscolaire : cinq domaines et une activité d’entrée par domaine et niveau. Les reprises offrent un fil de travail, sans prouver une couverture annuelle exhaustive des sous-domaines ni une équivalence officielle des niveaux locaux. Les observations devront guider les compléments utiles.

## Réserves et contradictions

Répartition des 63 anciennes réserves : OFFICIAL_PARTIAL 63 ; OFFICIAL_VERIFIED 0 ; ITALO_PEDAGOGICAL_CHOICE 0 ; PENDING_SOURCE 0 ; TRUE_OWNER_DECISION_REQUIRED 0. Les 20 choix, 8 insuffisances de source et 5 blocages secondaires sont des ensembles distincts, non soustraits à nouveau des 63.

8 enregistrements de contradiction sur 5 documents : 3 MINEDUB et 2 MINESEC (affectant 5 couples). 0 contradiction initiale résolue ; 8 UNRESOLVED. Comparaisons parfois internes à une même pièce, pas entre deux éditions. Les variantes informatiques Seconde A/C et Terminales littéraires/scientifiques sont DIFFERENT_SCOPE ; elles ne résolvent pas les anomalies d’autres documents. Voir CONTRADICTIONS.json.

44 pièces utilisées pour les ajouts : empreintes et bornes des pages vérifiées pour 286 entrées. Paraphrases référencées, aucun PDF republié. Les 8 pièces MINEDUB de la baseline restent authentifiées ; tableaux détaillés partiels. Aucune nouvelle source revendiquée après recherche ciblée. La réserve primaire sur les « nombres complexes » non définis est conservée, distincte des huit contradictions.

Ressources : 134 au départ et à l’arrivée ; 0 ajout ; 0 nouveau doublon. Droits de republication non accordés : liens et métadonnées uniquement ; réserves de droits initiales inchangées.

## Validation

7 tests ciblés PASS : comptage honnête, sources/version, isolation école/année, disciplines distinctes, absence de fausse équivalence, pièces litigieuses exclues. Le bilan de livraison précisera SHA final, URL, PR et gate consolidé après déploiement.

Les revues sont livrées dans le catalogue versionné, sans nouvelle adoption Firestore.
OPENAI CALLS: 0. PRODUCTION TOUCHED: NO.
READY FOR PRODUCTION AUTHORIZATION: NO.
