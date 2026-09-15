# Revue primaire : preuves et limites des correspondances

## Corpus et niveaux

Uniquement les six PDF MINEDUB déjà authentifiés dans `minedubVerified.ts`.
Aucun téléchargement nouveau ni recherche générale. Couvertures relues visuellement :
édition 2018, même si le nom du fichier contient 2019.

| Sous-système | Classes nommées sur la couverture | Document existant |
|---|---|---|
| FR | SIL, CP | minedub-fr-primary-1 |
| FR | CE1, CE2 | minedub-fr-primary-2 |
| FR | CM1, CM2 | minedub-fr-primary-3 |
| EN | Class 1, Class 2 | minedub-en-primary-1 |
| EN | Class 3, Class 4 | minedub-en-primary-2 |
| EN | Class 5, Class 6 | minedub-en-primary-3 |

Les 12 rattachements restent à forte confiance. Cela ne certifie pas l'applicabilité
intégrale du curriculum en 2026-2027. Aucune décision owner prise par cette analyse.

## Audit des 76 correspondances sûres

Les 42 EXACT sont des libellés identiques dans le même tenant, cycle primaire et
sous-système. Les alias ci-dessous sont strictement documentaires et contextualisés :
ils ne certifient jamais la totalité du contenu enseigné dans une matière locale.

| Section | Matière locale vers discipline du document | Nombre | Conclusion |
|---|---|---:|---|
| FR | Français vers Langue française (SIL/CP seulement) | 2 | SAFE_ALIAS |
| FR | Anglais vers English language | 6 | SAFE_ALIAS |
| FR | Mathématiques vers Initiation aux mathématiques (SIL/CP) | 2 | SAFE_ALIAS |
| FR | Sciences et technologie vers Initiation aux sciences et à la technologie (SIL/CP) | 2 | SAFE_ALIAS |
| FR | Informatique et TIC vers Technologies de l'information et de la communication | 6 | SAFE_ALIAS |
| FR | Sciences et technologie vers Sciences et technologies (niveaux 2/3) | 4 | SAFE_ALIAS |
| EN | French vers Français | 6 | SAFE_ALIAS |
| EN | Information and Communication Technology vers Information and Communication Technologies | 6 | SAFE_ALIAS |

34 alias conservés, 0 déclassement, aucun alias lexical approximatif ajouté.
Français vers Français et littérature n'est PAS promu : le contenu local de
littérature reste inconnu. English Language vers English Language and Literature
n'est PAS une équivalence globale : voir composante ci-dessous.

## Les 44 dossiers à examiner

| Classes | Domaine | Dossiers | Preuve ciblée / limite |
|---|---|---:|---|
| SIL, CP | Sciences humaines et sociales | 2 | Sommaire PDF p.6 : citoyenneté/morale comme composantes ; Histoire/Géographie non nommées à ce niveau |
| CE1, CE2, CM1, CM2 | Sciences humaines et sociales | 4 | Sommaire PDF p.6 : histoire, géographie, citoyenneté/morale comme composantes, jamais domaine entier |
| CE1, CE2, CM1, CM2 | Français et littérature | 4 | Sommaire PDF p.5 : langue et littérature ; portée du Français local inconnue |
| Six classes FR | Éducation artistique | 6 | PDF p.6 : arts visuels, musique, arts dramatiques, danse ; périmètre local à confirmer |
| Six classes FR | Développement personnel | 6 | PDF p.6 : artisanat, agropastoral, domestique ; aucune équivalence automatique avec morale/santé |
| Class 3 à 6 | English Language and Literature | 4 | PDF p.24 et figure 3, niveaux II/III : composante langue distincte de la littérature |
| Class 1 à 6 | Vocational Studies | 6 | PDF p.32 niveau I, p.31 niveaux II/III : composantes pratiques, restriction au niveau I ; Practical Skills local à préciser |
| Class 1 à 6 | Arts | 6 | PDF p.33 niveau I, p.32 niveaux II/III : arts visuels et spectacle ; Creative Arts local à préciser |
| Class 1 à 6 | Physical Education and Sports | 6 | PDF p.35 niveau I, p.34 niveaux II/III : ensemble physique/sports ; périmètre Physical Education local inconnu |

10 dossiers possèdent au moins une relation de composante documentée ; 34 restent
sans relation locale suffisamment précise. Ces 10 dossiers ne sont pas entièrement
résolus : certaines autres candidates restent ambiguës et le choix ITALO demeure
humain. **44 choix locaux encore nécessaires avant les décisions owner**, pas 34.

Les types sont comptés par relation candidate, non par dossier : 42 EXACT,
34 SAFE_ALIAS, 18 COMPONENT_OF_OFFICIAL_DOMAIN, 56 UNRESOLVED. Cela fait 150
relations candidates pour 120 dossiers classe/domaine. Aucun type multi-domaines,
matière locale autonome ou non applicable n'est inventé sans preuve du périmètre ITALO.

## Versions et sécurité

`primary-documentary-relations-v1` entre dans le hash `mappingVersion` recalculé
côté serveur. Les anciennes décisions restent attachées à leur ancienne version,
sans migration, réinterprétation ni suppression. La relation sélectionnée est
conservée dans le document de décision et son historique ; l'audit porte la version.
Les niveaux et les sources ne changent pas de version.

Les transactions relisent rôle owner, tenant, année active courante et catalogue.
La revue primaire affiche les métadonnées techniques dans les détails. Aucun
enseignement, horaire, coefficient, affectation, préparation ou adoption créé.
Préscolaire et secondaire : sources et propositions inchangées, hors validation groupée.

OPENAI CALLS: 0
PRODUCTION TOUCHED: NO
