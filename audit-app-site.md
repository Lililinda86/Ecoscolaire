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

## 2. Architecture des Données & Gestion d'État (100% Firestore)
### 2.1 Le Contexte Principal (`AppContext.tsx`)
Le cœur de l'application repose sur un contexte React (`AppContext`) qui agit comme le chef d'orchestre entre l'UI et la base de données Firestore. Toute dépendance au `localStorage` pour les données métier a été supprimée.
- **Synchronisation au démarrage (Read)** : L'application télécharge 11 collections Firestore (`schools`, `users`, `classes`, `students`, `staff`, `buses`, `inventory`, `grades`, `payments`, `attendance`, `parents`) en mémoire pour une utilisation réactive.
- **Moteur de Diffing (Write)** : La fonction `saveDB(newDb)` compare l'ancienne base avec la nouvelle, identifie les éléments exacts ajoutés, modifiés ou supprimés, et envoie uniquement ces deltas à Firestore via `setDoc` ou `deleteDoc`.
- **Persistance Hors-Ligne (IndexedDB)** : Le SDK Firestore est configuré avec `enableIndexedDbPersistence`, ce qui permet à l'application de fonctionner même sans connexion Internet. Les données modifiées hors-ligne seront synchronisées automatiquement au retour de la connexion.

### 2.2 Modélisation (`types/index.ts`)
Les données sont strictement typées :
- `School` : Configuration globale de l'école (frais de scolarité, abonnement SaaS, etc.).
- `ClassSection` : Gestion du type `francophone` ou `anglophone` et du niveau (`maternelle` ou `primaire`).
- `Student`, `Staff`, `Attendance`, `Grade`, `Payment`, `InventoryTransaction` : Les interfaces métiers complètes pour modéliser tout l'écosystème scolaire.

## 3. Cartographie de l'UI (Pages et Composants)
Les interfaces sont riches et denses, suggérant de nombreuses fonctionnalités intégrées :
- **Authentification / Amorce** : 
  - `SuperAdmin.tsx` : Tableau de bord SaaS de gestion globale des abonnements (création d'écoles clientes, suspension, supervision).
  - `Login.tsx` : Page de connexion centralisée (Multi-tenant) utilisant le Code École, l'identifiant et un PIN haché (SHA-256).
  - `Diagnostic.tsx` (`#/diagnostic`) : Outil en temps réel permettant de vérifier la santé de la connexion Firestore, le nombre d'éléments synchronisés et la dernière date de synchronisation.
- **Opérations Courantes** :
  - **Portail Parent (`ParentPortal.tsx`)** : Vue restreinte aux enfants liés. Implémente une **logique de blocage financier** : un trimestre n'est visible que si la tranche de pension correspondante est payée (ex: T1 bloqué si Tranche 1 impayée).
  - **Paiements (`Payments.tsx` - ~40 Ko)** : Cœur financier, gestion des tranches de scolarité (T1, T2, T3), transport, uniformes. Sûrement lié aux paiements cash/mobile money.
  - **Transport & Bus (`Buses.tsx`)** : Nouveau module avancé avec un tableau de bord dédié (alertes pannes/entretiens, coûts carburant) et une structure en onglets pour le CRUD complet de la flotte (bus), des lignes, des conducteurs, du carburant et de la mécanique.
  - **Élèves (`Students.tsx` - ~27 Ko)** : Gestion de la base de données des étudiants, importations Excel, attributions de classes.
  - **Présences et Notes (`Attendance.tsx`, `Grades.tsx` - ~24 Ko)** : Modules massifs de relevés journaliers et génération des bulletins.
  - **Inventaire (`Inventory.tsx` - ~15 Ko)** : Gestion du stock avec seuils d'alerte et traçabilité des entrées/sorties.
  - **Paramètres (`Settings.tsx` - ~15 Ko)** : Configuration des tarifs, années scolaires et clés de paiement.

## 4. Sécurité & Modèle SaaS
- **SaaS Multi-écoles (Multi-tenant)** : L'architecture est totalement multi-tenant. Chaque entité (`Student`, `Class`, `Payment`, etc.) possède un champ `schoolId`.
- **Mode Supervision** : Le `superAdmin` peut accéder au tableau de bord d'une école cliente et visualiser toutes ses données en direct. Une sécurité bloque l'édition accidentelle avec un avertissement de confirmation explicite.
- **Rôles Globaux** : `superAdmin`, `schoolAdmin`, `accountant`, `teacher`, `parent`, `driver`.
- **Sécurité des mots de passe** : L'API Web Crypto est utilisée pour hacher en SHA-256 les codes PIN avant de les enregistrer dans Firestore ou de vérifier une connexion.
- **Abonnements** : Formules `starter`, `standard`, `premium` et statuts (`trial`, `active`, `expired`) gérés par le Super Admin pour bloquer/limiter les écoles non à jour.

## 5. Recommandations & Optimisations Futures
- **Optimisation des Requêtes Firestore** : Actuellement, l'application récupère toute la base de données de toutes les collections au démarrage (`getDocs`). À mesure que les écoles clientes auront des milliers d'élèves, cette approche causera des lenteurs au premier chargement (bien que mis en cache via IndexedDB ensuite) et de potentiels surcoûts Firebase. Il conviendrait de remplacer `getDocs` par des requêtes ciblées filtrées par le `schoolId` de l'utilisateur connecté, afin qu'il ne télécharge que les données de son école.
- **Règles de Sécurité (Firebase Rules)** : Il est crucial de configurer les `firestore.rules` du projet Google Cloud pour restreindre les opérations de lecture et d'écriture au `schoolId` approprié, afin d'assurer l'étanchéité stricte entre les écoles sur le serveur (actuellement filtré par le client).
- **Export PDF (`html2canvas` + `jspdf`)** : L'utilisation de ces librairies peut entraîner des blocages de thread (UI gelée) lors de l'exportation par lots (ex: impression de 50 bulletins). Déporter cette tâche sur un Web Worker améliorerait l'expérience utilisateur.
