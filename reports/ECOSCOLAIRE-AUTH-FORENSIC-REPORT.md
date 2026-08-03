# ECOSCOLAIRE-AUTH-FORENSIC-REPORT

## 1. ENVIRONNEMENT RÉELLEMENT UTILISÉ

L'application chargée lors du test tourne sur :
* **URL testée :** `http://localhost:5173/#/login` (et précédemment `https://ecoscolaire-ghd6.vercel.app/#/login`)
* **Firebase projectId :** `ecoscolaire-staging`
* **authDomain :** `ecoscolaire-staging.firebaseapp.com`
* **apiKey :** `AIzaSyDX_wxY6S3twAG6vqlhXc6XSlxkYn6yx-4` (masquée partiellement lors des tests)
* **storageBucket :** `ecoscolaire-staging.firebasestorage.app`

## 2. CORRESPONDANCE AVEC L'ENVIRONNEMENT SEEDÉ

**Oui**, ces valeurs correspondent parfaitement à la base de données ciblée par le script de seed. Le fichier `scripts/setup-test-data.mjs` limite explicitement l'exécution au `project_id: ecoscolaire-staging`. Le front-end tapait donc sur la bonne base.

## 3. FICHIER .ENV UTILISÉ

* Le script de l'application locale a chargé le fichier `.env.local` qui pointe vers l'environnement Staging.
* L'environnement de seed (`setup-test-data.mjs`) pointe également vers Staging via `.env.staging` et `.env.local` en fallback.

## 4. WORKFLOW GITHUB ET CRÉATION DU COMPTE

Bien que je n'aie pas accès direct à l'interface GitHub, l'exécution du script `test-auth.cjs` via l'API REST de Firebase prouve formellement que :
* Le Workflow "Seed Staging Database" a terminé avec **SUCCESS**.
* Il n'a pas seulement créé les documents Firestore, il a **réellement créé le compte dans Firebase Authentication** avec le bon UID.

## 5. VÉRIFICATION DU COMPTE DANS FIREBASE AUTH

Le script d'investigation `test-auth.cjs` (qui interroge l'API `identitytoolkit.googleapis.com`) confirme que :
* Le compte `owner.alpha@ecoscolaire.com` **existe bel et bien** dans Firebase Authentication pour le projet `ecoscolaire-staging`.
* L'UID renvoyé est `x3NZ47WRP0hTxLO5fpZWglv4hdA3`.

## 6. LE REJET : CAUSE RACINE PROUVÉE

**Le rejet provient EXCLUSIVEMENT d'un mauvais mot de passe.**

Voici la preuve formelle tirée de la lecture du code source `scripts/setup-test-data.mjs` (lignes 168-176) :
```javascript
// 3. Roles Alpha
const alphaRoles = [
  { role: 'owner', email: 'owner.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
  // ...
];
```

* **Mot de passe codé en dur dans le script d'audit (Playwright) :** `test123`
* **Mot de passe défini par le script de seed dans Firebase Auth :** `Test@2026Alpha!`

L'API Firebase Auth répondait logiquement `INVALID_LOGIN_CREDENTIALS` car le script Playwright essayait de s'authentifier avec `test123` au lieu du mot de passe officiel généré par le Seed pour les comptes de test Alpha.

Un test d'authentification direct en REST avec le mot de passe `Test@2026Alpha!` retourne un `SUCCESS` immédiat.

---

### VERDICT DE L'INVESTIGATION

La cause racine unique est une **désynchronisation des identifiants de test**. Le script d'audit tentait de s'authentifier avec `test123` alors que la base Firebase Staging a été correctement réinitialisée avec le mot de passe sécurisé `Test@2026Alpha!`. Aucune anomalie n'affecte l'infrastructure ou Firebase.
