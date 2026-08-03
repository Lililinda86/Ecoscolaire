# P0-MOBILE-MONEY-021A-END-TO-END-VALIDATION-REPORT

## 1. Réponse complète de Campay
**Échec de l'initiation du paiement.**
L'appel réseau vers `initiatePayment` n'a pas pu aboutir avec succès auprès de Campay Sandbox. La fonction Cloud Firebase a retourné une erreur interne avant même que le paiement ne soit mis en attente.
*Preuve (Sortie du terminal E2E `test-mobile-money.cjs`)* :
```
[NETWORK REQUEST] POST https://us-central1-ecoscolaire-staging.cloudfunctions.net/initiatePayment
Success message NOT visible in UI.
[BROWSER ERROR] FirebaseError: internal
Dialog opened: Erreur lors de l'initiation du paiement: internal
```

## 2. Transaction Firebase
**Échec de la récupération.**
La transaction n'a pas pu être validée ni récupérée par l'interface car le `transactionId` retourné était `null`.
*Preuve (Sortie du terminal)* :
```
Checking for pending transaction button for null...
Button "Simuler paiement réussi" NOT found.
```

## 3. Logs webhook
**Inexistants / Non déclenchés.**
Puisque l'appel `Request To Pay` vers Campay a échoué en amont (erreur interne lors du `initiatePayment`), Campay n'a jamais reçu de demande valide et n'a donc pas pu déclencher d'appel de retour (webhook) vers notre système.

## 4. Paiement créé
**Non.**
La chaîne s'étant brisée à l'initiation de la transaction, aucun document `payments` lié n'a pu être créé.

## 5. Reçu créé
**Non.**
Le déclencheur `onPaymentCreated` ne s'est pas activé faute de document `payments`, aucun reçu PDF n'a été généré.

## 6. Dashboard mis à jour
**Non.**
L'interface de l'application n'a pas affiché de succès et le rafraîchissement n'a fait remonter aucun paiement.
*Preuve (Sortie du terminal)* :
```
Success message NOT visible in UI.
```

## 7. Verdict final
**NO GO**

*Justification :* Le flux métier de bout en bout est brisé dès la première étape (`initiatePayment`). L'intégration Sandbox Campay retourne une erreur interne (probablement due à des identifiants Sandbox expirés, invalides ou une API indisponible) empêchant la création de la transaction. Il est impossible de tester le comportement du webhook tant que la création du paiement côté Campay Sandbox échoue.
