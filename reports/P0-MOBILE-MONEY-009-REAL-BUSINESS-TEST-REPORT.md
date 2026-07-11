# P0-MOBILE-MONEY-009-REAL-BUSINESS-TEST-REPORT

## Résultat UI
**Échec bloquant lors du clic sur le bouton de paiement.**
L'interface n'affiche pas le pop-up de succès ni d'erreur explicite pour l'utilisateur, mais la console Playwright a capturé le crash silencieux :
```text
[BROWSER ERROR] Access to fetch at 'https://us-central1-ecoscolaire-staging.cloudfunctions.net/initiatePayment' from origin 'http://localhost:5173' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
[BROWSER ERROR] Failed to load resource: net::ERR_FAILED
[BROWSER ERROR] FirebaseError: internal
```

## Résultat Cloud Function
**Non invoquée (ou crash à l'initialisation).**
L'erreur "CORS preflight" sur Firebase Functions (`onCall`) indique systématiquement l'un des deux problèmes suivants côté infrastructure Google Cloud :
1. **Défaut de permissions IAM :** Le rôle `allUsers` -> `Cloud Functions Invoker` n'a pas été attribué à la fonction `initiatePayment` sur l'environnement Staging. Google Cloud bloque donc la requête HTTP OPTIONS (Preflight) avant même qu'elle n'atteigne le code Node.js.
2. **Crash instantané à l'amorçage (Cold Start) :** La fonction plante tellement vite (ex: import manquant, erreur de syntaxe) que le middleware CORS intégré à `firebase-functions` n'a pas le temps de s'exécuter.

## Transaction créée
**NON.** L'exécution a été interrompue avant même d'atteindre le code backend.

## Paiement créé par erreur ?
**NON.** L'UI n'appelle pas Firestore directement pour la création du paiement ; elle attend la réussite de la Cloud Function.

## Logs Firebase
Impossible d'auditer avec `firebase functions:log` car le token CLI d'intégration continue est expiré. Cependant, l'erreur 401 côté navigateur confirme un blocage réseau/IAM Google Cloud.

## Bugs observés
- FirebaseError: internal (CORS) au moment du déclenchement du paiement.
- Le frontend (UI) n'affiche pas de message d'erreur clair si la Cloud Function crashe via une erreur réseau de ce type, laissant l'utilisateur potentiellement bloqué avec un bouton inactif ou un état de chargement infini.

## GO / NO GO Campay réel
**NO GO CLAIR ET NET.**
Le pont réseau entre le frontend et la fonction `initiatePayment` est rompu par l'infrastructure Cloud. L'intégration réelle Campay est impossible tant que ce blocage CORS/IAM n'est pas levé.

**Action recommandée :**
Vérifier l'IAM de la Cloud Function `initiatePayment` sur la console GCP (autoriser les invocations non authentifiées pour que le SDK Firebase client gère lui-même la validation du Bearer token via `context.auth`).
