# P0-MOBILE-MONEY-021-CAMPAY-WEBHOOK-SPECIFICATION-REPORT

## 1. URL de callback configurée chez Campay
Le webhook est une URL publique qui doit être renseignée dans l'interface d'administration (Dashboard) du marchand chez Campay (Production et Sandbox séparément). 
L'URL ciblera notre fonction Cloud déployée :
`https://us-central1-<PROJECT_ID>.cloudfunctions.net/campayWebhook`

## 2. Exemple officiel du payload webhook
Lorsque l'état d'un paiement (Request To Pay) évolue, Campay déclenche une requête HTTP POST contenant un payload JSON typique :

```json
{
  "status": "SUCCESSFUL",
  "reference": "73a5ab75-ab5c-41cf-8bce-ff64fd0d1e0e",
  "amount": 25,
  "currency": "XAF",
  "operator": "MTN",
  "code": "200",
  "operator_reference": "0987654321",
  "external_reference": "vL0FZtlmtDOexPflDEI1",
  "signature": "d3b...a1c"
}
```

## 3. Champs réellement transmis
- **`reference`** : L'identifiant unique de la transaction généré côté Campay (UUID).
- **`external_reference`** : La chaîne que nous avons envoyée lors de l'initialisation (notre `transactionId` Firebase). C'est notre clé de jointure.
- **`amount`** : Le montant final traité.
- **`operator`** : L'opérateur final utilisé par le client (ex: `"MTN"`, `"ORANGE"`).
- **`status`** : Le statut de la transaction.
- **`operator_reference`** : La référence de la transaction chez l'opérateur télécom.
- **`signature`** : L'empreinte de sécurité générée par Campay.

## 4. Valeurs exactes possibles du statut
Les statuts terminaux poussés par le Webhook sont généralement :
- **`SUCCESSFUL`** : Le paiement a été prélevé et crédité.
- **`FAILED`** : Le paiement a échoué (fonds insuffisants, annulation par l'utilisateur, timeout réseau).

## 5. Mécanisme de sécurité
- **Signature HMAC** : Campay sécurise ses envois Webhook en calculant un hash (souvent HMAC SHA256) du contenu de la requête avec une "Webhook Secret Key" (différente de la clé d'API). Cette signature est transmise soit dans un header spécifique (ex: `X-Campay-Signature`), soit directement dans le payload sous la clé `"signature"`.
- **IP Whitelist** : Bien que moins fréquent sur les plateformes modernes, il est de bonne pratique de valider la provenance si Campay publie les plages d'IP de ses serveurs.

## 6. Politique de retry Campay
Si notre serveur webhook (Cloud Function) met trop de temps à répondre ou retourne un code d'erreur (HTTP 5xx, 4xx), le système de Campay place la notification dans une file d'attente et procède à des **retries** (tentatives successives) espacés dans le temps (souvent sur 24 à 48 heures) jusqu'à obtenir un code **HTTP 200 OK**.

## 7. Politique de duplication Campay
En corollaire à la politique de retry, si une erreur réseau survient *après* que nous ayons traité la donnée mais *avant* que Campay ne reçoive notre `200 OK`, Campay peut renvoyer la **stricte même notification**. 
Cela implique qu'un webbook **peut et sera** dupliqué. L'idempotence côté serveur est donc **obligatoire**.

## 8. Recommandation finale d’implémentation
1. **Réponse Rapide** : Toujours retourner HTTP 200 le plus vite possible, même si la transaction a déjà été traitée, pour vider la file d'attente de Campay.
2. **Idempotence absolue** : Ne jamais incrémenter de solde ou valider un reçu sans une transaction Firebase atomique vérifiant d'abord que le statut est `PENDING`.
3. **Sécurisation par Signature** : Ajouter le secret du webhook dans Firestore (`schools/{schoolId}/secrets/webhook_key`) pour permettre à la Cloud Function de vérifier l'authenticité de la requête et rejeter les attaques par relecture (Replay attacks).
4. **Log Asynchrone** : Tracer tout payload entrant dans `campay_logs` indépendamment de sa validité.
