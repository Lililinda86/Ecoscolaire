# P0-MOBILE-MONEY-018-FIX-UNDEFINED-RECEIPT-FIELDS-REPORT

## Correction de `onPaymentCreated`
Le bug a été corrigé dans `functions/src/index.ts`. La fonction ne transmet plus jamais de champs `undefined` à Firestore.

**Modifications apportées :**
1. Création d'un helper `cleanUndefined(obj)` qui filtre toutes les clés ayant la valeur `undefined`.
2. Utilisation de valeurs de fallback robustes pour chaque champ optionnel :
   - `type: paymentData.type || paymentData.method || 'PAYMENT'`
   - `method: paymentData.method || 'unknown'`
   - `amount: paymentData.amount || 0`
   - Les dates (`date`, `createdAt`) utilisent systématiquement `admin.firestore.FieldValue.serverTimestamp()` si absentes.
3. Aucune modification n'a été apportée aux fonctions Campay, `initiatePayment` ou `mockConfirmPayment`.

## Builds et Validations
- **Cloud Functions** (`npm run build`) : Succès, aucune erreur TypeScript détectée.
- **Frontend Vite** (`npm run build`) : Succès total.

## Commit et Hash
Les modifications ont été proprement commitées et poussées sur `origin/main`.
Hash exact du commit : `4e2f207bb33278b9c5454037f790380caa529b33`

## Action Requise (Déploiement Staging)
Vous pouvez maintenant procéder au redéploiement exclusif de cette Cloud Function dans votre terminal avec la commande suivante :
```bash
firebase deploy --only functions:onPaymentCreated --project ecoscolaire-staging
```
Une fois déployée, la fonction créera les reçus sans planter sur l'erreur *"Cannot use undefined as a Firestore value"*.
