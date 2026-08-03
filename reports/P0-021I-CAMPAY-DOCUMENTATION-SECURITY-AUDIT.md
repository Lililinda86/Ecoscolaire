# P0-021I-CAMPAY-DOCUMENTATION-SECURITY-AUDIT

### SOURCES ANALYSÉES
- Documentation officielle Campay API fournie (Postman) : `https://documenter.getpostman.com/view/2391374/T1LV8PVA`
- Collection exportée via l'API Postman : `https://documenter.gw.postman.com/api/collections/2391374/T1LV8PVA`

### ENDPOINTS IDENTIFIÉS
1. **`/token/`** : Get access token (Authentification)
2. **`/collect/`** : Request Payment
3. **`/get_payment_link/`** : Payment Links
4. **`/transaction/(reference)/`** : Transaction Status
5. **`/withdraw/`** : Withdraw funds
6. **`Webhook or Callback`** : Configuration du callback
7. **`/balance/`** : Get Application Balance
8. **`/history/`** : Transaction History
9. **Mass Payouts & Utilities**

### WEBHOOK / CALLBACK
- **Section existante** : OUI (Sous l'entrée "Webhook or Callback").
- **Champs envoyés par Campay (POST JSON)** : 
  `status`, `reference`, `amount`, `currency`, `operator`, `code`, `operator_reference`, `signature`, `endpoint`, `external_reference`, `external_user`, `extra_first_name`, `extra_last_name`, `extra_email`, `phone_number`, `redirect_url`, `failure_redirect_url`, `description`, `reason`.

### SIGNATURE CRYPTOGRAPHIQUE
- **Header de signature** : NON (La signature n'est pas dans un header HTTP).
- **Nom exact du champ** : C'est la clé `signature` directement à l'intérieur du payload JSON.
- **Algorithme exact** : NON DÉFINI explicitement (La documentation mentionne uniquement "jwt token").
- **Secret utilisé** : "your app webhook key".
- **Méthode de calcul** : Validation standard de token JWT (non détaillée).
- **Exemple officiel** : NON (Aucun payload JSON brut d'exemple n'est fourni).

### VALIDATION SERVER-TO-SERVER
- **Endpoint GET transaction status** : OUI.
- **URL exacte** : `/transaction/(reference)/` (ex: `https://demo.campay.net/api/transaction/(reference)/`).
- **Paramètre exact** : `reference` (L'UUID Campay, transmis dans le path de l'URL, à ne pas confondre avec `external_reference`).
- **Réponse exacte attendue** (HTTP 200) :
```json
{
    "reference": "85ac913b-...",
    "external_reference": "",
    "status": "SUCCESSFUL",
    "amount": 2.0,
    "currency": "XAF",
    "operator": "MTN",
    "code": "D201102W0002LK",
    "operator_reference": null,
    "description": "Test",
    ...
}
```

### ÉLÉMENTS MANQUANTS
- Il manque l'algorithme exact de signature JWT (HS256, RS256, etc.) et un exemple officiel de payload webhook pour pouvoir implémenter sereinement la vérification purement cryptographique de manière stricte (sans essai-erreur).

### DÉCISION TECHNIQUE
EcoScolaire doit utiliser la **Validation Server-to-Server via l'API Campay** en priorité. 
Dès réception du webhook, la fonction doit extraire le champ `reference` du body, s'authentifier auprès de Campay avec le `/token/`, puis appeler l'endpoint `/transaction/(reference)/` pour obtenir la source de vérité absolue sur le `status` et l'`amount`. La validation JWT locale pourra être ajoutée en première ligne de défense, mais le Server-to-Server est documenté de manière exhaustive et offre la sécurité maximale sans ambiguïté.

### VERDICT
SIGNATURE NON DOCUMENTÉE MAIS SERVER-TO-SERVER POSSIBLE
