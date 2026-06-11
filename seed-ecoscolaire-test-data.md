# 📦 Seed de Données de Test - EcoScolaire

**Rôle :** TEST-DATA-BUILDER-ECOSCOLAIRE
**Date :** Juin 2026
**Objectif :** Préparer un environnement complet, idempotent et sécurisé pour valider les tests E2E/Runtime.

---

## 1. Liste des données créées

L'exécution du script d'amorçage va populer la base Firestore avec les éléments suivants :

* **Écoles :**
  - **École Alpha** (ID: `school-alpha-001`, Code: `ALPHA001`) : L'environnement principal contenant l'intégralité des données de test. Un logo encodé en Base64 est inclus.
  - **École Beta** (ID: `school-beta-002`, Code: `BETA002`) : Un environnement vierge servant exclusivement à vérifier la stricte isolation des données (Test de non-fuite d'Alpha vers Beta).

* **Super Admin :**
  - `superadmin.test@ecoscolaire.com` (`Test@2026Super!`)

* **Comptes Utilisateurs (École Alpha) :**
  - 8 rôles incluant Owner, Director, Secretary, Accountant, Teacher, Parent, Driver.
  - *Mot de passe universel Alpha :* `Test@2026Alpha!`

* **Comptes Utilisateurs (École Beta) :**
  - Owner, Director, Teacher, Parent.
  - *Mot de passe universel Beta :* `Test@2026Beta!`

* **Pédagogie & Finances (École Alpha) :**
  - **3 Classes :** CP, CE1, CE2.
  - **20 Élèves :** Répartis équitablement. Les parents sont automatiquement liés.
  - **15 Paiements :** 10 paiements validés (Cash) et 5 paiements en attente (MoMo).
  - **50 Notes :** Échantillon aléatoire (15/20 par défaut pour l'idempotence).
  - **50 Présences :** Alternance Présent/Absent.

---

## 2. Script de création (Idempotent)

**Fichier :** `scripts/setup-test-data.mjs`

Ce script utilise le SDK Firebase pour générer des données. Il est conçu pour être **idempotent** : si vous le relancez plusieurs fois, il mettra à jour les données existantes au lieu de créer des doublons.

### Nouvelles fonctionnalités du script :

1. **Mode Dry-Run (`--dry-run`) :**
   Exécutez `node scripts/setup-test-data.mjs --dry-run`.
   *Action :* Affiche dans la console toutes les créations et opérations Firestore prévues sans rien modifier dans la base de données. Idéal pour vérifier le plan d'exécution.

2. **Mode Cleanup (`--cleanup`) :**
   Exécutez `node scripts/setup-test-data.mjs --cleanup`.
   *Action :* Supprime EXCLUSIVEMENT les documents liés aux écoles Alpha et Beta (ID: `school-alpha-001` et `school-beta-002`) dans toutes les collections. Ne touche jamais aux données de production.

---

## 3. Guide d'utilisation

**Prérequis :**
Vérifiez l'installation des dépendances (`npm install firebase`).

**Étape 1 : Vérification à blanc (Dry Run)**
```bash
node scripts/setup-test-data.mjs --dry-run
```

**Étape 2 : Exécution Réelle**
```bash
node scripts/setup-test-data.mjs
```

**Étape 3 : Nettoyage (Optionnel, après les tests)**
```bash
node scripts/setup-test-data.mjs --cleanup
```

---

## 4. Checklist de validation (Pour l'agent QA)

- [ ] **Multi-tenant :** Se connecter avec `owner.beta@ecoscolaire.com` (`Test@2026Beta!`). S'assurer qu'absolument aucun élève de l'École Alpha n'est visible.
- [ ] **Super Admin :** Se connecter avec `superadmin.test@ecoscolaire.com`. Vérifier que l'interface SA gère correctement l'affichage de plusieurs écoles.
- [ ] **Permissions Parents :** Se connecter avec `parent1.alpha@ecoscolaire.com`. Vérifier que seuls les enfants assignés sont visibles.
- [ ] **Blocage Impayé :** Essayer d'accéder au bulletin d'un élève lié à un paiement en attente. Le Paywall doit s'afficher.
- [ ] **Idempotence :** Lancer le script 2 fois d'affilée. Vérifier qu'il y a toujours exactement 20 élèves dans l'école Alpha, et non 40.
