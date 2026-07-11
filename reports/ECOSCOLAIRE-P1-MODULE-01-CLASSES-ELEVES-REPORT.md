# ECOSCOLAIRE-P1-MODULE-01-CLASSES-ELEVES-REPORT

## 1. MODULE: CLASSES

**Compte utilisé :** `owner.alpha@ecoscolaire.com`

### 1.1 Vérification des classes seedées
* **URL :** `/#/classes`
* **Action exécutée :** Ouverture du module Classes et vérification du menu déroulant de sélection.
* **Résultat attendu :** Les classes seedées apparaissent.
* **Résultat obtenu :** 36 classes trouvées dans le menu déroulant (Alpha).
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-CLASSES-SEED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ**

### 1.2 Création, Modification, Suppression d'une classe
* **URL :** `/#/classes`
* **Action exécutée :** Recherche des boutons "Créer", "Ajouter", "Modifier", "Supprimer" pour la classe de test.
* **Résultat attendu :** Possibilité de créer, modifier et supprimer une classe.
* **Résultat obtenu :** L'interface 'Classes' est uniquement en mode lecture (Vue d'ensemble). Aucun bouton d'ajout, de modification ou de suppression de classe n'est présent dans le DOM. Seul un bouton "Réparer les classes manquantes" existe pour le seeding d'urgence.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-CLASSES-NO-ACTIONS.png`
* **Erreurs console :** Aucune.
* **Verdict :** **NON VALIDÉ** (Limitation de l'interface actuelle).

---

## 2. MODULE: ÉLÈVES

**Compte utilisé :** `owner.alpha@ecoscolaire.com`

### 2.1 Vérification des élèves seedés
* **URL :** `/#/students`
* **Action exécutée :** Ouverture du module Élèves et lecture du tableau.
* **Résultat attendu :** Les élèves seedés apparaissent.
* **Résultat obtenu :** 21 élèves listés dans le tableau principal.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-STUDENTS-SEED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ**

### 2.2 Création d'un nouvel élève de test
* **URL :** `/#/students`
* **Action exécutée :** Clic sur "Ajouter", remplissage du formulaire (Test Student 999, MAT-999), et soumission.
* **Résultat attendu :** Le nouvel élève est créé et affiché dans le tableau.
* **Résultat obtenu :** L'élève apparaît immédiatement dans le tableau avec les données saisies.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-STUDENTS-CREATED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ**

### 2.3 Modification de l'élève de test
* **URL :** `/#/students`
* **Action exécutée :** Clic sur l'icône Modifier (Edit2) de la ligne de l'élève, changement du nom en "Test Student 999 Modified", et enregistrement.
* **Résultat attendu :** La modification est enregistrée et visible.
* **Résultat obtenu :** La modification a été prise en compte avec succès dans l'interface (mise à jour réactive).
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-STUDENTS-MODIFIED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ**

### 2.4 Suppression de l'élève de test
* **URL :** `/#/students`
* **Action exécutée :** Clic sur l'icône Supprimer (Trash2) de la ligne de l'élève, validation du dialogue de confirmation de suppression.
* **Résultat attendu :** L'élève disparaît du tableau.
* **Résultat obtenu :** L'élève a été supprimé avec succès et n'est plus présent dans la liste.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-STUDENTS-DELETED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ**
