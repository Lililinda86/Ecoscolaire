# ECOSCOLAIRE-STAFF-SECURITY-FORENSIC-REPORT

**Objectif :** Déterminer précisément l'étendue de la faille de sécurité sur la route `/staff` avec un compte Enseignant (Teacher).
**Protocole :** Aucune modification de code. Exécution via un script Playwright qui intercepte le DOM, le Network et la Console.

---

## 1. PREUVES D'EXÉCUTION ET RENDU UI

*   **Composant Staff rendu ?** : OUI (`isStaffComponentRendered: true`).
*   **Tableau visible ?** : OUI (`isTableVisible: true`).
*   **Données affichées ?** : OUI. La ligne du "Testeur Personnel" est bien visible avec son rôle et sa classe.
*   **Actions visibles ?** : OUI. Les boutons "Ajouter", "Modifier", "Supprimer" sont parfaitement cliquables car aucune condition `currentUser.role` ne les masque dans le composant `Staff.tsx`.

## 2. RÉSULTATS DES TENTATIVES CRUD (Optimistic UI vs Backend)

**Le Teacher a pu simuler un CRUD complet dans l'interface.**

1.  **Ajout ("Hacker Teacher")**
    *   Résultat UI : Affiché instantanément dans le tableau (`isAddedInUI: true`).
2.  **Modification ("Hacker Modified")**
    *   Résultat UI : Affiché instantanément (`isModifiedInUI: true`).
3.  **Suppression**
    *   Résultat UI : Ligne disparue de l'interface.

## 3. LOGS CONSOLE ET NETWORK (La vérité Backend)

Dès que le Teacher a validé un formulaire (déclenchant la fonction `saveDB`), la console a intercepté :
> `Sync Error: FirebaseError: Missing or insufficient permissions.`

Le Network confirme que les requêtes de "Write" envoyées à Firestore via les WebSockets (channel) ont été traitées, mais Firestore les a **bloquées**.

## 4. PERSISTANCE (Preuve de la défense Backend)

Lors du rafraîchissement de la page (F5) :
*   **isAddedVisible** : `false`
*   **isModifiedVisible** : `false`

Les modifications du Teacher ont toutes été effacées. 

---

## 5. QUALIFICATION DE LA VULNÉRABILITÉ ET VERDICT

**VERDICT : CAS C (Mixte CAS A)**

*   **Côté Backend (Sécurisé) :** La base de données est impénétrable pour le Teacher. La règle `canManagePedagogy()` définie dans `firestore.rules` rejette efficacement toutes les tentatives de modifications non autorisées.
*   **Côté Frontend (Vulnérabilité UX & Accès) :** Le Teacher n'est pas bloqué par la route. Mieux encore, l'interface lui laisse croire qu'il a le droit de modifier le personnel. L'UI se met à jour localement (Optimistic Update) avant que Firestore ne rejette la requête en arrière-plan (sans afficher d'erreur claire à l'écran). L'enseignant accède donc en lecture libre à des informations administratives qu'il ne devrait peut-être pas voir (ou du moins pas administrer).

**Conclusion :** 
La sécurité des données (intégrité) est **intacte**. 
L'accès à l'interface (routing) et l'expérience utilisateur (boutons visibles sans droits, erreurs silencieuses) sont **défectueux**. La correction nécessitera uniquement d'ajouter le `allowedRoles` dans `App.tsx` pour interdire l'accès pur et simple.
