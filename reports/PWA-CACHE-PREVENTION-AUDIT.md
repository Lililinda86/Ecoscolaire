# PWA-CACHE-PREVENTION-AUDIT

## Configuration actuelle PWA

L'application EcoScolaire utilise actuellement `vite-plugin-pwa` avec la configuration suivante dans `vite.config.ts` :

```typescript
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
  manifest: { ... }
})
```

* **Mécanisme :** Le mode `autoUpdate` installe silencieusement le nouveau Service Worker en arrière-plan. Par défaut, il force le nouveau SW à prendre le contrôle (`skipWaiting: true`, `clientsClaim: true`).
* **Injection :** Vite injecte automatiquement un script d'enregistrement (`<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>`) dans `index.html`.

## Risque identifié (Le "Poison Cache")

Le risque majeur qui s'est concrétisé lors de l'incident de la page blanche est le **blocage par erreur fatale synchrone**.

1. **Le Piège :** Si le bundle JavaScript principal (ex: `index-XXX.js`) contient une erreur fatale au top-level (comme le `throw new Error` de Firebase), l'exécution JavaScript de l'onglet s'arrête net.
2. **L'Impasse :** Même si `registerSW.js` télécharge la nouvelle version en arrière-plan, l'application React est morte. L'interface (UI) ne peut pas afficher de message "Mise à jour disponible", et le navigateur ne recharge pas automatiquement la page en cours. 
3. **Le Comportement Utilisateur :** L'utilisateur clique sur "Actualiser" (F5). S'il le fait trop tôt ou si le navigateur maintient l'état, le Service Worker sert à nouveau le bundle cassé mis en cache. L'utilisateur est pris dans une boucle de page blanche infinie sans pouvoir s'en sortir (à moins de vider manuellement les données de site via F12).

## Recommandation CTO

**Recommandation : Option C (Ajouter un mécanisme de purge/mise à jour forcée de sécurité) combinée à une optimisation de la configuration Workbox.**

Il ne faut pas désactiver la PWA (Option A), car elle est très utile pour une application scolaire (connexions lentes, accès hors-ligne aux emplois du temps). Il ne faut pas non plus juste changer la stratégie de cache réseau (Option B), car les assets statiques doivent rester mis en cache pour les performances. 

La meilleure solution est un **Safety Net (Filet de sécurité) anti-page blanche**.

## Fichiers impactés

1. `index.html` (Ajout d'un script natif de détection d'erreur critique)
2. `vite.config.ts` (Ajustement de la configuration PWA)

## Plan d'action

Pour la prochaine implémentation (aucun code n'est modifié pour le moment), voici les étapes à suivre :

### 1. Filet de sécurité Vanilla JS dans `index.html`
Ajouter un script bloquant `<script>` dans le `<head>` (avant le chargement de React) qui écoute les erreurs globales fatales (`window.onerror`).
Si une erreur se produit avant que React n'ait pu monter l'application, ce script :
* Désenregistre immédiatement tous les Service Workers (`navigator.serviceWorker.getRegistrations()`).
* Efface le cache du navigateur (`caches.keys().then(...)`).
* Force un rechargement dur de la page (`window.location.reload()`) après un léger délai.

### 2. Renforcer Workbox dans `vite.config.ts`
Ajouter la configuration explicite pour Workbox afin de s'assurer que les anciens caches sont purgés agressivement lors des déploiements :
```typescript
workbox: {
  cleanupOutdatedCaches: true,
  skipWaiting: true,
  clientsClaim: true,
  sourcemap: true
}
```

### 3. (Optionnel) UI de secours
Dans le `index.html`, ajouter une balise `<noscript>` et un élément HTML natif masqué contenant un bouton "Réparer l'application". Si le filet de sécurité détecte une erreur fatale récurrente (en stockant un flag dans le localStorage), il affiche ce bouton permettant à l'utilisateur de nettoyer lui-même sans passer par F12.

**Statut de l'Audit :** TERMINÉ. En attente de validation pour l'implémentation.
