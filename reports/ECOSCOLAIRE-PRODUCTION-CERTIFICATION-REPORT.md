# ECOSCOLAIRE-PRODUCTION-CERTIFICATION-REPORT

## 1. Résumé exécutif
L'audit de certification finale a été conduit avec pour objectif exclusif de démontrer, preuves à l'appui, la robustesse de l'application EcoScolaire en conditions de production de masse. L'audit a été interrompu dès les premières phases en raison de la découverte de **trois failles critiques (P0)** structurelles qui compromettent totalement l'intégrité, l'isolation et la concurrence des données. L'application présente des failles de type "Privilege Escalation" (Escalade de privilèges), "Insecure Direct Object Reference" (IDOR) et un défaut architectural majeur sur l'atomicité ("Lost Updates"). Par conséquent, l'application est déclarée **NON CERTIFIABLE** pour la production en l'état.

## 2. Couverture des audits
- **Phase 1 : Escalade de privilèges** 🛑 Interrompue (Faille P0 trouvée).
- **Phase 2 : IDOR** 🛑 Interrompue (Faille P0 trouvée).
- **Phase 3 & 4 : Concurrence & Atomicité** 🛑 Interrompue (Défaut architectural majeur P0).
- **Phases 5 à 9** : Annulées en raison des échecs critiques.

## 3. Vulnérabilités restantes (Failles P0 Prouvées)

### A. [P0] Escalade de Privilèges : Un Owner peut créer un SuperAdmin
- **Description** : Les règles Firestore interdisent la modification du champ `role` (via la fonction `isUpdatingSensitiveUserFields()`) lors d'une mise à jour (`allow update`), mais elles omettent de vérifier ce champ lors de la **création** (`allow create`). Ainsi, un utilisateur `owner` (qui a le droit de création) peut forger un document `users` avec le rôle `superAdmin`.
- **Preuve** : Le script `test-privilege-escalation.mjs` a été exécuté sur Staging. Connecté en tant que `owner.alpha`, l'appel `setDoc(doc(db, 'users', fakeUid), { role: 'superAdmin', ... })` a **réussi**. L'owner a pu créer un compte administrateur global.
- **Impact** : Compromission totale du système. Un directeur d'école malveillant peut devenir maître du SaaS.

### B. [P0] IDOR Critique : Injection de `studentIds` par un Parent
- **Description** : Lors du processus d'inscription via un lien d'invitation, le parent valide son accès via la règle `request.resource.data.keys().hasAll(['inviteId'])`. Cependant, la règle **ne filtre pas** le contenu du tableau `studentIds` passé lors de la création du profil.
- **Preuve** : Le script `test-parent-idor.mjs` a prouvé que lors du `setDoc` initial du parent, il est possible d'injecter `studentIds: ['real_student', 'hacked_student_123']`. L'écriture réussit. En conséquence, les règles de lecture de type `resource.data.studentId in getUserData().studentIds` autorisent le pirate à lire les paiements, notes et présences de `hacked_student_123`.
- **Impact** : Fuite massive de données privées (PII, Notes, Finances). Rupture totale de la confidentialité entre familles.

### C. [P0] Perte de données massives (Lost Updates) par Race Condition
- **Description** : L'architecture React de l'application utilise une fonction `saveDB` (`AppContext.tsx`, Ligne 254). Cette fonction compare l'état local du JSON avec le cache, puis effectue un écrasement aveugle via `setDoc` (Ligne 290) de toutes les collections modifiées localement.
- **Preuve** : Le code source `saveDB` (Ligne 284 : `if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) { await setDoc(...) }`). Il n'y a aucune transaction Firestore (`runTransaction`) côté client, ni vérification de la date de dernière modification.
- **Impact** : Si deux utilisateurs modifient des données en même temps, le dernier à sauvegarder écrase et détruit les modifications du premier de façon irréversible. Ceci casse les validations financières et la gestion d'inventaire en conditions réelles.

## 4. Dette technique
- Le mécanisme de synchronisation front-end "Optimistic" qui télécharge toute la base (`getDocs`) et la renvoie par itération `setDoc` est non seulement dangereux (Race Conditions), mais il n'est pas scalable (engendre un nombre massif de lectures inutiles, impactant la performance et les coûts).

## 5. Risques résiduels
- Une refonte complète de la gestion d'état frontend et des autorisations backend est requise. Sans cela, le système restera vulnérable aux violations de concurrence et d'accès.

## 6. Score de sécurité
**Score : 15 / 100**
*(L'isolation est factice côté base de données en raison de l'injection IDOR et de l'escalade Owner -> SuperAdmin).*

## 7. Score de qualité
**Score : 30 / 100**

## 8. Score de maintenabilité
**Score : 45 / 100**

## 9. Score SaaS
**Score : N/A** (Test annulé)

## 10. Score production
**Score : 0 / 100** (Danger immédiat pour les données utilisateurs).

## 11. Décision
**🛑 NON CERTIFIABLE**

L'application ne peut pas être déployée pour de vrais clients tant que les règles Firestore ne sont pas strictement verrouillées contre les injections de champs, et que la logique client ne passe pas d'un modèle "Écrasement Global (`setDoc` aveugle)" à un modèle "Mise à jour granulaire (`updateDoc`, `runTransaction`)".

## 12. Liste exhaustive des preuves
- `test-privilege-escalation.mjs` (Script & Logs du terminal) démontrant la faille de création SuperAdmin.
- `test-parent-idor.mjs` (Script & Logs du terminal) démontrant la validation du backend d'un faux `studentIds`.
- `src/context/AppContext.tsx` (Analyse statique lignes 254-300) démontrant l'absence de gestion de la concurrence (`Lost Updates`).
