# P0-024B-STUDENT-LIMIT-IMPLEMENTATION-PLAN

## Types
Modifications dans `src/types/index.ts` :
- Étendre le type de `subscriptionPlan` pour autoriser `'pilot'` en plus de `'starter' | 'standard' | 'premium'`.
- Ajouter la propriété optionnelle `isInternalSchool?: boolean;` à l'interface `School`.
- (Optionnel mais recommandé pour le futur) Ajouter `trialEndsAt?: string;` si le plan `pilot` doit expirer automatiquement dans le futur (au-delà de cette étape).

## Helpers
Création d'un nouveau fichier `src/utils/saas.ts` pour centraliser la logique métier.
Il contiendra :
- `getStudentLimit(school: School): number | typeof Infinity` : Retournera Infinity si `isInternalSchool` est vrai ou si `subscriptionPlan` est 'premium'. Retournera 1000 pour 'pilot' ou 'standard'. Retournera 200 pour 'starter'.
- `isStudentLimitReached(school: School, currentStudentCount: number): boolean` : Retournera `currentStudentCount >= getStudentLimit(school)`.
- `getStudentLimitLabel(school: School, currentStudentCount: number): string` : Retournera une chaîne formatée, par exemple `"Illimité (Interne)"`, `"190 / 200 (Starter)"` ou `"999 / 1000 (Pilote)"`.

## AppContext
Au lieu de charger `AppContext` avec de multiples états calculés, le composant `Students.tsx` invoquera directement les fonctions utilitaires depuis `src/utils/saas.ts` en passant l'objet `school` (déjà disponible via `AppContext`) et la longueur du tableau `students` actuel.
Cela évite de surcharger le contexte global avec des dépendances croisées inutiles et maintient la réactivité là où elle est requise.

## SuperAdmin
Modifications dans `src/pages/SuperAdmin.tsx` (dans la modale d'édition d'école) :
- Ajout de l'option `pilot` dans la liste déroulante des plans SaaS.
- Ajout d'une case à cocher (Switch/Checkbox) `École Interne (ITALO)` liée à la propriété `isInternalSchool`.
- Ajout d'un badge d'information affichant les conditions (ex: "Pilote: gratuit 6 mois, 1000 élèves max").

## Students
Modifications dans `src/pages/Students.tsx` :
- **Affichage** : Intégration d'un badge en haut de la page affichant le retour de `getStudentLimitLabel`. Ce badge deviendra rouge ou orange si la limite approche (ex: > 90%).
- **Bouton Ajouter** : Le bouton "+ Ajouter un élève" sera passé en `disabled` si `isStudentLimitReached` retourne vrai.
- **Formulaire (handleSave)** : Ajout d'une vérification de sécurité au début de la méthode : si l'action n'est pas une édition (`!isEditing`) et que la limite est atteinte, bloquer avec un message d'erreur clair et faire un `return`.

## Import Excel
Modifications dans la méthode `handleConfirmImport` de `src/pages/Students.tsx` :
- **Calcul des places restantes** : `const remainingSlots = getStudentLimit(school) - students.length`.
- **Vérification** : Si `previewStudents.length > remainingSlots`, la fonction s'interrompt immédiatement.
- **Message** : Une alerte (ex: `toast.error`) prévient l'utilisateur : "L'import dépasse votre limite SaaS. Places restantes : X. Éditez votre fichier pour ne pas dépasser."
- Aucune insertion partielle ne sera effectuée sans validation stricte.

## Tests
Création de `tests/p0-024b-student-limit.spec.ts` pour couvrir formellement :
- **ITALO interne illimité** : Ajout avec école définie sur `isInternalSchool = true` → OK.
- **Pilote 999** → ajout OK.
- **Pilote 1000** → ajout bloqué (bouton inactif, ou tentative d'import refusée).
- **Starter 199** → ajout OK.
- **Starter 200** → ajout bloqué.
- **Standard 999** → ajout OK.
- **Standard 1000** → ajout bloqué.
- **Premium 1500** → ajout OK.
- **Import Starter 195 + 10** → L'import de 10 est bloqué.
- **Import Starter 195 + 5** → L'import de 5 est autorisé.

## Non-régression
Les modifications portent uniquement sur le frontend et n'altèrent pas la structure des données existantes.
Nous exécuterons (via Playwright) les tests existants pour s'assurer d'aucune rupture sur :
- `P0-022` (Portail Parent) : L'affichage des élèves par le parent n'est pas impacté.
- `P0-023` (WhatsApp) : Le tableau des factures et impayés n'est pas altéré.
- `P0-024A` (Paywall manuel) : La suspension d'école reste prioritaire.
- `P0-024B1` (Sécurité Règles Firestore) : Le SuperAdmin conserve l'accès exclusif aux champs de facturation, les fonctions Cloud Firestore ne sont pas impactées.

## Risques
- Les écoles `Starter` actuelles ayant déjà > 200 élèves. La stratégie prévue ne bloque pas la base de données existante (elle ne supprime pas d'élèves), elle empêchera simplement l'ajout de nouveaux élèves via l'interface. C'est le comportement attendu.
- Modification concurrente par deux secrétaires. Sans compte côté backend (Firestore rules/Cloud functions), le système a une faille temporelle minime. Cette limitation a été identifiée et repoussée à la Phase Backend de l'audit. La robustesse frontend est jugée satisfaisante pour ce stade du MVP.

## Rollback
- Annulation des modifications sur `src/pages/Students.tsx` et `src/pages/SuperAdmin.tsx`.
- Retour au commit précédent (via `git reset --hard HEAD`).
- Re-déploiement direct de l'interface Vercel depuis `main`.
- La base de données ne requerra aucune migration de retour car les attributs optionnels ajoutés ne gêneront pas l'ancien code.

## Autorisation implémentation : NON
En attente de ton `OUI` officiel pour commencer l'implémentation.
