# ECOSCOLAIRE-AUDIT-ENVIRONMENT-REPORT

## 1. COMPTES EXISTANTS RETROUVÉS (SEEDS)
L'audit du projet a permis d'identifier le script officiel **`scripts/setup-test-data.mjs`** dédié à la création d'environnements de test. Ce script génère de manière idempotente les identifiants et les données suivants pour deux écoles distinctes :

**Comptes retrouvés et références de secrets :**
- **SuperAdmin** : `superadmin.test@ecoscolaire.com` (Mdp : `STAGING_TEST_SUPERADMIN_PASSWORD`)

**Comptes École Alpha (`school-alpha-001`) :**
- Owner : `owner.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Directeur : `director.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Secrétaire : `secretary.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Comptable : `accountant.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Enseignant 1 : `teacher1.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Chauffeur : `driver.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)
- Parent 1 : `parent1.alpha@ecoscolaire.com` (`STAGING_TEST_ALPHA_PASSWORD`)

**Comptes École Beta (`school-beta-002`) :**
- Owner : `owner.beta@ecoscolaire.com` (`STAGING_TEST_BETA_PASSWORD`)
- Directeur : `director.beta@ecoscolaire.com` (`STAGING_TEST_BETA_PASSWORD`)
- Enseignant : `teacher.beta@ecoscolaire.com` (`STAGING_TEST_BETA_PASSWORD`)
- Parent : `parent.beta@ecoscolaire.com` (`STAGING_TEST_BETA_PASSWORD`)

## 2. COMPTES ET DONNÉES INEXISTANTS
Bien que les comptes et la majorité des données primaires soient gérés par le script, les éléments suivants sont **inexistants** (non générés par le script actuel) :
1. **Transport / Bus** : Aucune donnée de `lignes`, `bus` ou assignation de passagers n'est générée.
2. **Inventaire** : Aucun `article`, `mouvement` de stock ou alerte n'est présent.
3. **Dépenses** : Le script crée 15 paiements (revenus) mais 0 dépense.

## 3. MÉTHODE EXACTE POUR CRÉER LES COMPTES MANQUANTS
Le script `setup-test-data.mjs` utilise les méthodes officielles de `firebase-admin/auth` (`auth.createUser`, `auth.updateUser`) et `firebase-admin/firestore` pour insérer les documents.
Pour générer les comptes et données manquantes, il faut modifier `scripts/setup-test-data.mjs` :

1. **Ajouter les collections de logistique et finances manquantes** dans le flux d'insertion (après l'étape 8).
2. **S'assurer de l'idempotence** en ajoutant les collections manquantes (`inventory`, `transport`, `expenses`) dans la fonction `cleanupTestData()`.

## 4. DONNÉES DE TEST À INJECTER
Pour finaliser l'environnement d'audit, les objets suivants devront être ajoutés dans le script de seed :
- **Transport** :
  - `bus` : Bus Alpha 1, Chauffeur : `driver.alpha@ecoscolaire.com`
  - `passengers` : Assignation de 5 élèves Alpha au bus.
- **Inventaire** :
  - `items` : "Cahiers 100 pages" (Stock: 50), "Craies" (Stock: 10, Alerte).
  - `stock_movements` : Entrée de 50 cahiers.
- **Dépenses** :
  - `expenses` : Achat de matériel (45 000 FCFA), Réparation Bus (60 000 FCFA - Nécessite approbation Owner).

## 5. ÉTAPES POUR OBTENIR UN ENVIRONNEMENT D'AUDIT COMPLET
Pour que je puisse procéder à l'audit P1 authentifié complet exigé, voici l'ordre d'action strict :

1. **Fournir le Service Account** : Le script de seed nécessite un accès base de données (Staging ou Production mockée). Vous devez configurer la variable d'environnement `STAGING_FIREBASE_SERVICE_ACCOUNT` ou créer le fichier `./staging-service-account.json`. *(Alternativement : Résoudre le bug local du JDK 21 pour permettre de démarrer le Firebase Emulator et exécuter le seed localement).*
2. **Mettre à jour le Seed** : Ajouter les blocs de code pour l'inventaire, les dépenses et le transport dans `setup-test-data.mjs`.
3. **Exécuter le Seed** :
   ```bash
   node scripts/setup-test-data.mjs
   ```
4. **Relancer la Mission d'Audit** : Une fois la base peuplée (que ce soit sur l'environnement de Staging lié à l'URL Vercel, ou en local), je pourrai utiliser `superadmin.test@ecoscolaire.com` et les autres rôles pour exécuter la matrice intégrale des workflows avec preuves.
