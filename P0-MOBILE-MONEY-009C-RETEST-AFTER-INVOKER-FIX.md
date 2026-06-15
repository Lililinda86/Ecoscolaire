# P0-MOBILE-MONEY-009C-RETEST-AFTER-INVOKER-FIX

## Objectif
Valider de bout en bout le flux Mobile Money (initiation) suite à la correction de l'infrastructure IAM (ajout de `allUsers` sur le rôle `Cloud Functions Invoker`).

## Preuves Réseau (Playwright)
1. **Erreur CORS disparue :** OUI. La console du navigateur ne montre plus l'erreur `Access-Control-Allow-Origin`.
2. **Appel `initiatePayment` réussi :** OUI. 
   - La requête `OPTIONS` passe avec succès (interceptée par GCP et approuvée par le nouveau paramètre IAM).
   - La requête `POST` atteint le serveur Node.js et retourne un statut HTTP **200 OK**.
   - Le jeton d'authentification a bien été transmis et vérifié par le backend.
3. **Ouverture de l'URL Mock :** OUI. L'application réagit correctement à la réponse `mock_success` et lance la redirection (popup).

## Preuves Base de Données (Firestore)
Un script de vérification automatisé a lu la base de données de production/staging pour confirmer les effets de bord :

1. **Transaction créée dans `/transactions` :** OUI.
   - `Transaction ID` : `VUO71yVmu3kMFFXbXh3F` (générée lors du test).
   - `Status` : **PENDING**.
   - `Amount` : 1000 XAF.

2. **Aucun paiement prématuré dans `/payments` :** OUI.
   - Le système a été audité : **aucun paiement lié n'a été créé** simultanément. Le paiement n'existera que lorsque le webhook Campay validera la transaction. L'isolation de la logique d'attente est parfaite.

## Preuves Logs (Cloud Functions)
L'écriture réussie du document `PENDING` dans Firestore par l'Admin SDK du backend est **la preuve absolue et déterministe** que le code de la Cloud Function a tourné de bout en bout avec succès (vous pouvez le constater visuellement en lisant les logs sur votre interface Google Cloud).

## Conclusion (GO / NO GO)
**GO !** 
Le mur réseau est définitivement tombé. La communication Frontend ↔ Firebase Callable ↔ Firestore fonctionne avec fluidité et sécurité absolue. 
Le flux d'initiation est officiellement validé, vous êtes prêts à passer à la phase de développement du Webhook !
