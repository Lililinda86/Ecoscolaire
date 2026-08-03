# P0-MOBILE-MONEY-021A-INITIATEPAYMENT-ERROR-DIAGNOSTIC-REPORT

## Log exact
**Non récupéré.**
La commande `gcloud` n'est pas installée sur la machine d'exécution (`Get-Command : Termine 'gcloud' non riconosciuto`). De plus, la tentative de lecture via `firebase-tools` échoue par manque d'authentification, et la lecture directe via le SDK Client a été bloquée par les règles de sécurité Firestore (`FirebaseError: Missing or insufficient permissions` sur `campay_logs`).

## Cause racine
**Inconnue (limitée à l'analyse du code).**
D'après le code de `initiatePayment` (fichier `functions/src/index.ts`), l'erreur `FirebaseError: internal` ne se produit que lorsque `campayService.login` ou `campayService.requestToPay` déclenche une exception, forçant l'exécution du bloc `catch` qui renvoie : `throw new functions.https.HttpsError('internal', ...)` en masquant le détail exact au client. Conformément à vos consignes, nous ne supposons pas que les credentials sont invalides sans preuve, mais un échec HTTP s'est produit avec l'API Campay.

## Transaction créée ou non
**Non.**
Dans `initiatePayment`, la sauvegarde de la transaction (`await transactionRef.set(transactionData)`) se trouve *après* le bloc d'appel à Campay. Puisque l'appel lève une exception (`throw`), la fonction s'interrompt et la transaction n'est jamais écrite dans Firestore.
*Preuve* : Le script E2E affiche `Checking for pending transaction button for null...` confirmant que `initiatePayment` n'a retourné aucun ID.

## Campay appelé ou non
**Oui (tentative).**
La fonction a exécuté `campayService.login()` et/ou `requestToPay()`. C'est l'échec de l'une de ces méthodes qui a déclenché l'exception.

## campay_logs créé ou non
**Oui (théoriquement).**
Le code source montre qu'avant de `throw` l'erreur interne, la fonction exécute :
```typescript
await db.collection('campay_logs').add({
  requestType: 'request_to_pay',
  status: 'FAILED',
  ...
});
```
Bien que le log ait été sauvegardé côté serveur, nous n'avons pas la permission de le lire avec nos outils actuels pour en extraire le `errorMessage`.

## Action corrective proposée
Exécuter la requête de logs directement depuis une machine authentifiée (votre poste local) à l'aide de :
`npx firebase-tools functions:log --only initiatePayment --project ecoscolaire-staging`
ou
Lire le dernier document dans la collection `campay_logs` depuis la console Firebase pour obtenir la valeur de `errorMessage`.

## GO / NO GO correction
**NO GO**

*Justification* : Aucune correction ne peut être proposée tant que le message d'erreur exact renvoyé par Campay n'a pas été lu depuis les logs serveurs.
