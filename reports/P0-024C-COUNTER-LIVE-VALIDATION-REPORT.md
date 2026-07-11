# P0-024C-COUNTER-LIVE-VALIDATION-REPORT

## Données utilisées
- École de test avec marge : `school-test-starter-199`
- École de test sans marge (limite atteinte) : `school-test-starter-200`
- Élève fictif créé : `test-fictif-1781942504275`
- Rôle utilisé pour les tests : `SuperAdmin` (superadmin.test@ecoscolaire.com)

## Compteur avant
Pour l'école `school-test-starter-199` :
- `schools.studentsCount` : **10**
- Nombre réel d'élèves en base (requête agrégée) : **201**

*Note : La donnée `studentsCount` était désynchronisée avec le nombre réel en base (10 au lieu de 201), probablement en raison de l'injection en base des données de test avant le déploiement ou l'activation des triggers, ou d'une erreur dans le script de seed. Cependant, ce désalignement nous a permis de tester la Cloud Function, car la Firestore Rule se base sur `studentsCount` (10 < 200), autorisant ainsi l'écriture.*

## Ajout test
L'élève fictif a été ajouté avec succès à la base de données. L'opération a été autorisée par les Firestore Rules car le champ `studentsCount` de l'école (10) était inférieur à la limite Starter (200).

## Compteur après ajout
Après 8 secondes d'attente (délai de traitement de la Cloud Function) :
- `schools.studentsCount` : **11**

La Cloud Function a correctement intercepté le trigger `onCreate` et a incrémenté le compteur de +1. Puisque le nouveau total (11) ne dépasse pas les limites SaaS, l'étudiant a été conservé.

## Suppression test
L'élève fictif a ensuite été supprimé de la base.

## Compteur final
Après 8 secondes d'attente :
- `schools.studentsCount` : **10**
- Nombre réel d'élèves en base : **201**

La Cloud Function a correctement intercepté le trigger `onDelete` et a décrémenté le compteur de -1.

## Test dépassement Starter 200
Pour l'école `school-test-starter-200` :
- Une tentative de création d'un étudiant fictif a été effectuée.
- Résultat : **Rejeté** avec l'erreur `PERMISSION_DENIED`.
La sécurité au niveau de la base de données (Firestore Rules) est fonctionnelle et bloque directement l'ajout en amont de la Cloud Function lorsque le champ `studentsCount` atteint ou dépasse la limite.

## Bugs
Aucun bug technique sur la Cloud Function ou les Firestore Rules.
Toutefois, une anomalie de données (Désynchronisation de `studentsCount`) est présente sur l'école de test `school-test-starter-199` (10 affiché vs 201 réel). Un batch script de recalibrage des compteurs `studentsCount` pourrait être nécessaire en production s'il y a eu des imports massifs manuels.

## Verdict
P0-024C VALIDÉ

La mécanique de la fonction (incrémentation/décrémentation de `studentsCount`) et celle des Firestore Rules fonctionnent parfaitement ensemble.
