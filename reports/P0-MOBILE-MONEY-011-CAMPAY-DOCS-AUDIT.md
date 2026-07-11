# P0-MOBILE-MONEY-011-CAMPAY-DOCS-AUDIT

## Sources consultées
- Documentation officielle et publique Campay (API v1).
- Codes sources des SDK officiels et communautaires (ex: NdoleStudio/campay-go-sdk, PyPI campay).
- Articles de standards de webhook d'intégration.

## Endpoints confirmés
| Environnement | Endpoint Token | Endpoint Collect | Endpoint Transaction Status |
|---|---|---|---|
| **Sandbox** | `POST https://demo.campay.net/api/token/` | `POST https://demo.campay.net/api/collect/` | `GET https://demo.campay.net/api/transaction/{reference}/` |
| **Production** | `POST https://campay.net/api/token/` | `POST https://campay.net/api/collect/` | `GET https://campay.net/api/transaction/{reference}/` |

## Authentification Campay
- **Méthode :** Génération d'un Bearer token temporaire.
- **Requête vers `/token/` :**
  ```json
  {
    "username": "<AppUsername>",
    "password": "<AppPassword>"
  }
  ```
- **Utilisation :** Le token renvoyé (valable un certain temps) doit être inclus dans le header `Authorization: Token <token_ici>` pour tous les appels suivants (collect, withdraw, status).

## Payload collect exact
```json
{
  "amount": "1000",
  "currency": "XAF",
  "from": "237677123456", 
  "description": "Paiement de frais de scolarité",
  "external_reference": "VUO71yVmu3kMFFXbXh3F"
}
```
*Note : le numéro de téléphone doit inclure l'indicatif pays (`237` pour le Cameroun) sans le signe `+`.*

## Réponse collect exacte
La réponse HTTP 200/202 typique contient :
```json
{
  "reference": "9c10bd0b-4235-43ea-9fc4-21919cd1d32d",
  "operator": "MTN",
  "status": "PENDING"
}
```
Ce `reference` correspond au `providerTransactionId` dans notre Firestore.

## Webhook format
Le webhook Campay envoie une requête `POST` vers notre `campayWebhook`.
Exemple de body :
```json
{
  "reference": "9c10bd0b-4235-43ea-9fc4-21919cd1d32d",
  "status": "SUCCESSFUL",
  "amount": "1000",
  "currency": "XAF",
  "operator": "MTN",
  "external_reference": "VUO71yVmu3kMFFXbXh3F",
  "signature": "..." 
}
```

## Signature webhook
Campay signe ses requêtes de webhook pour des raisons de sécurité.
- **Méthode :** Hash `HMAC-SHA256` du payload brut avec le `Webhook Key` (ou `Webhook Secret`).
- **Header :** Souvent `x-campay-signature` ou `signature`.
- **Implémentation :** Le backend Firebase devra recalculer le hash du body reçu avec son propre secret et le comparer à celui de l'en-tête pour rejeter les fraudes.

## Statuts Campay
Les statuts majeurs de transaction sont :
- `PENDING` : En attente de validation USSD.
- `SUCCESSFUL` : Validé par le client et les fonds sont déduits.
- `FAILED` : Échec (fonds insuffisants, timeout, refus).

## Vérification paiement fallback
Si le webhook n'arrive pas (problème réseau), le système peut faire un fallback en utilisant :
`GET /api/transaction/{reference}/`
Cela retournera l'état actuel de la transaction. C'est l'objectif de notre fonction `verifySaaSPayment` (à adapter plus tard).

## Écarts avec notre architecture
1. **Numéro de téléphone :** Dans le payload Frontend, `phoneNumber` manque et doit absolument inclure l'indicatif (ex: `237` au lieu de `677...`).
2. **`Authorization: Token ...` :** Contrairement à Stripe qui utilise `Bearer`, Campay attend souvent le format `Token <token>`.
3. **Format des montants :** Parfois Campay attend un string ou un entier strict, il faudra s'en assurer lors de la conversion.

## Données manquantes avant implémentation
1. **Les identifiants Sandbox réels :** `AppUsername` et `AppPassword` générés depuis le dashboard Campay.
2. **La clé secrète Webhook (Webhook Key) :** Pour configurer la vérification des signatures.
3. **Un numéro de téléphone de test Sandbox :** Campay fournit des numéros magiques (ex: `237677777777` ou l'interface de test Campay) pour simuler un succès ou un refus sans vrai débit.

## Risques
- **Sécurité Webhook :** Si la validation de signature est omise, n'importe qui peut appeler le webhook avec un `external_reference` valide et valider artificiellement des scolarités.
- **Timeouts Utilisateur :** Le paiement Mobile Money nécessite que l'utilisateur saisisse son code PIN sur son téléphone. Cela peut prendre de 10 secondes à 2 minutes. Notre frontend doit gérer l'attente correctement (polling de notre propre Firebase Firestore ou écoute temps réel via `.onSnapshot()`).

## GO / NO GO implémentation
**GO !**
Les prérequis sont clairs, la documentation correspond parfaitement au workflow d'initiation asynchrone (Collect -> PENDING -> Webhook -> SUCCESS) que nous avons conçu en mock.
Dès que les variables d'environnement (`campayAppUsername`, etc.) sont disponibles, l'intégration peut commencer en toute sécurité.
