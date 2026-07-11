# P0-MOBILE-MONEY-010-END-TO-END-AUDIT

## A. Fonction attendue (Backend)
**Code :** `functions/src/index.ts` (lignes 56-68)
**Paramètres obligatoires :**
- `schoolId` (doit être non-vide)
- `amount` (doit être un nombre > 0)
- `provider` (doit être 'campay' ou 'flutterwave')
**Contrôles supplémentaires :**
- `context.auth` (Firebase Auth Token valide requis)
- Vérifications Firestore (Rôle de l'utilisateur, Appartenance de l'étudiant à l'école)

## B. Payload envoyé (Frontend)
**Code :** `src/pages/Payments.tsx` (lignes 60-67)
```typescript
const payload = {
  schoolId: currentSchool!.id,
  studentId: currentPayment.studentId,
  amount: currentPayment.amount || 0,
  type: currentPayment.type,
  installment: currentPayment.installment,
  provider // forcé à 'campay' ou 'flutterwave'
};
```

## C. Différences Backend vs Frontend
**Aucune différence métier ou typographique.**
Le payload est strictement parfait. L'erreur ne vient pas des données transmises.

## D. Cause racine (Le biais de Cloud Shell)
Votre conclusion indiquant que *"le problème n'est plus l'IAM car Cloud Shell répond"* est un **faux positif (biais de test)**.

**Que se passe-t-il réellement ?**
1. **Dans Cloud Shell :** Vous êtes connecté en tant qu'administrateur GCP. Cloud Shell injecte automatiquement vos credentials. La requête contourne le blocage IAM, atteint le code Node.js (Firebase SDK), et Firebase SDK retourne `INVALID_ARGUMENT` car vous n'avez pas wrappé votre JSON dans un objet `{ "data": { ... } }` (requis par le protocole `httpsCallable`).
2. **Dans le navigateur (Frontend) :** Le navigateur applique la norme de sécurité Web CORS. Avant d'envoyer la vraie requête `POST`, il envoie une requête `OPTIONS` (Preflight). **Or, une requête `OPTIONS` ne contient aucun token d'authentification.**
3. Puisque la fonction n'a pas la permission `allUsers` (accès public), le routeur frontal de Google Cloud rejette cette requête `OPTIONS` avec une erreur HTTP 403.
4. Le navigateur, recevant une 403 sur le Preflight au lieu des headers CORS `Access-Control-Allow-Origin`, déclenche l'erreur CORS bloquante.

En résumé : l'UI masque effectivement l'erreur via l'instruction `alert(...)` (qui a été ignorée par Playwright), mais l'erreur sous-jacente est bien **une erreur réseau due à l'IAM manquant**.

## E. Correctif minimal
L'architecture de code est irréprochable. L'unique solution est de finaliser l'action identifiée dans le rapport `P0-MOBILE-MONEY-009D` :
1. Désactiver la règle `Domain restricted sharing` au niveau organisationnel.
2. Assigner manuellement `allUsers` au rôle `Cloud Functions Invoker` pour la fonction `initiatePayment`.

*(Les Firebase Callable Functions sont conçues pour être publiques au niveau IAM, la sécurité étant gérée à 100% dans le code via le jeton Firebase Auth).*

## F. GO / NO GO
**NO GO.**
Aucune modification de code n'est requise car le code est correct. L'intervention doit être purement infrastructurelle sur la console Google Cloud.
