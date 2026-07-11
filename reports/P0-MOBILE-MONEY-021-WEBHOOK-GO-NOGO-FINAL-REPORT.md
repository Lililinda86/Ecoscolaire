# P0-MOBILE-MONEY-021-WEBHOOK-GO-NOGO-FINAL-REPORT

## 1. Informations officiellement prouvées

### ÉTAPE 1 : Analyse des champs

| Élément | Prouvé | Source documentaire |
| :--- | :--- | :--- |
| `reference` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `external_reference` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `status` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `amount` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `currency` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `operator` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `code` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `operator_reference` | OUI | Documentation "Webhook ou rappel" & JSON "Etat de la transaction" |
| `signature` | OUI | Documentation "Webhook ou rappel" & phrase sur la "clé webhook" |

---

## 2. Informations encore manquantes (ÉTAPE 2)

**A. Informations indispensables (pour validation crypto)**
* L'algorithme cryptographique exact utilisé pour générer la signature (ex: HMAC-SHA256, HMAC-SHA512).
* La structure exacte de la chaîne de caractères à signer (ex: payload brut entier vs concaténation de certains champs).

**B. Informations souhaitables (pour robustesse métier)**
* La liste exhaustive des valeurs possibles pour le champ `status` (ex: SUCCESS, FAILED, PENDING).
* La politique de relance (retries) du webhook de Campay (nombre de tentatives en cas d'erreur HTTP, intervalles).

**C. Informations facultatives**
* Les adresses IP d'expédition de Campay (pour un éventuel filtrage réseau).

---

## 3. Risques résiduels

* **Usurpation (Spoofing)** : Sans l'implémentation de la validation cryptographique (due à l'absence de l'algorithme exact), n'importe qui connaissant l'URL du webhook et une `external_reference` valide pourrait forger une requête `POST` et valider frauduleusement une transaction.
* **Duplication** : En l'absence de documentation sur l'idempotence et les retries de Campay, nous pourrions traiter deux fois le même callback.

---

## 4. GO ou NO GO pour implémentation webhook métier (ÉTAPE 3)

**GO P0-021A**

L'implémentation du flux métier strict est désormais possible et certifiée par la documentation :

* **Réception webhook** : OUI, le format JSON et les champs attendus sont identifiés formellement.
* **Lecture external_reference** : OUI, le champ est explicitement documenté et lié à notre système.
* **Recherche transaction Firestore** : OUI, via la `external_reference`.
* **Contrôle statut PENDING** : OUI, le champ `status` est confirmé et utilisable.
* **Mise à jour transaction** : OUI, les données nécessaires (`amount`, `currency`, `operator`) sont fournies.
* **Création payment** : OUI, la `reference` Campay est prouvée et utilisable pour la traçabilité.
* **Déclenchement automatique du reçu** : OUI, la suite du flux métier peut s'exécuter.

---

## 5. GO ou NO GO pour validation cryptographique (ÉTAPE 4)

**NO GO P0-021B**

**Justification documentaire :**
Bien que la présence du champ `signature` soit prouvée, tout comme l'existence d'une "clé webhook" pour valider la requête, **aucun algorithme cryptographique ni format de signature n'est explicité** dans les preuves fournies. Étant donné l'interdiction absolue de supposer un algorithme ou de deviner la structure de la chaîne signée, l'implémentation d'une validation cryptographique sécurisée est techniquement impossible en l'état.

---

## 6. Recommandation finale

1. Procéder à l'implémentation du flux métier du webhook (GO P0-021A) puisque la structure du payload et les identifiants clés (comme `external_reference`) sont validés.
2. Bloquer ou simuler l'étape de validation cryptographique (NO GO P0-021B) jusqu'à ce que les spécifications exactes de l'algorithme de signature soient obtenues du support technique Campay. En attendant, le webhook ne doit pas être exposé publiquement en production sans sécurité compensatoire.
