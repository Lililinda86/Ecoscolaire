# ECOSCOLAIRE — VERCEL DEPLOYMENT ROOT CAUSE

**Auteur :** Lead DevOps Engineer / Vercel Deployment Specialist

## 1. Chronologie et État Git

* **Dernier SHA GitHub** : `505e139c1dd396f9a8de4f81c0b81298a8b17623` a bien été poussé sur `main`.
* **Webhook GitHub → Vercel** : Déclenché avec succès.
* **Build Vercel** : L'API GitHub Deployments confirme que Vercel a exécuté le build avec succès pour le SHA `505e139`. 

## 2. Analyse des Artefacts Vercel

J'ai interrogé l'API publique de GitHub (Deployments) pour retracer l'historique de Vercel. 
Le webhook a généré plusieurs statuts, aboutissant à un déploiement marqué comme **Production** et **SUCCESS**.

L'URL du déploiement générée par Vercel est : 
`https://ecoscolaire-z3tw.vercel.app/`

J'ai téléchargé et analysé statiquement le bundle JavaScript de cette URL spécifique :
* JS trouvé : `/assets/index-S1xbE_4w.js`
* Code source : Contient le pattern `randomUUID` de notre correctif Payments.
* **Résultat : Le commit `505e139` a bel et bien été construit et déployé par Vercel.**

## 3. Le Problème (`ecoscolaire.vercel.app`)

Lors de l'étape précédente, le test live a échoué car nous avons analysé le domaine `https://ecoscolaire.vercel.app/`. Le bundle servi sur cette URL (`index-BxUDYuYU.js`) ne contient pas le correctif.

Pourquoi ?
Le nom de projet `ecoscolaire` étant probablement déjà pris (ou configuré dans un autre projet/compte Vercel), Vercel a automatiquement nommé ce nouveau projet `ecoscolaire-z3tw` lors de son initialisation. Par conséquent, chaque push sur `main` déploie l'application vers `ecoscolaire-z3tw.vercel.app`, et **non** vers `ecoscolaire.vercel.app`.

Le domaine `ecoscolaire.vercel.app` pointe vers un projet Vercel obsolète, un fork, ou un projet déconnecté du dépôt actuel.

## 4. Cause Racine

**WRONG PROJECT DEPLOYED** (Ou mauvaise URL ciblée par l'assurance qualité).

Le pipeline CI/CD fonctionne parfaitement : le code est compilé et hébergé publiquement. Cependant, l'environnement Vercel actuellement lié à ce dépôt GitHub est `ecoscolaire-z3tw` et non l'ancien `ecoscolaire`.

## 5. Action Minimale Requise

Pour débloquer la certification Staging, nous devons simplement effectuer nos tests QA en utilisant la bonne URL Vercel qui reçoit réellement les déploiements de ce dépôt :
👉 **`https://ecoscolaire-z3tw.vercel.app/`**

(Alternativement, il faudrait modifier les paramètres de domaine dans le dashboard Vercel pour lier le domaine custom souhaité au projet actif).

---

**VERDICT : WRONG PROJECT DEPLOYED**
