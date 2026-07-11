# ECOSCOLAIRE — P0-002 — CERTIFICATION DECISION

## 1. Audit des tests d'intégration (Scripts Firestore)

Une analyse des scripts de tests d'injection directe (`run-all-16-tests-final.mjs` et assimilés) révèle une divergence entre le schéma injecté et le schéma attendu en production :

*   **Problème identifié** : Lors de la simulation d'un parent, la méthode `setDoc` est utilisée pour forcer la création d'un utilisateur, mais les champs obligatoires sont incomplets. Le champ `active: true` (ou `isActive: true`) manque systématiquement pour les parents injectés par ce script.
*   **Conséquence** : La fonction utilitaire des règles Firestore `isActive()` évalue le profil à `false`, déclenchant automatiquement un `PERMISSION_DENIED` sur toute lecture (comme dans le Test 14), masquant le comportement réel des règles ciblées (`grades`, etc.).
*   **Validation du correctif** : Les scripts comme `redteam-p0-002.mjs`, qui incluent correctement `active: true`, prouvent formellement que l'attaque IDOR visée par P0-002 est bien bloquée par les nouvelles sécurités.

## 2. Modèle utilisateur et Règles Firestore

Pour qu'un test n'entraîne pas de faux positifs de rejet, tout profil `users` créé manuellement doit contenir les champs obligatoires suivants dictés par les règles de sécurité (`firestore.rules`) :

1.  `active: true` ou `isActive: true` *(requis par `isActive()` pour toutes les requêtes)*.
2.  `role` *(ex: `'parent'`, `'owner'`, requis pour le dispatching des accès)*.
3.  `schoolId` *(requis par `hasSchoolAccess()` pour le cloisonnement multitenant)*.
4.  `studentIds` *(requis spécifiquement pour le rôle parent pour le contrôle de lecture sur les collections enfants, ex: `students`, `grades`, `attendance`)*.

> *La documentation de conception des tests doit être mise à jour pour systématiser l'inclusion de ces champs lors du seeding.*

## 3. Qualification des échecs Playwright

En se basant sur le rapport d'analyse de la QA (`remaining-e2e-failures-analysis.md`), les 15 échecs E2E ont été catégorisés :

*   **Assertions obsolètes (Sélecteurs Playwright invalides)** : 14 tests (déconnexion, navigation CRUD) échouent suite à des modifications purement visuelles de l'interface (textes des boutons modifiés : ex. "Élèves", "Déconnexion" non trouvés).
*   **Jeu de données invalide** : 1 test (connexion SuperAdmin) échoue car le profil n'est plus créé dynamiquement au runtime, mais le script de *seed* ne génère pas ce compte avec les bonnes informations.
*   **Bugs applicatifs ou régressions** : **0.** Aucun échec E2E n'est lié à un défaut métier du patch P0-002.

## 4. Impacts résiduels et liste des tests à mettre à jour

Aucun code métier ne nécessite de modification. Les actions correctives sont circonscrites à la suite de tests :

*   **`run-all-16-tests-final.mjs` (et scripts dérivés)** : Ajouter `active: true` dans tous les payloads de création d'utilisateurs (`setDoc`).
*   **Suite Playwright (`*.spec.ts`)** : Remplacer les sélecteurs textuels obsolètes par des `data-testid` résilients aux refontes UI (Navbar, Sidebar).
*   **Scripts de Seed (`setup-users.mjs` / `setup-test-data.mjs`)** : Garantir l'initialisation du compte Super Admin ciblé par les tests Playwright.

---

## 5. DÉCISION FINALE

**Synthèse des preuves :**
1. L'attaque IDOR sur les parents est bloquée en Staging (prouvé).
2. L'accès légitime d'un parent à ses propres enfants réussit lorsque les conditions de test sont valides (prouvé par le re-test du Test 14).
3. Les échecs Playwright ne relèvent pas de bugs fonctionnels mais de sélecteurs cassés et de données d'environnement.

En conséquence, la robustesse sécuritaire de l'application concernant les privilèges parents est validée et aucune régression n'est imputable à la correction.

### Verdict

**P0-002 CERTIFIÉ**
