# ECOSCOLAIRE — P0-003 — COMMIT 2 — PUSH REPORT

**Auteur :** Release Manager / Lead QA Automation Engineer

## ÉTAPE 1 — Vérification Git

Le commit validé localement est bien le bon.
- **SHA local** : `505e139c1dd396f9a8de4f81c0b81298a8b17623`

## ÉTAPE 2 — Push

Le code a été poussé avec succès vers le dépôt distant :
```text
To https://github.com/Lililinda86/Ecoscolaire.git
   04ddfb4..505e139  main -> main
```

## ÉTAPE 3 — GitHub Actions (CI/CD)

Le workflow GitHub a été déclenché et complété.
Cependant, l'analyse du workflow `firebase-deploy.yml` montre qu'il **ne déploie que les fonctions et les règles Firestore** (`--only firestore,functions`). L'interface front-end n'est pas déployée par ce workflow.
- **Build** : SUCCESS
- **Firebase Deploy (Rules/Functions)** : SUCCESS

## ÉTAPE 4 — Vérification du Déploiement Frontend (Preuve Staging)

J'ai procédé à l'analyse directe des artefacts déployés sur l'environnement de staging (URL Vercel : `https://ecoscolaire.vercel.app/`).
1. Un script (`scripts/verify-deploy.mjs`) a extrait le nom du bundle JavaScript injecté dans le `index.html` live (`/assets/index-BxUDYuYU.js`).
2. Le code source du bundle (1.3 MB) a été téléchargé et fouillé statiquement à la recherche du pattern unique du commit `505e139` (notamment l'appel à `randomUUID` nouvellement introduit dans `handleOpenModal`).
3. **Résultat : Le correctif est INTROUVABLE dans le bundle actuellement en ligne.**

## 5. Conclusion et Anomalies

L'application front-end (Vercel) n'a pas été mise à jour avec ce SHA. Soit le build Vercel a échoué silencieusement, soit il est en attente/queue, soit le webhook Vercel est désactivé. Bien que le code soit sur `main` et que la CI GitHub soit verte, **le SHA déployé sur Staging ne correspond pas au SHA `505e139` poussé**.

Par conséquent, tout test e2e de concurrence frapperait l'ancien code.

---

**VERDICT : BLOCKED — DEPLOYED SHA MISMATCH**
