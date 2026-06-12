# 🕵️‍♂️ Audit de Stabilisation QA - Analyse des 15 Échecs E2E

**Auteur :** STABILIZATION-QA-ENGINEER
**Date :** Juin 2026

Suite à la correction de l'authentification et au succès des tests de sécurité, 15 tests E2E échouent lors de l'interaction avec le Dashboard post-connexion.

Conformément aux instructions, aucune correction n'a été appliquée. Voici l'analyse stricte des causes.

---

## 📊 Matrice des Échecs

| Test | Composant | Cause | Gravité | Temps correction |
| ---- | --------- | ----- | ------- | ---------------- |
| `f5-persistence.spec.ts` | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Owner) | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Director) | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Secretary)| `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Accountant)| `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Teacher) | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Driver) | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `login-roles.spec.ts` (Parent) | `Layout` / Navbar | **A. Sélecteur Playwright invalide** (`button:has-text("Déconnexion")` introuvable) | Haute | 5 min |
| `grades-bulletins.spec.ts` | `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Notes` introuvable au clic) | Haute | 10 min |
| `branding-logo.spec.ts` | `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Paramètres` introuvable) | Moyenne | 5 min |
| `multitenant-alpha-beta.spec.ts` (Alpha)| `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Élèves` introuvable) | Haute | 10 min |
| `multitenant-alpha-beta.spec.ts` (Beta) | `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Élèves` introuvable) | Haute | 10 min |
| `payments-receipts.spec.ts` | `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Finances` introuvable) | Haute | 10 min |
| `students-crud.spec.ts` | `Sidebar` / Menu | **H. Bug UI / A. Sélecteur invalide** (`text=Élèves` introuvable) | Haute | 10 min |
| `login-superadmin.spec.ts` | `Login.tsx` | **C. Données Firestore absentes / G. Bug Métier** (Connexion bloquée, reste sur `#/login`) | Critique | 15 min |

---

## 🏆 Top 5 Bugs Critiques

1. **Absence du compte Super Admin valide (C/G) :** La suppression de la création silencieuse du SuperAdmin dans `AppContext` a cassé le test de connexion globale (`login-superadmin.spec.ts`). L'identifiant attendu par le test n'a pas accès au bon espace ou n'existe pas dans Firebase Auth avec le rôle correct.
2. **Absence de bouton de déconnexion clair (A) :** 8 tests échouent car ils cherchent le texte "Déconnexion", "Logout" ou la classe `.lucide-log-out` pour confirmer la réussite du Login. Si ce bouton est enfoui dans un sous-menu ou rendu via une icône sans texte explicite, Playwright crashe.
3. **Sélecteur "Élèves" introuvable dans la sidebar (A/H) :** Les tests CRUD et Multitenant cliquent sur `text=Élèves`. Si le menu affiche "Liste des élèves", "Gestion des élèves" ou juste une icône sur petit écran, toute la chaîne CRUD est bloquée.
4. **Sélecteur "Finances" introuvable (A/H) :** Idem pour les tests de paiements qui attendent "Finances". L'application utilise probablement "Paiements" ou "Comptabilité" dans son menu.
5. **Sélecteur "Notes" introuvable (A/H) :** Bloque la création de bulletins. L'application utilise peut-être "Évaluations" ou "Grades".

---

## ⚡ Top 5 Bugs rapides à corriger (Quick Wins)

1. **Mettre à jour le texte du menu "Élèves" :** Remplacer `.locator('text=Élèves')` par `getByRole('link', { name: /élèves/i })` ou ajouter un `data-testid="nav-students"`.
2. **Mettre à jour le texte du menu "Finances" :** Utiliser le vrai nom affiché dans l'UI (ex: "Paiements") ou un `data-testid`.
3. **Mettre à jour le sélecteur de "Déconnexion" :** Ajouter un `data-testid="logout-btn"` sur le profil/bouton de sortie.
4. **Mettre à jour le texte du menu "Paramètres" :** Corriger `.locator('text=Paramètres')`.
5. **Vérifier le seed du compte Super Admin :** S'assurer que le script `setup-test-data.mjs` crée correctement l'utilisateur Super Admin attendu par le test `login-superadmin.spec.ts`.

---

## ⚠️ Risques de Lancement

Si l'application était déployée dans cet état :
* **Risque QA :** Impossible de valider automatiquement les processus critiques de l'école (facturation, notes). Toute régression passera inaperçue.
* **Risque Opérationnel :** Le CEO et le COO (qui souhaitent signer 100 écoles) n'ont aucune garantie que l'interface actuelle permet réellement d'ajouter un élève ou d'encaisser un paiement, car aucun test robotisé ne parvient à franchir la navigation du Dashboard.
* **Résolution Conseillée :** Déployer des `data-testid` sur toute la `Sidebar` et sur le bouton `Logout` pour décorréler les tests automatisés du libellé visuel (UI). Il n'y a pas de bug logique majeur identifié ici, ce sont majoritairement des problèmes d'ancrage visuel (sélecteurs).
