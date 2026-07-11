# PWA-CACHE-PREVENTION-IMPLEMENTATION-REPORT

## Fichiers modifiés
- `vite.config.ts`
- `index.html`

## Modifications appliquées
1. **Renforcement de la PWA (vite.config.ts) :** Ajout explicite du bloc `workbox` avec `cleanupOutdatedCaches: true`, `skipWaiting: true` et `clientsClaim: true`. Cela garantit que les anciens caches sont purgés et que le nouveau Service Worker prend le contrôle sans attendre.
2. **Filet de sécurité (index.html) :** Injection d'un script natif bloquant avant l'exécution de React. Ce script capte les `error` et `unhandledrejection` au niveau global.

## Protection anti-reload-loop
Le script de sécurité vérifie le `sessionStorage` avec la clé `ecoscolaire_cache_repair_attempted`. 
- **Si la clé est absente (première erreur fatale) :** Il désenregistre les Service Workers, supprime les caches, active la clé, et recharge la page.
- **Si la clé est présente (l'erreur persiste après rechargement) :** Il stoppe la boucle et modifie le DOM de secours pour afficher un message clair demandant à l'utilisateur de vider ses données ou de contacter l'administration.

## Build
La commande `npm run build` a été exécutée avec succès :
- Le fichier `dist/sw.js` a été généré et intègre la configuration Workbox.
- Le fichier `dist/index.html` inclut bien le script natif de protection avant le chargement du bundle.

## Tests
Les tests locaux via `Playwright` sur le serveur de preview (`localhost:4173`) confirment que :
- L'application démarre correctement (la balise root est alimentée, la page de Login s'affiche : "Se connecter").
- Aucune boucle de reload n'a été détectée.
- 0 erreur console fatale rencontrée.

## Non-régression P0-022
La modification ne concerne que l'injection au `head` et la configuration du Service Worker. La logique métier P0-022 (blocage pour dettes sévères) n'est pas modifiée et reste entièrement couverte et fonctionnelle (vérifiée précédemment).

## Non-régression P0-023
Le composant `Payments.tsx` (incluant le bouton WhatsApp) reste intact. Aucune régression sur P0-023.

## Git diff
```diff
diff --git a/index.html b/index.html
index 1685abb..9c8fec4 100644
--- a/index.html
+++ b/index.html
@@ -6,6 +6,46 @@
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <meta name="google" content="notranslate" />
     <title>EcoScolaire</title>
+    <script>
+      function handleFatalError() {
+        var root = document.getElementById('root');
+        if (!root || root.innerHTML.trim() === '') {
+          var repairAttempted = sessionStorage.getItem('ecoscolaire_cache_repair_attempted');
+          if (!repairAttempted) {
+            sessionStorage.setItem('ecoscolaire_cache_repair_attempted', 'true');
+            if ('serviceWorker' in navigator) {
+              navigator.serviceWorker.getRegistrations().then(function(registrations) {
+                var promises = [];
+                for(var i = 0; i < registrations.length; i++) {
+                  promises.push(registrations[i].unregister());
+                }
+                return Promise.all(promises);
+              }).then(function() {
+                if ('caches' in window) {
+                  return caches.keys().then(function(names) {
+                    var cachePromises = [];
+                    for (var i = 0; i < names.length; i++) {
+                      cachePromises.push(caches.delete(names[i]));
+                    }
+                    return Promise.all(cachePromises);
+                  });
+                }
+              }).then(function() {
+                window.location.reload();
+              }).catch(function() {
+                window.location.reload();
+              });
+            } else {
+              window.location.reload();
+            }
+          } else {
+            document.body.innerHTML = '<div style="padding: 2rem; font-family: sans-serif; text-align: center; color: #ef4444;"><h2>Erreur Système</h2><p>EcoScolaire a détecté un problème de cache. Veuillez vider les données du site ou contacter l\'administration.</p></div>';
+          }
+        }
+      }
+      window.addEventListener('error', handleFatalError);
+      window.addEventListener('unhandledrejection', handleFatalError);
+    </script>
   </head>
   <body>
     <div id="root"></div>
diff --git a/vite.config.ts b/vite.config.ts
index 1eea4f4..4e41a13 100644
--- a/vite.config.ts
+++ b/vite.config.ts
@@ -17,6 +17,12 @@ export default defineConfig({
         background_color: '#ffffff',
         display: 'standalone',
         icons: [] // Browser can fallback to default if missing, or we can add one later
+      },
+      workbox: {
+        cleanupOutdatedCaches: true,
+        skipWaiting: true,
+        clientsClaim: true,
+        sourcemap: true
       }
     })
   ],
```

## Commit proposé
`fix(pwa): force cache clearing on fatal synchronous top-level errors to prevent blank screen loop`

## Statut
PRÊT POUR VALIDATION. Le correctif est en place, fonctionnel, et prêt à être commité avant de passer à P0-024.
