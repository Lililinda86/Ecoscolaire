# P0-MOBILE-MONEY-009B-INVOKER-FIX-REPORT

## IAM avant correction
La fonction `initiatePayment` refuse l'accès externe par défaut (Cloud Functions v2), ce qui provoque l'erreur CORS bloquante. L'accès public (`allUsers`) n'est pas autorisé.

## Correction appliquée
**ÉCHEC CLI / ACTION MANUELLE REQUISE.**
La commande `gcloud` n'est pas installée sur cet environnement de travail :
```text
gcloud : Termine 'gcloud' non riconosciuto come nome di cmdlet, funzione, programma eseguibile o file script.
```

## Méthode utilisée CLI / Console
La correction automatique n'a pas pu être effectuée. Vous devez effectuer la correction **manuellement dans la Console Google Cloud** :
1. Allez sur [Google Cloud Console > Cloud Functions](https://console.cloud.google.com/functions/list?project=ecoscolaire-staging).
2. Cliquez sur la fonction **`initiatePayment`**.
3. Allez dans l'onglet **Permissions**.
4. Cliquez sur **GRANT ACCESS** (Accorder l'accès).
5. Dans "New principals" (Nouveaux comptes principaux), tapez exactement : **`allUsers`**
6. Dans "Role" (Rôle), sélectionnez **Cloud Functions Invoker** (Appeleur de fonctions Cloud).
7. Cliquez sur **Save** (Enregistrer) et validez l'avertissement "Autoriser l'accès public".

## Production impactée ?
**NON.** Les manipulations concernent exclusivement le projet `ecoscolaire-staging`.

## Test Mobile Money relancé ?
**NON.** Le test automatisé n'a pas été relancé car le blocage réseau (CORS/IAM) persistera invariablement tant que l'action manuelle ci-dessus ne sera pas exécutée.

## Résultat UI
*Non testé.*

## Transaction créée ?
*Non testé.*

## Status transaction
*Non testé.*

## Paiement créé par erreur ?
*Non testé.*

## Logs Function
*Non testé.*

## GO / NO GO Campay réel
**NO GO.**
Veuillez appliquer la permission manuellement depuis votre navigateur, puis relancer l'instruction pour redémarrer le test métier.
