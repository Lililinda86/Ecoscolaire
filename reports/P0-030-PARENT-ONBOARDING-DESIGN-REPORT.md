# P0-030-PARENT-ONBOARDING-DESIGN-REPORT

## Architecture
Le parcours d'invitation parent sera entièrement géré côté client (SaaS sans backend additionnel) en s'appuyant sur Firebase Auth et Firestore. L'architecture se décline ainsi :
1. **Génération du Lien :** Depuis la fiche de l'élève (ou la modale de l'élève), un bouton "Inviter le parent" obfusque les données essentielles (email du parent, `schoolId`, nom de l'élève) en Base64 pour créer un lien propre : `https://ecoscolaire-ghd6.vercel.app/#/parent-signup?token={base64}`.
2. **Nouvelle Route Publique :** Création d'une page `ParentSignup.tsx` accessible sans authentification.
3. **Création du Compte :** Le composant `ParentSignup` extrait l'email (verrouillé) et demande un mot de passe. Il appelle `createUserWithEmailAndPassword`, puis crée le document Firestore dans `/users/{uid}`.
4. **Mise à jour des Règles :** `firestore.rules` sera modifié pour autoriser un utilisateur nouvellement authentifié à créer **son propre document** dans `users`, **à la condition stricte** que son `role` soit `'parent'`.

## Flux utilisateur
1. Le directeur ou la secrétaire clique sur le bouton **"Inviter par WhatsApp"** ou **"Copier le lien"** depuis le profil de l'élève.
2. L'application génère un message WhatsApp pré-rempli : *"Bonjour, voici votre lien pour suivre la scolarité de [Nom de l'enfant]. Cliquez ici : [Lien]"*.
3. Le parent clique sur le lien sur son téléphone et atterrit sur la page `/parent-signup`.
4. La page affiche : "Inscription Parent pour [Nom de l'École]". Le champ "Email" est pré-rempli et grisé. Le parent renseigne "Nom complet", "Mot de passe" et "Confirmer le mot de passe".
5. Le parent clique sur "Créer mon compte".
6. Le compte Auth et le document `users` sont créés.
7. Le parent est redirigé vers `/`. `AppContext` détecte le rôle `parent` et le redirige automatiquement vers le portail parent.
8. Le portail parent affiche l'enfant (grâce au système `parentEmails[]` déjà en place via P0-029).

## Sécurité
- L'email du parent est imposé par l'URL et **non modifiable** sur le formulaire d'inscription. L'inscription s'effectuera bien avec l'email autorisé par l'école.
- Une fois le compte créé sur Firebase Auth, aucune autre personne ne peut utiliser cet email (Firebase Auth renverra une erreur `auth/email-already-in-use`).
- Si le parent oublie son mot de passe plus tard, il pourra utiliser la fonction standard de récupération de mot de passe (si implémentée) ou demander à l'école.

## Firestore
Pour que le parent puisse s'enregistrer sans intervention backend, nous devons autoriser l'auto-inscription dans la collection `users`. 
**Modification prévue dans `firestore.rules` :**
```javascript
// --- USERS ---
match /users/{userId} {
  // Actuellement: isSuperAdmin() || isOwner() || ...
  allow create: if isAuthenticated() && (
    isSuperAdmin() || isOwner() || 
    (request.auth.uid == userId && request.resource.data.role == 'parent')
  );
}
```
*Note de sécurité :* Même si un attaquant devine l'URL et force la création d'un compte parent pour un faux email, il n'aura accès à **aucune donnée** (zéro élève, zéro note) car son email ne figurera dans aucun tableau `parentEmails[]` validé par l'école.

## UI
1. **Composant `ParentSignup.tsx`** : Un formulaire clair, moderne, en pleine page avec le logo de l'application, optimisé pour mobile (puisque la majorité des clics viendront de WhatsApp).
2. **Page Élèves / Formulaire Élève** : Ajout d'une section "Parents" dans les actions rapides d'un élève avec le bouton "Envoyer invitation WhatsApp".

## Tests
- **Test 1 :** Génération du lien depuis un compte Owner et vérification de la payload Base64.
- **Test 2 :** Ouverture du lien dans une session anonyme, vérification du blocage de l'email.
- **Test 3 :** Création du compte, vérification de l'insertion dans la collection `users` malgré les règles Firestore restrictives.
- **Test 4 :** Redirection immédiate et affichage correct du portail parent.
- **Test 5 :** Tentative de réutilisation du même lien (doit échouer).

## Risques
1. **Manipulation de l'URL (Base64) :** Un utilisateur avancé pourrait décoder le Base64, changer l'email, le ré-encoder et s'inscrire.
   *Mitigation :* S'il s'inscrit avec un autre email (ex: `hacker@test.com`), il créera un compte "coquille vide" sans aucun enfant lié. Ce n'est pas une faille de données, juste du "bruit" dans la DB.
2. **Le parent modifie son email plus tard :** Si le parent changeait son email Auth, il perdrait le lien avec l'élève (puisque `parentEmails` utilise l'email d'origine).
   *Mitigation :* La modification d'email n'est pas exposée dans le portail parent actuellement.

## Verdict
L'architecture proposée est **100% réalisable, sécurisée, et s'intègre parfaitement avec le système de "Soft Link" par email (P0-029) tout juste déployé.** Elle ne nécessite aucun backend Node.js additionnel.

> [!IMPORTANT]
> AVIS REQUIS : Veuillez valider ce plan d'implémentation avant que je ne commence à écrire le code. Êtes-vous d'accord avec le fait que l'encodage de l'URL soit un simple Base64 (au lieu d'un vrai JWT cryptographique), sachant que l'usurpation d'un autre email ne donne accès à aucune donnée ?
