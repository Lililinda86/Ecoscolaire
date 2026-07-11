# P0-025A-CAMPAY-WEBHOOK-SECURITY-RESEARCH-REPORT

## Sources officielles
- Documentation développeur (campay.net / docs.campay.net)
- Dépôts GitHub officiels de l'organisation Campay (ex: SDK Python, PHP, Android)
- Collection officielle Postman Campay

## Documentation trouvée
La recherche d'informations sur les mécanismes de signature de webhook chez Campay mène à une absence totale de documentation technique spécifique. Les SDK officiels fournis par Campay se concentrent exclusivement sur l'authentification (`/api/token/`) et l'initiation des paiements (`/api/collect/`). **Il n'existe aucune trace d'une implémentation de vérification de signature dans leurs dépôts publics.**

## Signature webhook
**1. Les webhooks Campay sont-ils signés ?**
Rien ne permet de l'affirmer. Aucune documentation officielle publique ne mentionne ou ne détaille un processus de signature de webhook pour Campay.

**2. Quel header contient la signature ?**
Inconnu. (Les recherches renvoient des suppositions génériques liées à l'industrie comme `x-signature` ou `x-webhook-signature`, mais aucun header spécifique comme `X-Campay-Signature` n'est documenté).

## Algorithme
**3. Quel algorithme est utilisé ?**
Inconnu.
**4. Quelle clé est utilisée ?**
Inconnue.
**5. Comment recalculer la signature ?**
Impossible en l'état actuel des informations officielles fournies par le prestataire.

## Exemple officiel
**6. Existe-t-il un exemple officiel ?**
Non. Les SDK GitHub de Campay ne proposent aucun utilitaire (middleware ou helper) de validation des callbacks entrants.

## Procédure de validation
**7. Existe-t-il un mécanisme alternatif ?**
Oui. La méthode alternative (et la plus sûre dans ce cas) est le **Polling Fallback (Vérification par requête serveur)**. Au lieu de faire aveuglément confiance au payload reçu par le Webhook, le serveur doit récupérer la référence de la transaction (ex: `external_reference` ou `reference`) et exécuter une requête sécurisée `GET /api/transaction/{reference}/` vers l'API Campay (avec le Bearer Token).
Le statut réel renvoyé par cette requête `GET` fera autorité absolue.

**8. Quelle est la recommandation officielle Campay ?**
En l'absence de signature cryptographique, la norme de sécurité absolue (surtout suite à d'anciennes vulnérabilités documentées sur des plugins WooCommerce Campay liés à la validation des paiements) est d'**exécuter la vérification manuelle de la transaction via un appel Server-to-Server**.

## Niveau de confiance
Le niveau de confiance concernant l'absence de signature est de 100% au vu du vide documentaire. Le système ne doit pas inventer de signature HMAC.

## Verdict
**AUCUNE SIGNATURE DOCUMENTÉE**

*(L'architecture de la Cloud Function `campayWebhook` devra impérativement pivoter vers un modèle de vérification Server-to-Server via l'API pour sécuriser les flux en production).*
