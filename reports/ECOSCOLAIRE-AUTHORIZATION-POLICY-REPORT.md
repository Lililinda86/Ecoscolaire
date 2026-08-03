# ECOSCOLAIRE-AUTHORIZATION-POLICY-REPORT

## 1. Politique Officielle d'Autorisation

La source de vérité pour la politique des droits d'accès est définie implicitement par l'affichage du menu (`src/components/Layout.tsx`).

Voici la matrice officielle reconstruite :

| Route | Rôles Autorisés (Officiel) | Rôles Interdits |
|---|---|---|
| `/settings` | `superAdmin`, `owner`, `director` | `secretary`, `accountant`, `teacher`, `parent`, `driver`, `student` |
| `/students` | `superAdmin`, `owner`, `director`, `secretary` | `accountant`, `teacher`, `parent`, `driver`, `student` |
| `/grades` | `superAdmin`, `owner`, `director`, `secretary`, `teacher` | `accountant`, `parent`, `driver`, `student` |
| `/attendance` | `superAdmin`, `owner`, `director`, `secretary`, `teacher` | `accountant`, `parent`, `driver`, `student` |
| `/classes` | `superAdmin`, `owner`, `director`, `secretary` | `accountant`, `teacher`, `parent`, `driver`, `student` |
| `/buses` | `superAdmin`, `owner`, `director`, `secretary`, `driver` | `accountant`, `teacher`, `parent`, `student` |
| `/communication` | `superAdmin`, `owner`, `director`, `teacher` | `secretary`, `accountant`, `parent`, `driver`, `student` |
| `/school-dashboard` | `superAdmin`, `owner`, `director`, `secretary`, `accountant`, `teacher` | `parent`, `driver`, `student` |
| `/ai-director` | `superAdmin`, `owner`, `director` | `secretary`, `accountant`, `teacher`, `parent`, `driver`, `student` |
| `/ai-teacher` | `teacher` | `superAdmin`, `owner`, `director`, `secretary`, `accountant`, `parent`, `driver`, `student` |

---

## 2. Analyse des Écarts et Faux Positifs

En comparant le rapport d'audit V2 avec la politique officielle, nous pouvons statuer sur les anomalies remontées.

### 🟢 Faux Positifs (À ignorer)
1. **`secretary` -> `/grades`** : Le script l'a marqué *NON AUTORISÉ AVEC DONNÉES VISIBLES* car le script de test avait une règle fausse. La secrétaire a bien le droit de gérer les notes. **(Conforme)**
2. **`teacher` -> `/school-dashboard`** : Marqué *NON AUTORISÉ AVEC BOUTONS CRUD*. Or, le dashboard général n'a aucune restriction dans la politique de l'école. Les enseignants ont le droit d'y accéder. **(Conforme)**

### 🔴 Failles Silencieuses Révélées (Cachées par le script)
Le script de test supposait à tort que certaines routes étaient autorisées. En réalité, ce sont des **vulnérabilités critiques** où l'accès passe silencieusement :
- **`parent`** a accès à `/students`, `/grades`, `/attendance`, `/buses`, `/communication`.
- **`teacher`** a accès à `/classes`.

---

## 3. Vulnérabilités Confirmées (Priorisées)

Toutes les vulnérabilités ci-dessous s'expliquent par la même faille racine : **L'absence de l'attribut `allowedRoles` sur les routes de `App.tsx`**, combinée à un rendu d'UI optimiste qui dévoile les données/boutons avant le blocage Firestore.

### 🚨 P0 - CRITIQUE (Risque de sécurité majeur / fuite de données)
1. **`accountant` -> `/settings`** : L'interface est visible avec des boutons CRUD. Il peut techniquement modifier le PIN Admin et les clés de paiement (Campay Secret).
2. **`teacher` -> `/settings`** : Même vulnérabilité. Accès aux réglages de l'école.
3. **`parent` -> (Toutes les routes internes)** : Un compte parent peut naviguer librement (par modification d'URL) vers `/settings`, `/students`, `/grades`, `/dashboard`, etc., exposant ainsi la base de données entière des élèves et des notes.

### 🔴 P1 - HAUTE (Accès à des zones réservées à la direction)
1. **`accountant` -> `/students`** : Accès au CRUD des élèves.
2. **`teacher` -> `/classes`** : Accès au CRUD des classes (interdit par politique).
3. **`secretary` -> `/ai-director`, `/ai-teacher`** : Peut interagir avec l'IA.
4. **`accountant` -> `/ai-director`, `/ai-teacher`** : Peut interagir avec l'IA.
5. **`teacher` -> `/ai-director`** : Peut accéder aux données directionnelles via l'IA.

### 🟠 P2 - MOYENNE (Fuite visuelle de données)
1. **`accountant`** voit les données de `/grades`, `/attendance`, `/buses`, `/communication`, `/classes`.
2. **`teacher`** voit les données de `/buses`.

---

## 4. Plan de Correction Recommandé (Ordre Strict)

Pour refermer définitivement cette brèche sur l'ensemble de l'application, l'ordre d'intervention doit être le suivant :

**Étape 1 : Sécurisation Radicale du Routeur (`src/App.tsx`)**
Ajouter la prop `allowedRoles` stricte sur absolument chaque `<Route>` à l'intérieur de `App.tsx` en respectant la matrice officielle de la section 1.

**Étape 2 : Blocage Défensif des Composants**
Comme constaté sur `/staff` et `/inventory`, le routeur seul ne suffit parfois pas en React si le composant s'est déjà pré-rendu. Il faudra ajouter dans les composants cibles :
```tsx
const { currentUser } = useAppContext();
if (!currentUser || !['superAdmin', 'owner', 'director'].includes(currentUser.role)) {
  return null;
}
```

**Étape 3 : Retest Playwright (V3)**
Une fois ces deux étapes de code appliquées, relancer le script Playwright V2 pour confirmer la résolution totale (plus aucun "BOUTONS CRUD VISIBLES" ou "DONNÉES VISIBLES" inattendus).
