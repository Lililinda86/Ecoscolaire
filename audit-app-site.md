# Audit Global de l'Application "École Primaire"

## 1. Stack Technique & Dépendances
- **Frontend Core :** React 19, Vite, TypeScript
- **Routage :** React Router DOM v7
- **BaaS / Backend & Synchronisation :** Firebase (12.11) Firestore
- **Outils & Utilitaires :**
  - `xlsx` : Importation/Exportation des listes de classe et données.
  - `jspdf` & `html2canvas` : Génération de documents PDF (bulletins de notes, reçus de paiements, etc.).
  - `lucide-react` : Bibliothèque d'icônes standardisée.
- **Typage & Qualité :** TypeScript robuste avec des interfaces bien définies, ESLint.

## 2. Architecture des Données & Gestion d'État
### 2.1 Le Contexte Principal (`AppContext.tsx`)
Le cœur de l'application repose sur un contexte React (`AppContext`) qui agit comme une couche d'abstraction entre l'UI et la base de données (Firebase / LocalStorage).
- **Synchronisation Hybride** : L'app gère une transition `localStorage` vers `Firebase Firestore`. Lors du chargement initial, elle écoute 12 collections (`classes`, `subjects`, `students`, `staff`, `buses`, `attendance`, `staffAttendance`, `grades`, `payments`, `expenses`, `inventory`, `inventoryTransactions`) et un document de configuration globale (`school/main`).
- **Optimistic UI Update** : L'interface est mise à jour immédiatement via `setDb` avant que l'enregistrement Firebase (`setDoc`/`deleteDoc`) ne s'achève, garantissant une grande fluidité pour l'utilisateur.

### 2.2 Modélisation (`types/index.ts`)
Les données sont strictement typées :
- `School` : Configuration globale de l'école (frais de scolarité, clés API pour Flutterwave, logo, etc.).
- `ClassSection` : Gestion du type `francophone` ou `anglophone` et du niveau (`maternelle` ou `primaire`).
- `Student`, `Staff`, `Attendance`, `Grade`, `Payment`, `InventoryTransaction` : Les interfaces métiers complètes pour modéliser tout l'écosystème scolaire.

## 3. Cartographie de l'UI (Pages et Composants)
Les interfaces sont riches et denses, suggérant de nombreuses fonctionnalités intégrées :
- **Authentification / Amorce** : 
  - `Setup.tsx` (Création de client) et `SuperAdmin.tsx` (Tableau de bord de gestion globale des abonnements).
  - `Login.tsx` : Page de connexion centralisée (Multi-tenant) utilisant le Code École, l'identifiant et un PIN haché (SHA-256).
- **Opérations Courantes** :
  - **Portail Parent (`ParentPortal.tsx`)** : Vue restreinte aux enfants liés. Implémente une **logique de blocage financier** : un trimestre n'est visible que si la tranche de pension correspondante est payée (ex: T1 bloqué si Tranche 1 impayée).
  - **Paiements (`Payments.tsx` - ~40 Ko)** : Cœur financier, gestion des tranches de scolarité (T1, T2, T3), transport, uniformes. Sûrement lié aux paiements cash/mobile money.
  - **Transport & Bus (`Buses.tsx`)** : Nouveau module avancé avec un tableau de bord dédié (alertes pannes/entretiens, coûts carburant) et une structure en onglets pour le CRUD complet de la flotte (bus), des lignes, des conducteurs, du carburant et de la mécanique.
  - **Élèves (`Students.tsx` - ~27 Ko)** : Gestion de la base de données des étudiants, importations Excel, attributions de classes.
  - **Présences et Notes (`Attendance.tsx`, `Grades.tsx` - ~24 Ko)** : Modules massifs de relevés journaliers et génération des bulletins.
  - **Inventaire (`Inventory.tsx` - ~15 Ko)** : Gestion du stock avec seuils d'alerte et traçabilité des entrées/sorties.
  - **Paramètres (`Settings.tsx` - ~15 Ko)** : Configuration des tarifs, années scolaires et clés de paiement.

## 4. Points Forts de l'Application
- **Bilinguisme natif** : L'architecture supporte nativement le cursus Anglophone (Nursery, Class) et Francophone (Maternelle, SIL, CP, etc.).
- **Résilience** : La logique de `AppContext` tolère les erreurs de snapshot Firebase (mode hors-ligne partiel).
- **Auto-Correction** : Le fichier `App.tsx` contient une routine qui corrige automatiquement les erreurs de saisie sur les noms des classes (ex: "Mère" -> "Maternelle") et injecte les classes standards manquantes si elles ont été supprimées par erreur.

## 4. Points d'Attention / Sécurité & Accès (SaaS)
- L'application vient d'être restructurée pour un modèle **SaaS Multi-écoles (Multi-tenant)**.
- **Rôles Globaux** : `superAdmin`, `schoolAdmin`, `accountant`, `teacher`, `parent`, `driver`.
- **Authentification** : Les PINs ne sont plus en clair mais hachés via l'API Web Crypto (SHA-256) avant d'être sauvegardés ou comparés.
- **Sécurité des données** : Tous les modèles (`Student`, `Class`, etc.) possèdent désormais un champ `schoolId`. Le Contexte de l'application filtre strictement l'affichage des entités par école.
- **Abonnements** : Formules `starter`, `standard`, `premium` et statuts (`trial`, `active`, `expired`) gérés par le Super Admin pour bloquer/limiter les écoles non à jour.

## 5. Recommandations
- Les scripts d'exportation/importation de base de données devront être adaptés pour le Super Admin uniquement, afin d'éviter la fuite de données d'une école à l'autre.
- La migration complète vers Firebase/Firestore (API asynchrone) est préparée via la structure de la BDD, mais nécessite un mapping de toutes les anciennes requêtes synchrones vers Firebase.
- **Performances de rendu** : Le `AppContext` stocke *toute* la base de données (élèves, notes, inventaire) dans un seul gros objet de state `db`. Il serait recommandé de scinder le contexte ou d'utiliser une librairie comme `Zustand` ou `React Query`.
- **Firebase Firestore Queries** : Actuellement, l'application récupère toute la base Firestore en mémoire (Collections). À mesure que l'école grandit, cette approche (`onSnapshot` sur toute la collection sans filtre de pagination ni limite) causera de sérieux problèmes de consommation de bande passante et de facturation Firebase.
- **Sécurité** : 
  - Stockage potentiel de clés secrètes (`flutterwaveSecret`) dans la base de données. Il est crucial que les règles Firebase (`firebase.rules`) empêchent l'accès public en lecture à ces clés.
- **Export PDF (`html2canvas` + `jspdf`)** : L'utilisation de ces librairies peut entraîner des blocages de thread (UI gelée) lors de l'exportation par lots (ex: impression de 50 bulletins). Il conviendrait de déporter cette tâche sur un Web Worker ou un service externe.
