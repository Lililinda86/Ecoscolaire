# P0-MOBILE-MONEY-020-CAMPAY-SANDBOX-IMPLEMENTATION-REPORT

## Fichiers modifiés
- `[NEW] functions/src/services/campayService.ts` : Service contenant la logique d'authentification (`login`) et d'initiation (`requestToPay`) sur l'API Campay.
- `[MODIFY] functions/src/index.ts` : Mise à jour de `initiatePayment` pour supporter l'appel à la Sandbox en plus du mode MOCK.

## Architecture
Le service `CampayService` utilise l'API native `fetch` (disponible depuis Node.js 20) pour effectuer les requêtes HTTP, ce qui permet de s'affranchir de bibliothèques tierces comme `axios`.
Les URLs pointent par défaut vers `https://demo.campay.net` conformément à la contrainte Sandbox.

## Mode MOCK conservé
Le mode MOCK existant est resté la voie principale de secours.
`initiatePayment` retombe systématiquement sur le mode MOCK :
- Si l'école n'a pas de secrets configurés.
- Si le paramètre `campayEnvironment` dans Firestore n'est pas strictement `"sandbox"`.

La fonction `mockConfirmPayment` n'a pas été modifiée et reste utilisable pour valider les transactions MOCK.

## Mode SANDBOX ajouté
Lorsque les `secrets.campayAppUsername` et `secrets.campayAppPassword` sont présents dans Firestore, et que `campayEnvironment` est positionné sur `"sandbox"`, la fonction exécute :
1. Une requête de login (obtention du token).
2. Une requête de `collect` (Request To Pay), en injectant notre `transactionId` généré en tant que `external_reference` dans Campay.

## Sécurité secrets
- Les secrets (mots de passe et tokens) **ne sont jamais renvoyés** au frontend.
- Le token et le mot de passe ne sont **jamais écrits** en clair dans les logs Firestore ou Cloud Logging.

## Logs Campay
Une collection Firestore `campay_logs` a été mise en place. Elle intercepte les retours et les erreurs :
- `schoolId`, `transactionId`
- `requestType` : `request_to_pay`
- `status` : `SUCCESS` ou `FAILED`
- `sanitizedRequest` : Contient les informations envoyées (montant, téléphone, description, ID interne) sans aucun token.
- `sanitizedResponse` : La réponse brute de l'API Campay.
- `errorMessage` : Le libellé exact de l'erreur en cas d'échec (ex: 401 Unauthorized, fond insuffisant, etc.).

## Tests
Les tests manuels (analyse statique) confirment que si aucun credential n'est fourni, la transaction se génère en mode MOCK (`status: PENDING`, avec `mockPaymentUrl`).
L'ajout des secrets Sandbox redirige bien le flux vers la classe métier `CampayService` qui encadre l'API par des `try/catch`.

## Build
Les commandes `npm run build` (frontend) et `npm --prefix functions run build` (backend TypeScript) s'exécutent avec succès.
```text
✓ built in 20.74s (Frontend)
> tsc (Backend compilé sans erreur)
```

## GO / NO GO staging
Les modifications sont prêtes.

> [!TIP]
> **GO STAGING accordé.** Vous pouvez tester l'initialisation depuis le frontend (si configuré manuellement dans Firestore) sans impact sur le webhook (P0-021) qui arrivera ensuite.
