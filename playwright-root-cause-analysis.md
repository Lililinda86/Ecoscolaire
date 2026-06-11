# 🕵️‍♂️ Playwright Root Cause Analysis (Niveau 2)

**Auteur :** E2E-TEST-ENGINEER-ECOSCOLAIRE
**Date :** Juin 2026

Suite à l'échec total de la suite de tests E2E (19/19) sur un timeout du sélecteur `input[type="email"]`, un diagnostic profond a été exécuté. Le script de diagnostic a forcé l'extraction du DOM réel, de la console et des requêtes réseau lors d'une simple navigation vers `page.goto('/')`.

---

## 1. Analyse statique de `Login.tsx`

L'inspection du code source de la page d'authentification révèle l'absence cruciale d'attributs standard pour l'automatisation.

**Liste des champs `<input>` présents :**

| Champ | type | name | id | placeholder | aria-label | data-testid |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Email (Login)** | `"text"` | *N/A* | *N/A* | `"Ex: kyrialove@gmail.com"` | *N/A* | *N/A* |
| **Mot de passe** | `"password"` / `"text"` | *N/A* | *N/A* | `"••••••"` | *N/A* | *N/A* |
| **Email (Récupération)**| `"text"` | *N/A* | *N/A* | `"Ex: kyrialove@gmail.com"` | *N/A* | *N/A* |

**Problème immédiat :** L'input e-mail est codé avec `type="text"` au lieu de `type="email"`. Le sélecteur Playwright standard `locator('input[type="email"]')` ne peut donc **mathématiquement pas** fonctionner, même si la page s'affiche.

---

## 2. Analyse dynamique du rendu (Diagnostic Runtime)

**La page de login est-elle réellement affichée après `page.goto('/')` ?**
**NON.** ❌

Contrairement à ce qui est attendu pour un utilisateur non connecté, le routeur de l'application affiche directement une session active protégée.

### Résultats des captures automatiques :

* **Erreurs Console :** `Aucune erreur console détectée.`
* **Erreurs Réseau :** `Aucune erreur réseau détectée.`
* **Capture HTML (DOM réel) :**
  L'extraction du HTML généré par le navigateur virtuel a révélé le code suivant (extrait) :
  ```html
  <div id="root">
    ...
    <h1 style="display: flex; align-items: center; gap: 0.5rem; margin: 0px;">
      <svg ...> Espace Super Admin SaaS
    </h1>
    <p>Gestion globale des écoles clientes</p>
    ...
  </div>
  ```

---

## 3. Conclusions (Causes Premières du Timeout)

Le timeout Playwright (`Error: locator.fill: Test timeout of 30000ms exceeded`) est causé par la superposition de **deux bugs critiques** :

1. **Bug d'Architecture / Routing (Bloquant Absolu)** : 
   Lorsqu'un visiteur anonyme (le bot Playwright dans un contexte incognito vierge) arrive sur `/`, l'application **ne le redirige pas vers la page de Login**. Elle affiche par défaut le Dashboard Super Admin. Le formulaire de login n'existe tout simplement pas dans le DOM rendu.
   *(Hypothèse : Une variable d'environnement de mock est active, ou `AppContext` force la session par défaut pour faciliter le développement local).*

2. **Bug de Sélecteurs (Bloquant UI)** :
   Même si le routage fonctionnait correctement, le test échouerait car le champ attendu `<input type="email">` a été écrit par les développeurs sous la forme `<input type="text">` sans aucun identifiant de test (`data-testid`).
