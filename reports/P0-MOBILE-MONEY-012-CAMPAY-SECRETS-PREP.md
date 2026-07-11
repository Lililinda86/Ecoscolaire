# P0-MOBILE-MONEY-012-CAMPAY-SECRETS-PREP

## École test utilisée
L'audit se base sur la structure générique des écoles dans Firestore, mais s'appliquera typiquement à l'école `school-alpha-001` (utilisée lors de nos tests Playwright).

## Document secret existant ?
Le document visé est : `/schools/{schoolId}/secrets/payment`.
Ce document est prévu par l'architecture (le code source de `Settings.tsx` l'écrit déjà lorsqu'on saisit un "Campay Secret"), mais sa structure actuelle est rudimentaire.

## Champs présents (Actuels dans `Settings.tsx`)
- `campaySecret` : String (saisi dans l'interface).
- `updatedAt` : Timestamp.

## Champs manquants
L'API Campay moderne nécessite un `AppUsername` et un `AppPassword` séparés pour générer un Token, plutôt qu'un seul "Secret". Il manque également la configuration de l'environnement (Sandbox/Prod) et la clé de signature du Webhook.
Les champs manquants sont :
- `campayAppUsername` (Sandbox/Production)
- `campayAppPassword` (Sandbox/Production)
- `campayEnvironment` (sandbox | production)
- `campayWebhookSecret` (Pour la vérification de signature HMAC-SHA256)

## Rules sécurité secrets
La sécurité définie dans `firestore.rules` est **impeccable** :
```javascript
match /schools/{schoolId} {
  match /secrets/{secretId} {
    allow read: if false;
    allow create, update: if isAuthenticated() && isActive() && (isSuperAdmin() || isOwner()) && hasSchoolAccess(schoolId);
    allow delete: if isAuthenticated() && isActive() && isSuperAdmin();
  }
}
```
- Le Frontend (n'importe quel rôle, même Owner) **ne peut pas** relire les secrets une fois écrits.
- La Cloud Function (qui utilise l'Admin SDK) **contourne nativement** ces règles et lira le document avec `db.collection('schools').doc(schoolId).collection('secrets').doc('payment').get()`. L'isolation est totale.

## Settings UI compatible ?
L'interface UI (`src/pages/Settings.tsx`) est **partiellement compatible** :
- Elle permet bien de sauvegarder un secret sans jamais l'afficher (elle affiche un badge "🟢 Secret Campay configuré" si `hasCampaySecret` est `true` dans `paymentSettings`).
- **Cependant**, elle ne possède qu'un seul champ de saisie texte (`campaySecretInput`). Elle ne gère pas les champs séparés pour `AppUsername`, `AppPassword` ou `Environment`.

## Modèle final recommandé
Pour intégrer Campay dans les règles de l'art, le document `/schools/{schoolId}/secrets/payment` devra ressembler à ceci :
```json
{
  "campayAppUsername": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "campayAppPassword": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "campayWebhookSecret": "secret-de-signature-optionnel",
  "campayEnvironment": "sandbox",
  "currency": "XAF",
  "updatedAt": "2026-06-14T12:00:00.000Z"
}
```

## Action manuelle à faire dans Firebase Console
Comme le Frontend actuel ne permet d'enregistrer qu'un seul champ (`campaySecret`), vous avez deux options pour préparer l'environnement de test (sans modifier le code UI) :
1. Aller dans la **Firebase Console** -> **Firestore Database**.
2. Naviguer vers `/schools/school-alpha-001/secrets/payment`.
3. Créer le document (s'il n'existe pas) et y injecter manuellement les champs :
   - `campayAppUsername`
   - `campayAppPassword`
   - `campayEnvironment` = `sandbox`
*(Ces identifiants doivent être récupérés sur votre Dashboard de test sur demo.campay.net).*

## GO / NO GO implémentation Campay
**GO implémentation préparatoire.**
L'architecture de sécurité est prête et validée par les Rules. Puisque l'interface ne gère pas tous les champs Campay complexes, nous pouvons tout à fait modifier le Backend (`initiatePayment`) pour qu'il aille lire `campayAppUsername` et `campayAppPassword` dans Firestore, à condition que vous alliez injecter ces variables manuellement dans la console Firebase pour `school-alpha-001`. 
Dès que vous aurez mis vos secrets Sandbox dans Firestore, le Backend sera capable de s'y connecter de manière 100% sécurisée et invisible !
