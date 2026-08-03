# P0-023-WHATSAPP-AUDIT

## Audit Firestore

Après l'inspection des types et du code, voici comment les données sont modélisées :
* **`students`** : La collection principale où sont stockées les informations de contact. On y trouve directement les champs `parentName` et `parentPhone`. Le numéro n'a pas de contrainte stricte dans la base (il peut contenir des espaces ou des préfixes comme `+237`).
* **`users`** : Les parents ont un compte utilisateur (`role: 'parent'`) contenant un tableau `studentIds`. Toutefois, pour la relance, il n'est pas nécessaire de faire une jointure avec `users`, car le contact est dénormalisé dans le document de l'élève.
* **`payments`** : Stocke l'historique. Le montant restant dû n'est pas un champ statique de l'élève, mais calculé à la volée (`feeT1` - somme des `payments` associés à `T1`).

## Audit écrans

Trois écrans principaux ont été audités :
1. **`Finance.tsx` (Payments.tsx)** : L'onglet "Bilan Scolarité" (`activeTab === 'bilan'`) affiche déjà un tableau récapitulatif avec l'élève, les paiements par tranche et le "Reste à Payer" (en rouge).
2. **`Students.tsx`** : Affiche la liste des élèves avec une colonne "Contact", mais ne montre pas les impayés directement.
3. **`ParentPortal.tsx`** : Destiné au parent lui-même, il affiche les blocages, mais n'est pas l'interface pour la secrétaire/comptable.

## Données disponibles

Pour générer le message, nous disposons en temps réel (dans le contexte de la boucle d'affichage) de :
* `school.name` : Le nom de l'école (ex: Groupe Scolaire Bilingue ITALO).
* `student.parentName` : Le nom du parent.
* `student.parentPhone` : Le numéro de téléphone cible.
* `student.name` : Le nom de l'élève.
* `totalBalance` / `reste` : Le montant exact restant à payer.
* La nature de l'impayé (Scolarité Tranche 1/2/3, Transport, ou Tenues).

## Message WhatsApp proposé

Modèle générique généré dynamiquement :
```text
Bonjour M./Mme {parentName},

Nous vous rappelons qu'un solde de {reste} FCFA reste dû pour la {motif} de l'élève {studentName}.

Merci de prendre contact avec l'administration pour régulariser la situation.

Cordialement,
L'administration - {schoolName}
```
*(Le texte sera encodé via `encodeURIComponent` pour l'URL `wa.me/`)*

## UX recommandée

**Option C : Bouton WhatsApp dans Finance (Onglet "Bilan Scolarité").**
* **Pourquoi :** C'est le tableau de bord naturel de l'administration/comptabilité pour suivre les impayés. La comptable repère une ligne rouge ("Reste à Payer: X FCFA"), et l'action de relance doit se trouver immédiatement à côté.
* **Intégration visuelle :** Dans `Payments.tsx`, au niveau du tableau `bilan`, ajouter un bouton vert discret (icône Message/WhatsApp) dans la colonne "Reste à Payer" (ou une nouvelle colonne "Action") qui n'apparaît que si le solde est `> 0` et que `parentPhone` est renseigné.

## Fichiers à modifier

1. **`src/pages/Payments.tsx`**
   * Modification de la vue du tableau Bilan (`bilanType === 'tuition' | 'transport' | 'uniforms'`).
   * Ajout de l'icône WhatsApp et du gestionnaire d'événement ouvrant le lien `wa.me`.
2. **(Optionnel) Fichier utilitaire `src/utils/whatsapp.ts`**
   * Création d'une fonction de formatage pour nettoyer les numéros avant génération du lien.

## Risques

* **Format du numéro (`parentPhone`) :** Les numéros saisis manuellement peuvent contenir des espaces, des tirets, ou manquer l'indicatif pays (`+237`). Un lien `wa.me/699000000` (sans indicatif) échouera.
  * *Mitigation :* Implémenter une fonction de nettoyage qui retire tous les caractères non numériques et ajoute `237` si le numéro commence par `6` et fait 9 chiffres.
* **Absence de numéro :** Le champ `parentPhone` est optionnel (`?: string`).
  * *Mitigation :* Le bouton WhatsApp ne doit pas être rendu ou doit être désactivé si la propriété est vide ou invalide.
* **Spam involontaire :** La comptable pourrait cliquer deux fois. Cependant, comme cela ouvre l'application WhatsApp (où l'utilisateur doit valider l'envoi), ce risque est nul côté système.

## Plan d'implémentation

1. **Créer une fonction de nettoyage du numéro :**
   ```typescript
   const formatPhoneForWhatsApp = (phone: string) => {
     let cleaned = phone.replace(/\D/g, ''); // Garder uniquement les chiffres
     if (cleaned.length === 9 && cleaned.startsWith('6')) {
       cleaned = '237' + cleaned;
     }
     return cleaned;
   };
   ```
2. **Ajouter l'interface UI dans `Payments.tsx` (Onglet Bilan) :**
   * Dans la méthode de rendu des lignes `<tbody>`, repérer `totalBalance > 0`.
   * Insérer un bouton `<button>` ou une icône cliquable avec la couleur `#25D366` (WhatsApp).
   * L'événement `onClick` appellera `window.open('https://wa.me/{numero_formate}?text={message_encode}', '_blank')`.
3. **Tester les cas limites :**
   * Élève sans numéro de téléphone (bouton caché).
   * Numéro avec format local (ex: `6 77 00 00 00`).
   * Différents contextes de dettes (Transport vs Scolarité).
