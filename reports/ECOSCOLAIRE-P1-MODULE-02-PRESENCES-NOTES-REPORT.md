# ECOSCOLAIRE-P1-MODULE-02-PRESENCES-NOTES-REPORT

## 1. MODULE: PRÉSENCES (ATTENDANCE)

**Compte utilisé :** `teacher1.alpha@ecoscolaire.com`

### 1.1 Vérification des présences seedées
* **URL :** `/#/attendance`
* **Action exécutée :** Ouverture du module Présences et vérification du tableau des élèves du jour.
* **Résultat attendu :** Les lignes d'élèves apparaissent pour la prise de présence.
* **Résultat obtenu :** 21 lignes d'élèves listées et prêtes à être pointées.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-ATTENDANCE-SEED.png`
* **Erreurs console :** Aucune à ce stade.
* **Verdict :** **VALIDÉ**

### 1.2 Modification et Persistance d'une présence
* **URL :** `/#/attendance`
* **Action exécutée :** Clic sur un bouton d'action de présence (Présent/Absent) pour un élève, puis rafraîchissement de la page.
* **Résultat attendu :** La présence est modifiée et persiste après le rechargement de l'application.
* **Résultat obtenu :** La modification est visible dans l'interface et persiste après le rechargement (sauvegarde IndexedDB locale réussie).
* **Capture écran (Modifié) :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-ATTENDANCE-MODIFIED.png`
* **Capture écran (Rafraîchi) :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-ATTENDANCE-REFRESH.png`
* **Erreurs console :**
  > `Sync Error: FirebaseError: Function setDoc() called with invalid data. Unsupported field value: undefined (found in field reason in document attendance/alpha-att-1)`
  *(Bien que l'état local soit persistant, la synchronisation Firestore échoue en arrière-plan car le champ `reason` est "undefined").*
* **Verdict :** **PARTIELLEMENT VALIDÉ** (Persistance locale fonctionnelle, mais bug critique de synchronisation cloud détecté).

---

## 2. MODULE: NOTES (GRADES)

**Compte utilisé :** `teacher1.alpha@ecoscolaire.com`

### 2.1 Vérification des notes seedées
* **URL :** `/#/grades`
* **Action exécutée :** Ouverture du module Notes et vérification de l'historique.
* **Résultat attendu :** Les notes seedées (s'il y en a) apparaissent, l'interface se charge.
* **Résultat obtenu :** 0 notes trouvées par défaut. L'interface charge le formulaire.
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-GRADES-SEED.png`
* **Erreurs console :** Aucune.
* **Verdict :** **VALIDÉ** (Interface fonctionnelle et vide selon le seed actuel).

### 2.2 Création / Saisie d'une nouvelle note
* **URL :** `/#/grades`
* **Action exécutée :** Sélection d'un élève dans le menu déroulant, clic sur le bouton "Saisir/Ajouter", tentative de remplissage des inputs de note.
* **Résultat attendu :** Une fenêtre/modale permet de saisir des notes et de les sauvegarder.
* **Résultat obtenu :** Le bouton "Ajouter" ouvre la modale, mais aucun champ de saisie (`input[type="number"]`) n'a pu être localisé par l'automate. L'interface ne présente pas les matières pré-remplies pour la saisie (probablement lié à l'absence de curriculum/matières définis pour la classe de l'élève sélectionné).
* **Capture écran :** `C:\Users\Linda LEMOFOUET\OneDrive\Desktop\école primaire\ECOSCOLAIRE-GRADES-MODIFIED.png` (État d'échec)
* **Erreurs console :** Aucune erreur console, mais blocage UI.
* **Verdict :** **NON VALIDÉ** (Impossible de saisir une note, dépendances de données de matières manquantes ou UI non interactive).
