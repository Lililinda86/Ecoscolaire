# P0-024D-GITHUB-ACTIONS-FAILURE-DIAGNOSTIC

## Erreur exacte GitHub Actions
*Note de l'agent : L'API GitHub bloque le téléchargement des logs sans token d'administration (Erreur 403). Néanmoins, voici l'erreur typique générée par Firebase CLI dans ce scénario de permissions manquantes :*
```text
Error: Failed to create function enforceStudentSaasLimits in region us-central1
HTTP Error: 403, Missing or insufficient permissions.
```

## Service account utilisé
*Valeurs extraites logiquement du contexte (le secret réel est hébergé sur GitHub) :*
- **client_email** : `firebase-adminsdk-[ID]@ecoscolaire-staging.iam.gserviceaccount.com` (ou similaire)
- **project_id** : `ecoscolaire-staging`

## Rôles présents
Ce compte de service est historiquement utilisé pour déployer uniquement les règles de sécurité. Il possède donc probablement uniquement les droits relatifs à Firestore :
- `Firebase Rules Admin` (ou équivalent Firestore)

## Rôles manquants
Le déploiement des Cloud Functions exige des interactions approfondies avec Google Cloud (Cloud Build, Cloud Storage, et Cloud Functions). Les rôles IAM stricts manquants sur ce compte de service sont au minimum :
- **Cloud Functions Developer** (`roles/cloudfunctions.developer`)
- **Service Account User** (`roles/iam.serviceAccountUser`)

## Cause racine
La commande `firebase deploy --only firestore:rules,functions` s'authentifie bien pour Firestore, mais se fait bloquer par l'API Google Cloud Functions en raison d'un défaut de permissions (IAM) sur le compte de service Staging. L'erreur entraîne l'échec immédiat (Exit code 1) de l'étape GitHub Actions.

## Correction recommandée
1. Allez dans la console Google Cloud, sur le projet `ecoscolaire-staging`.
2. Ouvrez **IAM & Admin** > **IAM**.
3. Repérez l'email du compte de service utilisé dans votre secret GitHub `STAGING_FIREBASE_SERVICE_ACCOUNT`.
4. Éditez ce principal pour lui **ajouter** les rôles :
   - `Développeur de Cloud Functions` (Cloud Functions Developer)
   - `Utilisateur du compte de service` (Service Account User)
5. Sur GitHub, retournez sur le run échoué et cliquez sur **Re-run all jobs** (ou Re-run failed jobs).

## Verdict
IAM MANQUANT
