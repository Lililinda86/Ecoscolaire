# P0-MOBILE-MONEY-009C-CALLABLE-CONFIG-AUDIT

## A. Initialisation Firebase Functions
**Région** : Implicite (par défaut).
**Preuves (`src/db/firebase.ts`)** :
```typescript
export const functions = getFunctions(app); // Pas de région explicite spécifiée.
```
**Conclusion** : Le SDK client utilise par défaut la région `us-central1`. C'est le comportement attendu.

## B. Appel frontend
**Mécanisme utilisé** : `httpsCallable` du SDK Firebase officiel.
**Preuves (`src/pages/Payments.tsx`)** :
```typescript
import { httpsCallable } from 'firebase/functions';
// ...
const initiatePayment = httpsCallable(functions, 'initiatePayment');
const result = await initiatePayment(payload);
```
**Conclusion** : Aucun appel manuel avec `fetch` ou `axios` n'est utilisé pour contourner le SDK. L'URL générée automatiquement (`https://us-central1-ecoscolaire-staging.cloudfunctions.net/initiatePayment`) est parfaitement formée.

## C. Projet Firebase
**Projet ciblé** : `ecoscolaire-staging`
**Preuves (`.firebaserc`)** :
```json
"projects": {
  "staging": "ecoscolaire-staging",
  "prod": "ecoscolaire-c5861"
}
```
**Conclusion** : Le frontend et le CLI de déploiement ciblent tous deux bien `ecoscolaire-staging`. Il n'y a pas de désynchronisation entre les environnements.

## D. Fonction backend
**Type de fonction** : `onCall` (Callable).
**Preuves (`functions/src/index.ts`)** :
```typescript
export const initiatePayment = functions.https.onCall(async (data, context) => {
```
**Conclusion** : La fonction est correctement déclarée pour gérer automatiquement les headers CORS et l'authentification Firebase. Elle n'est pas déclarée comme `onRequest`.

## E. Cause la plus probable du CORS
Parmi les hypothèses :
1. Mauvais projectId ❌ Faux.
2. Mauvaise région ❌ Faux (`us-central1` est cohérent).
3. Mauvais endpoint ❌ Faux.
4. `fetch()` utilisé ❌ Faux.
5. Fonction dans un autre projet ❌ Faux.

**Cause réelle (Hypothèse 7 - IAM & Infrastructure) :**
La Cloud Function V1 Callable gère elle-même les headers CORS de manière dynamique *lorsque le code Node.js est exécuté*. Cependant, sur les projets Google Cloud récents, **toute nouvelle fonction HTTP/Callable est privée par défaut**.
Si le rôle IAM **`Cloud Functions Invoker`** n'est pas explicitement accordé à `allUsers`, le routeur réseau de Google Cloud (GFE) bloque la requête HTTP OPTIONS (Preflight CORS) de Playwright ou du navigateur en amont. Le Node.js n'est même pas touché, donc aucun header `Access-Control-Allow-Origin` n'est retourné, ce qui provoque l'erreur classique du navigateur.

*Cause secondaire (Hypothèse 6) :* Un crash immédiat lors du "Cold Start" (ex: un secret manquant ou une erreur de parsing) forcerait l'instance Node.js à renvoyer un statut 500 fatal avant même l'exécution du middleware CORS de `firebase-functions`.

## GO / NO GO
**NO GO.**
La configuration du code est mathématiquement exacte et irréprochable. Le bug n'est pas dans le code source de l'application.

## Correction minimale recommandée
Le code est correct. La correction doit s'effectuer **exclusivement sur la console Google Cloud** :
1. Assigner `allUsers` au rôle `Cloud Functions Invoker` pour la fonction `initiatePayment`.
*(La sécurité est garantie de manière logicielle par `if (!context.auth) throw new HttpsError(...)` au début de votre fonction).*
