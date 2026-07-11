# P0-021J-CAMPAY-SERVER-TO-SERVER-IMPLEMENTATION-PLAN

### AUDIT CODE EXISTANT
Après l'audit rigoureux des fichiers `functions/src/index.ts` et `functions/src/services/campayService.ts`, voici l'état actuel :
1. **`getTransactionStatus`** : Existe **déjà** dans `CampayService`.
2. **Secrets** : Les secrets (`campayAppUsername`, `campayAppPassword`, `campayEnvironment`) sont lus correctement depuis `schools/{schoolId}/secrets/payment`.
3. **Validation existante** : `campayWebhook` effectue **déjà** la validation Server-to-Server. Il ignore le statut reçu dans le payload HTTP POST, s'authentifie via le `token`, et appelle `campayService.getTransactionStatus(token, reference)`.
4. **Comparaison stricte** : Il compare **déjà** `apiAmount === txData.amount` et `apiExtRef === external_reference`.
5. **Idempotence** : Le code vérifie `if (txData.status !== 'PENDING') return;` au sein d'une transaction Firestore `db.runTransaction()`, garantissant l'absence de double-traitement concurrent.
6. **Création Payment/Receipt** : Le document `payments` est bien créé dans la transaction. Le `receipt` est généré automatiquement par le trigger asynchrone `onPaymentCreated`.

### ARCHITECTURE SERVER-TO-SERVER
L'architecture actuelle est saine et alignée avec les recommandations de sécurité. Le flux est :
1. Réception du webhook (journalisation `webhook_received_raw`).
2. Extraction `reference` & `external_reference`.
3. Lecture de la transaction PENDING locale pour récupérer `schoolId`.
4. Chargement des credentials Campay de l'école.
5. Authentification Campay API -> `token`.
6. Interrogation Campay API `/transaction/(reference)/` -> `apiTx`.
7. Si `apiTx.status == SUCCESSFUL` && montants identiques && références identiques -> Création Payment.

### FICHIERS À MODIFIER
Bien que la logique existe déjà, une révision de `functions/src/index.ts` est nécessaire pour garantir une conformité à 100% avec les exigences strictes :
- **`index.ts`** : S'assurer que le cast `Number()` est bien utilisé pour comparer de manière sûre les nombres flottants et les entiers (`Number(apiAmount) === Number(txData.amount)` est déjà présent, c'est parfait).
- Il n'y a aucune modification majeure d'architecture à effectuer, le code est déjà pré-câblé pour suivre ce paradigme défensif précis.

### TESTS À CRÉER
Créer un script Node.js dédié (ex: `scripts/test-campay-webhook-security.mjs`) pour mocker l'API Campay (via un stub HTTP interne) et simuler exhaustivement :
1. Payload webhook sans `reference`.
2. Payload avec `external_reference` inconnu.
3. Transaction locale non `PENDING`.
4. API Campay répond `FAILED`.
5. API Campay répond avec un montant différent (tentative de fraude).
6. API Campay répond avec un `external_reference` différent (usurpation).
7. Flux `SUCCESSFUL` valide complet.
8. Double exécution concurrente du webhook `SUCCESSFUL` (test idempotence).
9. Erreurs API Campay (401, 404).

### RISQUES
- **Lenteur (Timeout)** : La validation Server-to-Server rajoute deux appels HTTP (Login + Status) pendant l'exécution de la Cloud Function. Si Campay est lent, Firebase peut timeout. La Cloud Function a un délai par défaut de 60s, ce qui est généralement suffisant.
- **Émulateur** : Tester le Server-to-Server nécessite de mocker les endpoints Campay lors de l'exécution en local de Firebase Emulators.

### PLAN DE VALIDATION
1. Réviser très finement le bloc de validation croisée dans `index.ts` pour s'assurer qu'aucun bypass n'est possible.
2. Écrire et exécuter la suite de tests de sécurité `test-campay-webhook-security.mjs`.
3. Valider que les `campay_logs` reflètent toutes les tentatives défensives avec précision.
4. Compiler (`npm run build`) et s'assurer que TypeScript ne remonte aucune erreur de build sur le composant Webhook.

### VERDICT
PLAN APPROUVABLE
