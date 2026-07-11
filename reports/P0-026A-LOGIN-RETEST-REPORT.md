# P0-026A-LOGIN-RETEST-REPORT

## URL testée
https://ecoscolaire-ghd6.vercel.app/#/login

## Comptes testés
1. `superadmin.test@ecoscolaire.com`
2. `owner.alpha@ecoscolaire.com`
3. `parent1.alpha@ecoscolaire.com`

## Résultat SuperAdmin
Échec de la connexion. L'interface affiche l'erreur générique, et la console renvoie une erreur Firebase bloquante.

## Résultat Owner
Échec de la connexion. Mêmes symptômes, blocage au niveau de l'API Firebase avant toute vérification de l'existence de l'utilisateur.

## Résultat Parent
Échec de la connexion. Identique.

## Erreur console exacte
```text
Firebase configuration error: Missing environment variable for apiKey. Check your .env file.
Firebase configuration error: Missing environment variable for authDomain. Check your .env file.
Firebase configuration error: Missing environment variable for projectId. Check your .env file.
Firebase configuration error: Missing environment variable for storageBucket. Check your .env file.
Firebase configuration error: Missing environment variable for messagingSenderId. Check your .env file.
Firebase configuration error: Missing environment variable for appId. Check your .env file.
Failed to load resource: the server responded with a status of 400 ()
Login Error: FirebaseError: Firebase: Error (auth/api-key-not-valid.-please-pass-a-valid-api-key.).
    at F (https://ecoscolaire-ghd6.vercel.app/assets/index.esm-BsCSoqDn.js:1:1339)
    at D (https://ecoscolaire-ghd6.vercel.app/assets/index.esm-BsCSoqDn.js:1:908)
    at Q (https://ecoscolaire-ghd6.vercel.app/assets/index.esm-BsCSoqDn.js:1:6962)
    at async Z (https://ecoscolaire-ghd6.vercel.app/assets/index.esm-BsCSoqDn.js:1:7095)
    at async wt (https://ecoscolaire-ghd6.vercel.app/assets/index.esm-BsCSoqDn.js:1:50123)
    at async login (https://ecoscolaire-ghd6.vercel.app/assets/index-iDjsBOF1.js:2:238045)
    at async onSubmit (https://ecoscolaire-ghd6.vercel.app/assets/index-iDjsBOF1.js:2:1196909)
```

## Erreur réseau exacte
```text
400 Bad Request
URL: https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=dummy-api-key
```
*(Notez la présence de la clé fictive "dummy-api-key" directement dans la requête réseau adressée à l'API Google Identity Toolkit).*

## Verdict
FIREBASE CONFIG ERROR
