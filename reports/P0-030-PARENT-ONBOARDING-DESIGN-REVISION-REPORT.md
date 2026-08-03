# P0-030-PARENT-ONBOARDING-DESIGN-REVISION-REPORT

## Nouvelle architecture
Le système abandonne l'approche d'encodage simple au profit d'un mécanisme de **jetons cryptographiques côté base de données**, géré par une nouvelle collection Firestore `parent_invitations`. 
Ce changement structurel garantit une vérifiabilité absolue, une expiration contrôlée, et l'impossibilité de créer des comptes parasites.

1. **Collection `parent_invitations` :** Agit comme un registre d'état (state machine). Les invitations peuvent être `pending`, `used`, ou `expired`.
2. **Lien de redirection sécurisé :** L'URL n'expose plus de données personnelles, uniquement l'ID du document Firestore généré (un UUID imprédictible). Ex: `/#/parent-signup?inviteId=xyz123`.
3. **Transaction de compte atomique :** Lors de l'inscription, l'application exécute un `writeBatch` pour créer le profil utilisateur `users/{uid}` et marquer l'invitation comme `used` simultanément, empêchant les attaques de type *race condition*.

## Firestore
**Structure de la collection `parent_invitations` :**
```json
{
  "id": "inv_123456789",
  "schoolId": "school-alpha-001",
  "studentId": "stu_001",
  "parentEmail": "parent@gmail.com",
  "parentName": "Jean Dupont",
  "status": "pending", // "pending" | "used" | "expired"
  "createdAt": "2026-06-22T08:00:00Z",
  "expiresAt": "2026-07-22T08:00:00Z", // +30 jours
  "createdBy": "uid_secretaire",
  "usedAt": null,
  "usedBy": null
}
```

## Règles sécurité
Les règles de sécurité (`firestore.rules`) sont le cœur de ce système :

1. **`parent_invitations` :**
   - **Admins (Owner/Director/Secrétaire)** : Peuvent créer, lire et expirer les invitations liées à leur `schoolId`.
   - **Public (`allow get`)** : N'importe qui possédant l'ID exact peut lire le document **uniquement si** le `status` est `'pending'` (nécessaire pour afficher le formulaire de la page `/parent-signup`).
   - **Nouveau Parent (`allow update`)** : Peut passer le statut de `'pending'` à `'used'` uniquement si son email authentifié correspond au `parentEmail` de l'invitation.

2. **`users` :**
   - La règle de création est enrichie pour permettre au Parent de créer son propre document.
   - **Validation croisée** : La règle effectue un `get()` vers le document d'invitation pour s'assurer que l'email de la session Firebase Auth correspond à l'email autorisé par l'école.
   ```javascript
   allow create: if isAuthenticated() && (
     isSuperAdmin() || isOwner() || 
     (
       request.auth.uid == userId && 
       request.resource.data.role == 'parent' &&
       get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.parentEmail == request.auth.token.email &&
       get(/databases/$(database)/documents/parent_invitations/$(request.resource.data.inviteId)).data.status == 'pending'
     )
   );
   ```

## UI
1. **Composant `ParentSignup.tsx`** :
   - À l'ouverture, lit `inviteId` dans l'URL.
   - Fetch le document `parent_invitations/{inviteId}`.
   - Si manquant ou non `pending`, affiche : *"Ce lien d'invitation est invalide ou a expiré."*
   - Si valide, affiche un formulaire avec le champ Email verrouillé et demande le nom complet + création de mot de passe.
2. **Page Élèves (`Students.tsx`)** :
   - Ajout d'une modale "Inviter le parent" avec saisie du nom du parent.
   - Lors de la génération, le document `parent_invitations` est poussé sur Firestore.
   - L'interface génère le message WhatsApp incluant le lien d'invitation sécurisé.

## Flux utilisateur
1. Le staff de l'école (Secrétaire/Directeur) ouvre un élève et clique sur "Inviter le parent".
2. Un document d'invitation est inséré dans Firestore.
3. Un lien WhatsApp est généré et envoyé au parent.
4. Le parent clique sur le lien et atterrit sur la page sécurisée `/parent-signup`.
5. La page valide l'invitation et affiche l'e-mail du parent en lecture seule.
6. Le parent entre son mot de passe.
7. L'application :
   - Appelle `createUserWithEmailAndPassword`.
   - Exécute un *batch Firestore* pour créer `users/{uid}` et mettre à jour l'invitation à `status: 'used'`.
8. Le parent est logué, l'`AppContext` détecte son rôle et le route vers le portail parent.
9. Le portail parent affiche son enfant via la correspondance stricte de `parentEmails[]`.

## Tests
- **Test 1 - Invitation valide :** Le flux normal fonctionne, le parent est créé, l'invitation marquée `used`.
- **Test 2 - Invitation expirée / utilisée :** La page `/parent-signup` bloque l'affichage du formulaire, aucune création Firebase n'est possible.
- **Test 3 - Sécurité URL :** Tentative de retirer ou altérer `inviteId` depuis l'URL bloque le chargement.
- **Test 4 - Forçage d'e-mail (Hacking) :** Si un attaquant utilise l'API Firebase pour s'inscrire avec un autre email puis tente d'utiliser une `inviteId` valide pour créer son profil `users`, la règle Firestore bloquera car `request.auth.token.email != invitation.parentEmail`.
- **Test 5 - Accès portail :** Le parent tout juste inscrit voit immédiatement la fiche de son enfant.
- **Test 6 - Rétrocompatibilité :** Les parents pré-existants gardent leurs accès.

## Risques
- **Échec réseau pendant le Batch Firestore :** Le compte Auth pourrait être créé sans que le document `users` ou l'update de `parent_invitations` ne passe. 
  - *Atténuation :* Si le compte Auth existe mais sans profil `users`, le parent ne peut rien faire. S'il tente de se réinscrire, "email already in use". Dans ce cas marginal, l'école devra réinitialiser le mot de passe manuellement ou nous devrons gérer un nettoyage Firebase Functions (non disponible ici, donc on assumera le blocage).

## Verdict

- **PLAN APPROUVÉ** (En attente de confirmation finale).

> [!IMPORTANT]
> Ce plan révisé verrouille complètement le système d'onboarding. Il est conforme aux standards d'invitation par jeton unique et résout toutes les vulnérabilités soulevées (bruit dans la base de données, expiration, usurpation). 
> Veuillez confirmer ce plan pour que je débute l'implémentation.
