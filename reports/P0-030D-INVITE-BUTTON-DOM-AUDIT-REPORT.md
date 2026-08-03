# P0-030D-INVITE-BUTTON-DOM-AUDIT-REPORT

## Élève trouvé
❌ NON TROUVÉ. L'élève "P0-030 TEST STUDENT" n'existe pas dans le tableau.

## HTML ligne élève
N/A (L'élève n'existe pas).

## Boutons détectés
N/A

## Action invitation trouvée
N/A

## Problème exact
L'élève n'a pas été créé avec succès lors du test précédent. L'analyse du code source (`Students.tsx`) révèle que le formulaire de création d'élève exige la sélection d'une **Classe** (`<select required>`). 
Dans le script Playwright, aucune classe n'était sélectionnée. La soumission a donc été bloquée silencieusement par la validation HTML5 native du navigateur sans générer d'erreur explicite, et l'élève n'a jamais été enregistré dans Firestore.
Puisque l'élève n'a pas été créé, la ligne n'a pas pu être trouvée, ce qui a causé le `Timeout` lors de la recherche du bouton "Inviter le parent".

Par ailleurs, l'analyse du DOM de la page (pour les autres élèves présents) montre que le bouton d'invitation existe bien sur chaque ligne, et qu'il possède exactement l'attribut `title="Inviter le parent"`. Le sélecteur original utilisé dans le script E2E était donc **parfaitement correct**.

## Correctif minimal proposé
Dans tout futur script d'automatisation Playwright, il faut impérativement sélectionner une classe pour satisfaire la validation HTML5 :
```javascript
await ownerPage.locator('div.form-group:has-text("Classe") >> select').selectOption({ index: 1 });
```

## Verdict
BOUTON ABSENT (L'élève "P0-030 TEST STUDENT" n'a jamais été créé à cause d'un échec de validation HTML5 sur le champ "Classe").
