# ECOSCOLAIRE-P0-CLOUD-FUNCTIONS-FORENSIC-AUDIT

## 1. Résumé Exécutif
Cet audit statique forensic du backend (Cloud Functions) révèle une architecture globalement bien pensée, avec une excellente gestion de l'idempotence et une vérification Server-to-Server robuste pour les webhooks. 
Cependant, **1 faille critique (P0)** a été identifiée, permettant le contournement total du système de paiement en production. Le score de sécurité global est impacté par la présence de code "mock" laissé actif dans l'environnement de production.

**Score de Sécurité estimé : 60/100**

---

## 2. Tableau des Fonctions

| Nom | Fichier | Type | Statut d'audit |
|---|---|---|---|
| `createSaaSCheckout` | `index.ts` | Callable | Non implémentée (Mock) |
| `campayWebhook` | `index.ts` | HTTP Webhook | Audité |
| `verifySaaSPayment` | `index.ts` | Callable | Non implémentée (Mock) |
| `dailySubscriptionCheck` | `index.ts` | PubSub Schedule | Vide (Non implémentée) |
| `initiatePayment` | `index.ts` | Callable | Audité |
| `mockConfirmPayment` | `index.ts` | Callable | Audité (CRITIQUE) |
| `onPaymentCreated` | `index.ts` | Firestore onCreate | Audité |
| `enforceStudentSaasLimits` | `index.ts` | Firestore onWrite | Audité |

---

## 3. Analyse Détaillée par Fonction

### A. `initiatePayment`
#### 1. Identification
- **Fichier** : `index.ts`
- **Type** : Callable

#### 2. Surface d'attaque
- Accessible publiquement depuis l'application via le SDK Firebase.
- Nécessite l'authentification Firebase.
- Pas de validation d'App Check explicite dans le code.

#### 3. Authentification
- Vérifie `context.auth.uid`. Refuse les appels anonymes (`unauthenticated`).
- Récupère manuellement le document utilisateur depuis `users/{uid}`.

#### 4. Autorisation
- Restreint aux rôles : `parent`, `owner`, `director`, `accountant`, `superAdmin`.
- Bloque efficacement les `teacher`, `student` et `driver`.

#### 5. Multi-tenant
- Vérifie que `user.schoolId === schoolId` (bypass pour `superAdmin`).
- Si un `studentId` est fourni, vérifie que `student.schoolId === schoolId`. **Cependant, la fonction ne vérifie pas si ce `studentId` appartient réellement au `parent` qui effectue le paiement (absence de vérification `studentId in user.studentIds`).**

#### 6. Validation des entrées
- `amount` : Doit être un nombre `> 0`.
- `phoneNumber` : Validé pour `campay` (commence par `237`, que des chiffres).
- `provider` : Restreint à `campay` ou `flutterwave`.
- **Faiblesse** : Le montant (`amount`) est défini arbitrairement par le client. La fonction ne vérifie pas la cohérence du montant avec une facture ou une scolarité due.

#### 7. Utilisation Admin SDK
- Écrit dans `transactions` (création) via `transactionRef.set()`.
- Ajoute un log dans `campay_logs`.
- Ne présente pas de faille d'élévation de privilèges contournant les règles, car elle écrit dans une collection isolée non sensible directement.

#### 8. Idempotence
- Génère un nouvel ID unique `generatedId` par appel, garantissant qu'il n'y a pas d'écrasement.

#### 10. Secrets
- Lus depuis `schools/{schoolId}/secrets/payment`.
- Non exposés ou renvoyés au client.

#### 11. Logging
- Les numéros de téléphone (`phoneNumber`) sont stockés en clair dans `campay_logs`.

---

### B. `mockConfirmPayment`
#### 1. Identification
- **Type** : Callable

#### 2-5. Surface et Autorisation
- Vérifie `context.auth`, rôles autorisés, et `user.schoolId === txData.schoolId`.

#### 7-13. Utilisation Admin SDK & Vulnérabilité
- La fonction utilise une transaction Firestore pour passer une transaction `PENDING` en statut `SUCCESS`, puis utilise l'Admin SDK pour **créer un document dans la collection `payments`**.
- **Vulnérabilité CRITIQUE** : Cette fonction ne vérifie pas si l'environnement est de type "Sandbox". Elle est active en production. Un `parent` malveillant peut initier un paiement de n'importe quel montant via `initiatePayment`, récupérer le `transactionId`, puis appeler `mockConfirmPayment(transactionId)` directement depuis la console de son navigateur pour générer un paiement valide sans débiter son compte Mobile Money.

---

### C. `campayWebhook`
#### 1. Identification
- **Type** : HTTP Request (Webhook)

#### 2. Surface d'attaque
- Endpoint public. Toute personne connaissant l'URL peut envoyer une requête POST.

#### 5. Multi-tenant
- Le `schoolId` n'est pas lu depuis la charge utile (qui pourrait être falsifiée), mais récupéré en base depuis le document `transactions` correspondant à la `external_reference`. Excellent modèle de sécurité.

#### 6. Validation des entrées
- Vérification stricte de l'existence de `external_reference` et `reference`.
- Utilisation de fallbacks robustes (`apiTx.amount ?? apiTx.amount_paid`).

#### 8 & 12. Idempotence & Transactions
- Modèle d'idempotence parfait :
  - Vérifie si le statut est `PENDING` avant la transaction Firestore.
  - Revérifie si le statut est toujours `PENDING` **à l'intérieur** du verrou de transaction (`db.runTransaction`).
  - Prévient totalement les écritures concurrentes et les "Race Conditions".

#### 9. Validation Campay
- **Faille conceptuelle apparente** : Aucune validation de signature HMAC dans l'en-tête de la requête.
- **Mitigation architecturale** : Au lieu de faire confiance au payload du webhook, la fonction effectue une vérification **Server-to-Server** en appelant l'API Campay avec la `reference` et ses secrets (`CampayService.getTransactionStatus`).
- Elle effectue ensuite une vérification croisée stricte (`isAmountMatch` et `isExtRefMatch`). Cela rend la falsification du webhook impossible, annulant l'impact de l'absence du HMAC.

---

### D. `enforceStudentSaasLimits`
#### 1. Identification
- **Type** : Firestore Trigger `onWrite` sur `students/{studentId}`.

#### 13. Vulnérabilités
- Procède à une suppression a posteriori (`transaction.delete(change.after.ref)`) si la limite de l'abonnement SaaS est atteinte. Cela signifie que l'utilisateur crée d'abord le document (s'il en a les droits Firestore), puis la fonction l'efface silencieusement par la suite. Côté client, cela peut entraîner des comportements fantômes ("ghost UI"). La limitation devrait se faire de manière préventive (via rules ou callable function).

---

## 4. Vulnérabilités Détectées

### 🚨 [P0] BACKDOOR : Validation manuelle des paiements en production
- **Localisation** : `mockConfirmPayment`
- **Explication** : Code de développement non désactivé. Permet de transformer toute transaction PENDING en paiement VALIDÉ via l'Admin SDK.
- **Impact** : Fraude financière totale. Des reçus légitimes seront générés (via `onPaymentCreated`) pour des paiements non encaissés.
- **Scénario** : Un utilisateur authentifié appelle `initiatePayment({ amount: 100000 })`, puis exécute dans la console `firebase.functions().httpsCallable('mockConfirmPayment')({ transactionId: 'id_reçu' })`.

### 🟠 [P2] Limites SaaS appliquées de façon asynchrone (Post-Création)
- **Localisation** : `enforceStudentSaasLimits`
- **Explication** : Supprime un élève après sa création si la limite d'abonnement est dépassée.
- **Impact** : Perturbation UI, facturation de lectures/écritures inutiles sur Firestore, risque de déclenchement d'autres triggers avant la suppression.

### 🟠 [P2] Montant des paiements déterminé par le client
- **Localisation** : `initiatePayment`
- **Explication** : L'argument `amount` n'est pas validé par rapport à la base de données.
- **Impact** : Possibilité de générer des reçus d'un montant arbitraire.

### 🟡 [P3] Absence de cloisonnement Parent-Enfant à l'initiation
- **Localisation** : `initiatePayment`
- **Explication** : Un parent peut payer pour l'enfant d'un autre parent de la même école.
- **Impact** : Faible (généralement non malveillant), mais révèle un manque de vérification d'appartenance stricte `user.studentIds`.

### 🟡 [P3] Journalisation de PII (Données Personnelles)
- **Localisation** : `initiatePayment` / `campayWebhook`
- **Explication** : Les numéros de téléphone et le payload Campay brut sont stockés en clair dans `campay_logs`.

---

## 5. Priorisation & Plan de Correction Recommandé

1. **IMMÉDIAT (P0)** : Restreindre `mockConfirmPayment` uniquement aux environnements de Sandbox/Test, ou la supprimer totalement.
2. **COURT TERME (P2)** : Lier la création d'élèves à une Cloud Function de validation ou sécuriser la limite directement au niveau des Firestore Rules avec un document de compteurs atomiques autorisé en incrémentation conditionnelle.
3. **COURT TERME (P2)** : Associer `initiatePayment` à une "Facture" ou "Frais" en backend pour vérifier que le montant soumis par le client correspond au montant attendu.
4. **MOYEN TERME (P3)** : Implémenter une vérification stricte `studentId` pour les parents dans `initiatePayment` et nettoyer/hacher les numéros de téléphone dans `campay_logs`.
