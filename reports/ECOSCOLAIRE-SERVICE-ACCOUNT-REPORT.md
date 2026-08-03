# ECOSCOLAIRE-SERVICE-ACCOUNT-REPORT

## 1. ADMINISTRATION DU PROJET FIREBASE
Le projet EcoScolaire déploie ses ressources Firebase de manière très structurée et sécurisée :
- **Production (`ecoscolaire-c5861`)** : Administrée via **Google Workload Identity Federation**. Le déploiement s'effectue sans aucune clé privée persistante via l'action `google-github-actions/auth@v2` dans `.github/workflows/firebase-deploy.yml`.
- **Staging (`ecoscolaire-staging`)** : Administrée via une clé de compte de service classique injectée sous forme de variable d'environnement (Secret).

## 2. AUDIT DES PISTES ET STOCKAGE DU SERVICE ACCOUNT

| Piste de recherche | Résultat | Preuve | Niveau de Confiance |
|---|---|---|---|
| `staging-service-account.json` | **Non trouvée** | Fichier absent du répertoire local. | 100% |
| `service-account.json` | **Non trouvée** | Fichier absent du répertoire local. | 100% |
| `GOOGLE_APPLICATION_CREDENTIALS` | **Non trouvée** | Absent des fichiers `.env` et `.env.staging`. | 100% |
| `FIREBASE_SERVICE_ACCOUNT` | **Non trouvée** | Non utilisé directement (Workload Identity utilisé en prod). | 100% |
| **GitHub Actions Secrets** | **TROUVÉE** | Référencé dans `.github/workflows/ci.yml` et `validate-staging.yml` via `${{ secrets.STAGING_FIREBASE_SERVICE_ACCOUNT }}`. | **100%** |
| **Vercel Environment Variables** | **Présumée** | Le projet étant hébergé sur Vercel, il est fort probable que le secret y figure pour le front-end, bien que les Actions GitHub soient la source de vérité pour les scripts. | Élevé |

## 3. OÙ EST STOCKÉ LE SERVICE ACCOUNT ?
Le compte de service pour l'environnement de test (Staging) **existe déjà**. Il est stocké de manière sécurisée dans le coffre-fort des **GitHub Secrets** du dépôt sous le nom de variable `STAGING_FIREBASE_SERVICE_ACCOUNT`. 
Il n'est pas nécessaire de le régénérer depuis la Google Cloud Console, sauf compromission avérée.

## 4. CONCLUSION : MÉTHODE EXACTE POUR RÉTABLIR L'EXÉCUTION
Puisque le but est d'exécuter `node scripts/setup-test-data.mjs` (ou `npm run seed:staging`) **sans jamais exposer la clé privée localement**, la méthode optimale et la plus sécurisée est la délégation à la CI/CD.

### L'approche "Zero-Exposure" (Recommandée)
Il ne faut *pas* rapatrier le fichier `.json` sur votre machine locale. Vous devez déclencher le script depuis GitHub Actions, où le secret est déjà présent et protégé.

**Méthodologie** :
Créer un nouveau fichier workflow `.github/workflows/run-seed.yml` avec la configuration suivante, permettant un déclenchement manuel (bouton "Run workflow" dans l'onglet Actions de GitHub) :

```yaml
name: Seed Staging Database
on:
  workflow_dispatch:

jobs:
  seed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install firebase-admin dotenv
      - name: Run Seed Script
        env:
          STAGING_FIREBASE_SERVICE_ACCOUNT: ${{ secrets.STAGING_FIREBASE_SERVICE_ACCOUNT }}
        run: npm run seed:staging
```

**Résultat attendu** :
Le script s'exécutera sur les serveurs GitHub, se connectera à la base de données Staging grâce au secret injecté de manière invisible, et peuplera Firebase avec tous les comptes de test et les données nécessaires. L'audit P1 authentifié sur Vercel pourra ensuite débuter sans qu'aucune clé ne soit compromise ou téléchargée en clair.
