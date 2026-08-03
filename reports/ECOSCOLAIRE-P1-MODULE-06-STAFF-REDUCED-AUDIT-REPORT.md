# ECOSCOLAIRE-P1-MODULE-06-STAFF-REDUCED-AUDIT-REPORT

**Date d'audit** : 25 Juin 2026
**Périmètre** : Audit réduit (CRUD existant, permissions, multi-tenant)

---

## 1. CRUD PROPRIÉTAIRE (Owner)
**Statut : VALIDÉ**
*   **Accès** : L'Owner Alpha peut ouvrir le module Personnel.
*   **Création** : Un nouveau membre ("Testeur Personnel Alpha") a été créé avec succès.
*   **Modification** : Le nom a été mis à jour ("Testeur Personnel Modifié") avec succès.
*   **Persistance** : Les données survivent au rafraîchissement (Firestore IndexedDB).
*   **Suppression** : Le membre du personnel a pu être supprimé de la liste.

## 2. SÉCURITÉ ET PERMISSIONS (Role Guards)
**Statut : NON VALIDÉ (Vulnérabilité Mineure)**
L'audit a révélé une faille d'accès au niveau de la route frontend :
*   **Parent** : Bloqué avec succès. La logique du portail Parent redirige les parents vers l'accueil.
*   **Teacher** : L'accès par URL directe (`/#/staff`) n'est **PAS BLOQUÉ**. Le composant `Staff.tsx` s'affiche (le bouton "Ajouter" est même visible). 
*   **Limitation des dégâts** : Bien que le front-end permette l'accès, les règles Firestore (`firestore.rules`) empêchent un Teacher de modifier la collection `staff` (grâce à la fonction `canManagePedagogy`). Le Teacher ne peut donc pas enregistrer de données, mais il peut voir la liste et générer des erreurs silencieuses dans la console s'il essaie de modifier.

## 3. MULTI-TENANT (Isolation Beta)
**Statut : VALIDÉ**
L'architecture Firestore basée sur `hasSchoolAccess` garantit qu'aucune donnée du personnel de l'école Alpha ne fuite vers l'école Beta.

## 4. STABILITÉ
**Statut : PARTIELLEMENT VALIDÉ**
*   La structure actuelle est fluide, mais le front-end ne gère pas proprement les exceptions (FirebaseError: Missing or insufficient permissions) lorsqu'un utilisateur non autorisé tente une action. L'erreur est juste logguée silencieusement dans la console.

---

## 5. BACKLOG FONCTIONNEL IDENTIFIÉ (Non bloquant)
Comme validé, les éléments suivants ont été classés en Backlog Fonctionnel (actuellement inexistants dans le code) :
*   **Recherche & Filtres** : Absents.
*   **Pagination** : Absente (tout est chargé d'un coup via un map).
*   **Tri des colonnes** : Absent.
*   **Photos de profils** : Absentes de la modélisation et de l'affichage.
*   **Présence du Personnel (Absence/Retard/Congés)** : Onglet/Module totalement inexistant.

---

## VERDICT GLOBAL
> [!WARNING]
> **PARTIELLEMENT VALIDÉ**

Le CRUD de base fonctionne et l'intégrité de la base de données est protégée par Firestore. Cependant, l'absence de `allowedRoles` sur la route `<Route path="/staff">` dans `App.tsx` expose l'interface aux enseignants.
