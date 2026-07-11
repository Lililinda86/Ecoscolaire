# ECOSCOLAIRE-GRADES-ROOT-CAUSE-REPORT

## ANALYSE DES CAUSES RACINES (MODULE NOTES)

### 1. Matières chargées (`db.subjects`) ?
* **Preuve :** L'analyse du fichier `src/context/AppContext.tsx` montre que `subjects` fait partie des collections synchronisées depuis Firestore. L'examen du script de génération `scripts/setup-test-data.mjs` confirme qu'aucune instruction n'existe pour peupler la collection `subjects` dans Firestore. La base de données de test en ligne renvoie donc un tableau vide.
* **Contre-preuve :** Le fichier `src/db/storage.ts` contient bien un tableau local statique `subjects`, mais il est immédiatement écrasé par la synchronisation Firestore (vide).
* **Verdict :** **NON VALIDÉ** (Absence totale de données de matières).

### 2. Classes chargées (`db.classes`) ?
* **Preuve :** Le module Classes et le module Élèves ont confirmé la présence des classes (CP, CE1, CE2) lors du précédent audit.
* **Contre-preuve :** Aucune.
* **Verdict :** **VALIDÉ**

### 3. Élèves chargés (`db.students`) ?
* **Preuve :** Le menu déroulant du module Notes a bien affiché la liste des élèves pour le compte Teacher Alpha.
* **Contre-preuve :** Aucune.
* **Verdict :** **VALIDÉ**

### 4. Curriculum chargé (`class.subjects`) ?
* **Preuve :** Dans le script `setup-test-data.mjs`, l'objet `class` inséré en base est défini par : `{ id: 'alpha-class-cp', schoolId: alphaId, name: 'CP', level: 'Primaire', type: 'francophone' }`. Il manque la propriété `subjects: [...]` requise par l'application pour mapper les matières à une classe.
* **Contre-preuve :** Aucune.
* **Verdict :** **NON VALIDÉ**

### 5. Appels Firestore exécutés ?
* **Preuve :** Les données des élèves et des classes s'affichent correctement dans l'UI, ce qui certifie que la synchronisation Firestore (`getDocs`) s'effectue sans blocage global.
* **Contre-preuve :** Aucune.
* **Verdict :** **VALIDÉ**

### 6. Erreurs réseau ?
* **Preuve :** L'automate Playwright n'a intercepté aucune erreur HTTP (404, 500) ou problème de latence réseau lors du test du module Notes.
* **Contre-preuve :** L'application a répondu rapidement à l'ouverture de la modale.
* **Verdict :** **NON VALIDÉ** (Aucune erreur).

### 7. Erreurs React ?
* **Preuve :** Le code de `Grades.tsx` possède une condition préventive : `if (applicableSubjects.length === 0) { return <p>Aucune matière disponible...</p>; }`. L'absence d'inputs n'est pas due à un crash de composant, mais à un rendu conditionnel délibéré et sécurisé.
* **Contre-preuve :** La console n'a affiché aucune erreur fatale de type `Uncaught Error` ou `React Error Boundary`.
* **Verdict :** **NON VALIDÉ** (Fonctionnement React nominal).

### 8. Erreurs console cachées ?
* **Preuve :** Le listener de Playwright `page.on('console')` a confirmé 0 erreur (`consoleErrors.length === 0`) pour le module Notes, écartant ainsi toute erreur silencieuse javascript.
* **Contre-preuve :** Aucune.
* **Verdict :** **NON VALIDÉ** (Zéro erreur).

---

## CONCLUSION EXACTE

La cause racine stricte de l'échec de la saisie des notes n'est **ni un bug applicatif, ni une erreur réseau**. 

L'interface React `Grades.tsx` fonctionne correctement et bloque la saisie intentionnellement parce que l'environnement de données de test (Seed) est **incomplet** :
1. La collection Firestore `subjects` est vierge (non gérée par `setup-test-data.mjs`).
2. Les documents `classes` n'ont aucune matière mappée (propriété `subjects` absente).

Par conséquent, la condition de rendu sécurisée `applicableSubjects.length === 0` se déclenche et l'interface affiche à juste titre l'impossibilité de saisir une note.
