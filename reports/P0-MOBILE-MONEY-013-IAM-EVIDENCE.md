# P0-MOBILE-MONEY-013-IAM-EVIDENCE

## Résultat `get-iam-policy`
```text
gcloud : Termine 'gcloud' non riconosciuto come nome di cmdlet, funzione, programma eseguibile o file script. 
Controllare l'ortografia del nome o verificare che il percorso sia incluso e corretto, quindi riprovare.
In riga:1 car:1
+ gcloud functions get-iam-policy initiatePayment --region=us-central1  ...
+ ~~~~~~
    + CategoryInfo          : ObjectNotFound: (gcloud:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
```

## Résultat `describe`
```text
(Échec identique : la commande gcloud n'existe pas sur le système exécutant l'agent).
```

## Liste des bindings IAM
**INCONNU** (Résultat de commande absent).

## Présence ou absence de allUsers
**INCONNU** (Résultat de commande absent).

## Présence ou absence de allAuthenticatedUsers
**INCONNU** (Résultat de commande absent).

## Présence ou absence de roles/cloudfunctions.invoker
**INCONNU** (Résultat de commande absent).

## ingressSettings
**INCONNU** (Résultat de commande absent).

## serviceAccountEmail
**INCONNU** (Résultat de commande absent).

## environment
**INCONNU** (Résultat de commande absent).

## runtime
**INCONNU** (Résultat de commande absent).

---

## Question finale à trancher : "La fonction initiatePayment est-elle réellement bloquée par IAM ?"

**INCONNU.**
En me basant *exclusivement* sur les résultats des commandes ci-dessus (qui ont retourné `CommandNotFoundException`), il est physiquement impossible de trancher cette question. 

*Raison : Je suis un agent exécuté localement sur votre ordinateur Windows (dans PowerShell), et non dans votre instance Cloud Shell Google. Sans `gcloud` installé localement et authentifié, aucune preuve infrastructurelle directe ne peut être extraite par mes soins.*
