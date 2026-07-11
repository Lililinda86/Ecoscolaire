# P0-MOBILE-MONEY-021B-SIGNATURE-RESEARCH-REPORT

## 1. Audit du code actuel

### PRÉVU
Valider de manière cryptographique les requêtes entrantes sur le webhook Campay pour garantir leur authenticité et se prémunir contre les requêtes falsifiées.

### CODÉ
Absente. Dans `functions/src/index.ts` (lignes 23-146), la fonction `campayWebhook` extrait `req.body` et procède directement aux vérifications métiers (`if (!external_reference || !status)`) et base de données. **Aucune** vérification de header ou de signature cryptographique n'est implémentée. Le champ `signature` (s'il est présent) est ignoré.

### BUILDÉ
Oui. Le code non sécurisé a été compilé avec succès (`tsc`).

### DÉPLOYÉ
Non vérifiable/Non applicable (Les modifications sécuritaires n'ont jamais été écrites ni déployées sur `ecoscolaire-staging` depuis cette session, seulement poussées vers GitHub).

### TESTÉ
Oui. Le webhook a été testé avec une payload non sécurisée ou contenant une fausse signature (`signature="manual-test"`), ce qui prouve que le code accepte des payloads falsifiées.

### VALIDÉ
Non validé côté sécurité. Le flux métier est validé (P0-021A) mais la sécurité (P0-021B) est formellement invalidée.

---

## 2. Audit Firestore

**Collections**
* `transactions` : Contient l'état du paiement (`PENDING`, `SUCCESS`, `FAILED`).
* `payments` : Créé suite à la réception d'un succès par le webhook.
* `receipts` : Créé automatiquement via un trigger `onPaymentCreated`.
* `campay_logs` : Trace détaillée de chaque appel reçu, incluant les doublons et les payloads erronées.

**Relations**
La liaison inter-collections s'opère via un identifiant unique (l'identifiant de la transaction généré avant l'appel à Campay). Dans le contexte webhook, le `transactionId` est utilisé comme `external_reference`. Il devient la clé du document `payments` et `receipts`.

**Idempotence**
Le code Firestore s'appuie sur une transaction atomique (`db.runTransaction`). L'idempotence métier est garantie en vérifiant l'état du document :
`if (txData.status !== 'PENDING') { /* log duplicate and return */ }`
Cela évite un double traitement, mais ne protège pas contre un faux appel initial si la transaction est toujours `PENDING`.

---

## 3. Audit déploiement

**Fonctions**
Non vérifiable. L'exécution de `npx firebase-tools functions:list --project ecoscolaire-staging` échoue (`Error: Failed to authenticate, have you run firebase login?`).

**Secrets**
Non vérifiable. Le code accède à `schools/{schoolId}/secrets/payment`, mais aucun accès aux secrets Firebase Config n'est possible sans authentification.

**Logs**
Non vérifiable. `gcloud` est indisponible et l'accès client aux logs Firestore de production est interdit.

---

## 4. Documentation officielle Campay trouvée

Conformément à l'interdiction de supposer et à l'obligation de s'appuyer uniquement sur des documentations officielles, mes recherches ciblées (`site:campay.net`, `site:docs.campay.net`, et `github.com` officiel) n'ont retourné **absolument aucun manuel, SDK, ni exemple de code officiel** explicitant publiquement le système de signature du webhook Campay.

* **1. signature webhook** : Non trouvée. (La documentation métier mentionnait le paramètre `signature` dans la réponse JSON, mais pas l'algorithme sous-jacent).
* **2. nom exact du header** : Non trouvée (inconnu si c'est un header ou dans la payload).
* **3. algorithme utilisé** : Non trouvée.
* **4. payload signé** : Non trouvée.
* **5. secret utilisé** : Non trouvée.
* **6. méthode de calcul** : Non trouvée.
* **7. validation recommandée** : Non trouvée.
* **8. protection replay attack** : Non trouvée.
* **9. exemples officiels** : Non trouvée.

**Niveau de confiance : 0%** (Rien de publiable sans supposition de ma part, ce qui est strictement interdit).

---

## 5. Conclusion

**B. Documentation insuffisante → blocage technique**

*Preuve / Justification :* 
Il est rigoureusement impossible d'implémenter un algorithme cryptographique sécurisé (HMAC-SHA256, RSA, concaténation spécifique, ou autre) sans la spécification exacte du fournisseur. L'intégration de la sécurité de P0-021B est donc bloquée techniquement jusqu'à l'obtention d'un guide d'intégration officiel (ex: extrait du Dashboard développeur ou réponse du support technique Campay) fournissant la documentation complète du calcul de la `signature`.
