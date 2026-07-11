# P0-MOBILE-MONEY-020-FIX-SANDBOX-ACTIVATION-REPORT

## Correction apportée
L'activation de l'environnement Sandbox pour Campay dans `initiatePayment` a été corrigée. Auparavant, la logique s'appuyait de manière redondante sur une variable issue du frontend (`campayRealEnabled`).

Désormais, l'activation est **exclusivement** dictée par la présence des identifiants (username/password) et la valeur de la configuration en base de données : `secrets.campayEnvironment === 'sandbox'`.

## Fichiers modifiés
- `[MODIFY] functions/src/index.ts` :
  - Suppression de `campayRealEnabled` de la déstructuration de `data`.
  - Simplification de la condition : `if (secrets.campayEnvironment === 'sandbox')`.

## Résultat
- Si `campayEnvironment` vaut `"sandbox"` et que les credentials sont présents, l'appel à la Sandbox via `CampayService` est déclenché.
- Le paramètre `campayRealEnabled` envoyé (ou non) par le frontend n'a plus aucun impact.
- Si le `campayEnvironment` n'est pas `"sandbox"`, le flux tombe automatiquement dans la boucle MOCK.
- Aucun changement sur `mockConfirmPayment` ni `onPaymentCreated`.

## Tests & Build
- Le backend a été compilé avec succès (`npm --prefix functions run build`).

## Commit et Push
Le correctif est poussé sur la branche `main`.
**Hash du commit :** `50814ed`

> [!TIP]
> Vous pouvez tester à nouveau. L'initialisation en Sandbox devrait s'activer correctement dès l'instant où `campayEnvironment: "sandbox"` est présent dans le document Firestore `schools/{schoolId}/secrets/payment`.
