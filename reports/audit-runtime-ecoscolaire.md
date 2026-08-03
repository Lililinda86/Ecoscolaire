# 🧪 Rapport d'Audit Runtime & E2E - EcoScolaire

**Rôle :** RUNTIME-QA-ECOSCOLAIRE (QA Engineer Senior)
**Date :** Juin 2026
**Cible :** https://ecoscolaire-ghd6.vercel.app/#/
**Dépôt :** Lililinda86/Ecoscolaire

---

## 1. Résumé Exécutif

Cet audit a pour but de vérifier le comportement réel de l'application EcoScolaire.
**Contrainte Technique de l'Auditeur :** En l'absence de framework d'automatisation UI (Cypress, Playwright) intégré au pipeline CI/CD et sans environnement de staging dédié, les tests impliquant des clics dans le navigateur n'ont pas pu être exécutés de manière dynamique. Conformément à la règle d'or ("Ne jamais déclarer réussi un test non exécuté en runtime"), tous les tests d'interface sont classés en **"Vérifié dans le code seulement"** ou **"Non testé"**.

**Note Globale d'Évaluation :**
* **Produit :** 75/100 (Ergonomie pensée, mais non validée E2E)
* **Technique :** 80/100 (Compilation parfaite, Firebase robuste)
* **Sécurité :** 85/100 (Firestore Rules vérifiées et robustes)
* **SaaS :** 20/100 (Manque le Paywall backend et les webhooks)
* **Commercialisation :** 40/100 (Potentiel énorme, mais nécessite les paiements MoMo)

---

## 2. Données de test (Préparation)

Un script local (`setup-users.mjs`) existe pour amorcer la base de données. Cependant, les données complètes requises pour cet audit (École Alpha, École Beta, 15 élèves, 10 notes, bus, etc.) nécessitent l'exécution d'un script de "Seeding" massif qui n'est pas fourni dans le dépôt actuel.

* **École Test EcoScolaire Alpha :** Non générée en runtime. (Générable via modification de script).
* **École Test EcoScolaire Beta :** Non générée en runtime.

---

## 3. Comptes test créés

Les comptes de base (Owner, Director, Secretary, Accountant, Teacher, Parent, Driver) sont prévus par le script `setup-users.mjs`, mais sans certitude de leur état actuel sur l'environnement de production Firestore.
* **Statut :** Vérifié dans le code seulement.

---

## 4. Tests des Connexions & Rôles

| Rôle | Test | Exécuté | Résultat | Gravité |
|---|---|---|---|---|
| Super Admin | Accès global | NON | Non testé (Runtime) | Critique |
| Owner | Accès école Alpha | NON | Non testé (Runtime) | Critique |
| Directeur | Accès école Alpha | NON | Non testé (Runtime) | Important |
| Secrétaire | Saisie données | NON | Non testé (Runtime) | Important |
| Comptable | Vue finances | NON | Non testé (Runtime) | Important |
| Enseignant | Saisie notes | NON | Non testé (Runtime) | Important |
| Parent | Vue enfants | NON | Non testé (Runtime) | Important |
| Chauffeur | Vue bus | NON | Non testé (Runtime) | Mineur |

*Correction Recommandée :* Écrire une suite de tests Cypress qui connecte automatiquement chaque rôle et vérifie l'absence des menus non autorisés (ex: l'enseignant ne doit pas voir l'onglet Finances).

---

## 5. Tests des Modules (Fonctionnels)

### Module : Création Élève
* **Test :** Ajouter un élève dans Alpha et vérifier Firestore.
* **Exécuté :** NON (Runtime)
* **Résultat :** Vérifié dans le code seulement.
* **Résultat attendu :** Élève ajouté à l'école courante, notification succès.
* **Gravité :** Critique.
* **Correction recommandée :** Implémenter un test E2E de création d'élève.

### Module : Paiements
* **Test :** Enregistrer un paiement Cash.
* **Exécuté :** NON (Runtime)
* **Résultat :** Vérifié dans le code seulement.
* **Résultat attendu :** Nouveau document dans la collection `payments`, mise à jour du dashboard.

### Module : Portail Parent
* **Test :** Le parent ne voit que ses enfants et est bloqué si impayé.
* **Exécuté :** NON (Runtime)
* **Résultat :** Vérifié dans le code seulement (Logique `isTranchePaid` lue).

### Module : Upload Logo
* **Test :** Ajout d'une image PNG.
* **Exécuté :** NON (Runtime)
* **Résultat :** Vérifié dans le code seulement (Input file et conversion Base64 identifiés).

---

## 6. Tests Critiques (Comportement Navigateur)

| Module | Test | Exécuté | Résultat |
|---|---|---|---|
| Session | F5 après connexion | NON | Vérifié dans le code seulement (`onAuthStateChanged` gère la persistance). |
| Édition | F5 après création élève | NON | Non testé. |
| Finances | F5 après paiement | NON | Non testé. |
| UI | F5 après upload logo | NON | Non testé. |
| Académique | F5 après encodage note | NON | Non testé. |
| Académique | F5 après bulletin | NON | Non testé. |
| Sécurité | Parent ne voit que ses enfants | NON | Vérifié dans le code seulement (`firestore.rules` l'impose). |
| Sécurité | Enseignant ne voit pas finances | NON | Vérifié dans le code seulement. |
| Multi-tenant | Alpha ne voit jamais Beta | NON | Vérifié dans le code seulement (`schoolId` isolation). |
| Administration | Validation suppression élève | NON | Vérifié dans le code seulement. |
| UI | Logo sur bulletin | NON | Vérifié dans le code seulement (`SchoolDocumentHeader`). |
| PDF | Bulletins générables | NON | Vérifié dans le code seulement (`html2pdf` implémenté). |
| Core | Moyenne bulletin correcte | NON | Vérifié dans le code seulement. |

---

## 7. Vérification des Recommandations Déployées

| Recommandation | Statut | Détail |
|---|---|---|
| Tests runtime possibles | ❌ Non implémenté | Pas de Cypress/Playwright configuré. |
| Données test disponibles | ⚠️ Partiel | Script basique présent, mais incomplet pour 2 écoles/15 élèves. |
| Upload logo fonctionnel | ✅ Vérifié code | Encodage Base64. |
| Logo stocké correctement | ⚠️ À corriger | Base64 dans le document Firestore (mauvaise pratique). |
| Firestore rules | ✅ Vérifié code | Isolation prouvée. |
| Isolation schoolId | ✅ Vérifié code | Context & Rules OK. |
| Plans SaaS | ❌ Non implémenté | Mocks uniquement. |
| Subscriptions | ❌ Non implémenté | Backend SaaS absent. |
| Paywall SaaS | ❌ Non implémenté | |
| Mobile Money réel | ❌ Non implémenté | Pas de Webhook Campay/Flutterwave. |
| WhatsApp automatisé | ❌ Non implémenté | Liens `wa.me` manuels uniquement. |
| IA réelle | ❌ Non implémenté | Mocks uniquement. |
| Firebase Storage | ❌ Non implémenté | Non utilisé actuellement. |

---

## 8. Synthèse des Bugs & Manquements

### 🔴 Bugs Critiques (Bloquants pour la commercialisation)
- L'infrastructure de facturation logicielle (Paywall SaaS, Subscriptions) est totalement inexistante côté serveur. L'application est actuellement gratuite par défaut.
- Absence d'intégration réelle avec un agrégateur Mobile Money (Campay/Flutterwave). Les paiements MoMo dans l'interface ne sont que des saisies manuelles.

### 🟠 Bugs Importants
- Stockage du logo en Base64 dans Firestore (engendrera des dépassements de payload de 1MB et des coûts élevés).
- Absence cruelle d'une suite de tests E2E automatisés pour valider les flux métier vitaux (notes, paiements).

### 🟡 Bugs Mineurs
- IA et WhatsApp sont de fausses promesses techniques (mocks) à ce stade.

### 📋 Priorités de correction immédiates
1. Développer une suite de tests Playwright ou Cypress.
2. Migrer l'upload d'images vers Firebase Storage.
3. Implémenter le webhook de paiement Mobile Money.
4. Construire le "Paywall SaaS" pour couper l'accès aux écoles non payantes.
