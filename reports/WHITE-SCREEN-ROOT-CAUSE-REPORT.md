# WHITE-SCREEN-ROOT-CAUSE-REPORT

## Cause probable
La page blanche est due à un **crash fatal du thread JavaScript avant même l'initialisation de React**. 
Le module `src/db/firebase.ts` effectue une vérification stricte (top-level) de la présence des variables d'environnement (ex: `VITE_FIREBASE_API_KEY`). Lors du dernier build sur Vercel, ces variables n'ont pas été injectées correctement (probablement supprimées ou non assignées à l'environnement de "Production" dans Vercel). En conséquence, le module lève une exception globale :
`Firebase configuration error: Missing environment variable for apiKey. Check your .env file.`

## Fichier concerné
* `src/db/firebase.ts` (Lignes 18-23, boucle de validation des clés de configuration top-level).
* *Dommages collatéraux* : `src/App.tsx` effectue des imports statiques de plusieurs pages (ex: `UsersManagement`, `Payments`) qui importent statiquement `firebase.ts`. L'évaluation synchrone des modules fait crasher l'application entière avant que `<ErrorBoundary />` ou `ReactDOM.render()` n'ait l'opportunité de s'exécuter.

## Gravité
**CRITIQUE (P0)**
Crash complet de l'application (White Screen of Death) pour tous les utilisateurs, empêchant tout accès même au composant de diagnostic ou de login.

## Correctif proposé
Deux actions sont nécessaires :
1. **Infrastructure (Immédiat)** : Se connecter au tableau de bord Vercel, vérifier l'onglet *Environment Variables*, et s'assurer que toutes les clés `VITE_FIREBASE_*` sont bien renseignées et cochées pour l'environnement `Production`. Déclencher ensuite un redéploiement (Redeploy).
2. **Code (Prévention)** : Modifier `src/db/firebase.ts` pour retirer le `throw new Error(...)` au niveau du script principal. Il est plus robuste d'encapsuler la création de l'instance Firebase dans un bloc `try/catch` qui ne s'exécute qu'au moment du rendu ou de ne pas bloquer l'export. Ainsi, si la configuration Firebase est manquante, l'application React démarrera tout de même et le composant `ErrorBoundary` (ou un écran dédié) pourra afficher un message d'erreur visuel compréhensible (ex: "Configuration système manquante").
