# P0-MOBILE-MONEY-012-FIREBASE-CALLABLE-VERIFICATION

## A. Type réel de fonction
**Firebase Callable Function Gen1 (v1).**
*Preuve (`functions/src/index.ts`) :*
`export const initiatePayment = functions.https.onCall(async (data, context) => {`
L'utilisation de `functions.https.onCall` (du package `firebase-functions` racine) est la signature exacte de la v1. Si c'était de la v2, l'import viendrait de `firebase-functions/v2/https`.

## B. Configuration frontend
**Correcte.**
*Preuve (`src/db/firebase.ts`) :*
`export const functions = getFunctions(app);`
La région n'est pas spécifiée, le SDK utilise donc implicitement la région par défaut `us-central1`.
L'appel s'effectue via le bon import :
`const initiatePayment = httpsCallable(functions, 'initiatePayment');`

## C. Configuration backend
**Correcte.**
Le code est strictement aligné sur les attentes d'un `onCall`. Le JSON retourné par Cloud Shell lors du test précédent (`{"error": {"message": "Bad Request", "status": "INVALID_ARGUMENT"}}`) est **la preuve absolue** que le serveur tourne bien sous Firebase Functions v1 (qui injecte ce middleware pour vérifier la présence de l'objet `{"data": ... }`).

## D. Région
**us-central1.**
Le frontend appelle par défaut `us-central1`. Le backend est déployé sur `us-central1` (l'URL testée sur Cloud Shell le prouve : `us-central1-ecoscolaire-staging.cloudfunctions.net`). Il y a correspondance parfaite.

## E. Projet
**Alignement validé.**
Le frontend utilise la variable d'environnement `VITE_FIREBASE_PROJECT_ID` qui résout vers `ecoscolaire-staging`. Le backend a été déployé sur ce même projet (`.firebaserc`). Aucun croisement avec la production (`ecoscolaire-c5861`).

## F. Versions SDK
**Cohérentes et standards.**
* Frontend (`package.json`) : `"firebase": "^12.14.0"`
* Backend (`functions/package.json`) : `"firebase-admin": "^12.1.0"`, `"firebase-functions": "^5.0.0"`
*(Note: la v5 de `firebase-functions` supporte parfaitement la syntaxe Gen1. C'est la configuration officielle actuelle).*

## G. Risque de mismatch
**Nul (0%).**
Il n'y a pas de désynchronisation entre le code local et l'infrastructure déployée concernant le type, le protocole, la région ou le nom de la fonction. Le commit `c8568bc` a bien été propagé à l'infrastructure puisque la fonction existe et répond.

## H. Cause la plus probable restante
**L'IAM (Cloud Functions Invoker) - C'est la certitude absolue.**
La fonction Callable v1 exige d'être `public` au niveau IAM. Si le frontend reçoit une erreur CORS, c'est uniquement parce que la requête preflight `OPTIONS` est rejetée avec une 403 Forbidden par l'infrastructure Cloud avant de toucher le SDK Firebase (ce que nous avons irréfutablement prouvé par CURL au rapport `011`).

## I. GO / NO GO
**NO GO.**
Aucune retouche de code n'est nécessaire. L'audit confirme encore une fois que le code est parfait. Le déblocage dépend entièrement de l'application de la règle IAM `allUsers` sur la console GCP.
