# ECOSCOLAIRE-BACKEND-SECURITY-STATE

## 1. Tests Firestore VALIDÉS (Couverture actuelle)
Lors du dernier audit en environnement de Staging, les éléments suivants ont été testés et confirmés étanches :
- **Anti-Spoofing & Multi-Tenant** : Isolation stricte entre les écoles Alpha et Beta (`owner.alpha` ne peut ni lire, ni écrire chez Beta, et inversement).
- **Lectures Interdites** :
  - `anonyme` ne peut pas lire `schools` ou `students`.
  - `teacher` ne peut pas lire `payments` et `expenses`.
  - `accountant` ne peut pas lire `grades`.
  - `parent` ne peut lire que son propre enfant, et l'accès aux autres est bloqué.
- **Écritures Interdites** :
  - `teacher` bloqué en écriture sur `inventory`.
  - `accountant` bloqué en écriture sur `students`.
- **Champs Sensibles (SaaS)** : Modification bloquée pour `subscriptionPlan`, `isInternalSchool`, `studentLimit`, `role`, et `schoolId`.

## 2. Tests Firestore Non Couverts
Les scénarios suivants n'ont pas encore fait l'objet d'un test explicite et constituent une zone d'ombre :
- Écriture d'un élève avec dépassement frauduleux de la limite d'élèves autorisée par l'abonnement.
- Invalidation des anciens plans (SaaS Billing Restrictions).
- Lectures croisées de collections pour les rôles administratifs sur `attendance`, `staff`, `inventory`.
- Accès aux `parent_invitations` ou tentatives de création de compte direct par API.

## 3. Rôles Non Testés (ou Partiellement)
- **`superAdmin`** : Les capacités transversales complètes et les éventuelles limites n'ont pas été vérifiées en live.
- **`driver`** : Les règles associées à ce rôle n'ont subi aucun audit d'accès en lecture/écriture.
- **`student`** : Test échoué lors du login (`invalid-credential`), les tentatives de lectures sur `attendance` ou `grades` de son propre profil ne sont pas encore validées.

## 4. Collections Non Testées ou Partiellement Testées
- `attendance` (Partiellement testée pour student, mais droits complets inconnus)
- `staff` (Tentative de delete testée par un teacher, mais le reste du CRUD est ignoré)
- `users` (Testé uniquement sur les mises à jour frauduleuses de `role` ou `schoolId`, lecture complète non couverte)
- `parent_invitations` (Non testée)
- `transactions` / `receipts` / `buses` / `communication` (Absentes du test)

## 5. Risques Backend Restants
Malgré des règles de base solides, des risques persistent :
- **Droits d'élévation indirecte** via des champs non surveillés.
- **Absence de tests sur les suppressions de cascades** (Ex: un document orphelin reste-t-il lisible ?).
- **Contournement des `firestore.rules` par le biais des Cloud Functions**, si elles ne vérifient pas rigoureusement le contexte auth.

## 6. Cloud Functions Non Auditées
Les endpoints Backend (Serveur) constituent la principale menace d'élévation de privilèges si la fonction exécute des requêtes sans restriction (`admin-sdk`).
- `initiatePayment` : Risque de manipulation de montant, de fausse assignation de `schoolId` ou d'ID élève.
- `campayWebhook` : Risque majeur de simulation de webhook pour valider de faux paiements ou générer des reçus frauduleux sans sécurité JWT/HMAC.
- `onPaymentCreated` : Risque de validation de reçus illégitimes.

## 7. Prochaine Étape Recommandée
**Mener l'audit de sécurité des Cloud Functions.**
Il est impératif de s'assurer que `initiatePayment` et `campayWebhook` effectuent leurs propres vérifications d'autorisation, d'intégrité (validation des entrées), et qu'elles ne permettent pas à un utilisateur malveillant de contourner les protections fraîchement validées sur Firestore.
