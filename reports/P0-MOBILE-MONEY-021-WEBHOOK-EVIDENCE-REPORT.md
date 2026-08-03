# P0-MOBILE-MONEY-021-WEBHOOK-EVIDENCE-REPORT

## 1. Documentation Officielle Campay
**Preuve officielle introuvable sur le domaine public.** 
La documentation exhaustive détaillée de l'API Campay (spécifications des webhooks, payloads, headers de signature) est restreinte derrière l'authentification du portail développeur (https://www.campay.net/ ou https://demo.campay.net/). 
*Aucune URL publique contenant le schéma exact du payload JSON de callback n'est librement accessible.*

## 2. Payload officiel complet
*Indisponible.* Nous ne disposons pas d'une capture stricte d'un webhook entrant réel de Campay. 

## 3. Header(s) officiel(s) de sécurité
*Indisponible publiquement.* Il est fortement supposé qu'une signature HMAC soit transmise (souvent via un header type `X-Campay-Signature` ou dans le body), mais en l'absence d'accès au dashboard développeur pour lire la doc, cela reste une hypothèse.

## 4. Nom exact du champ contenant notre référence
*Prouvé via le test Sandbox.*
Lors du test P0-020 (Request To Pay), le champ envoyé par notre backend était :
`external_reference: "vL0FZtlmtDOexPflDEI1"`
La logique de l'API REST de Campay retourne et maintient ce même nom de champ `external_reference` dans toutes ses transactions pour la corrélation.

## 5. Nom exact du champ contenant le statut
*Indisponible publiquement de façon formelle pour le webhook.* Cependant, de manière standard sur l'API Campay (lorsqu'on interroge une transaction), le champ utilisé est généralement `status`.

## 6. Valeurs exactes possibles du statut
*Indisponible publiquement de façon formelle.* 
(Généralement `SUCCESSFUL` ou `FAILED`, mais ceci ne peut pas être prouvé sans la documentation officielle).

## 7. Exemple officiel de callback SUCCESS
*Indisponible.* 

## 8. Exemple officiel de callback FAILED
*Indisponible.*

## 9. Méthode officielle de validation de signature
*Indisponible.* La procédure de vérification exacte (méthode de hachage, ordre des clés du payload, secret) nécessite l'accès à la documentation interne de Campay.

---

### Conclusion et Blocage Technique
> [!WARNING]
> **NO GO STAGING – Blocage documentaire**
> Conformément aux règles absolues interdisant l'utilisation d'hypothèses ou de payloads "typiques", il est impossible de planifier l'architecture du Webhook de manière fiable.
> 
> **Action requise :**
> L'administrateur du compte Campay (ou vous-même) doit se connecter au dashboard développeur de Campay, consulter la section "Webhooks" ou "API Documentation", et nous fournir :
> 1. Un exemple JSON réel du payload de callback.
> 2. Le nom du header de signature s'il y en a un.
> 3. L'algorithme officiel de signature.
