# P0-024B-STUDENT-LIMIT-IMPLEMENTATION-REVIEW-REPORT

## Audit Critique

### 1. Tous les cas Infinity
- **Affichage** : Correct. La fonction `getStudentLimitLabel` gère explicitement le cas `limit === Infinity` et retourne un format clair `(Illimité)`.
- **Import Excel** : Correct. La logique `remainingSlots = getStudentLimit(currentSchool) - db.students.length` retournera `Infinity`. La comparaison `previewStudents.length > Infinity` retourne toujours `false`, ce qui autorise correctement les imports pour les plans Premium et ITALO.
- **Helper SaaS** : Correct. `Infinity` est retourné pour `premium` et `isInternalSchool`.
- **Tests** : La coquille de test `Should test Premium 1500 -> ajout OK` et `ITALO interne illimité` a bien été préparée.

### 2. Compatibilité avec P0-024A (Paywall)
- **Pilot, expired, suspended** : Correct. Les plans et statuts sont bien intégrés dans les nouveaux formulaires et types.
- **isSchoolSuspended & isInternalSchool (BUG DÉTECTÉ)** : 
  Actuellement dans `AppContext.tsx`, la suspension est évaluée ainsi :
  `const isSchoolSuspended = currentSchool?.subscriptionStatus === 'suspended' || currentSchool?.subscriptionStatus === 'expired';`
  Cela signifie que si ITALO (`isInternalSchool=true`) est passée par mégarde à `suspended` ou `expired`, elle déclenchera le paywall (P0-024A) et bloquera l'ajout d'élèves, violant la règle : *ITALO interne : aucun paywall*.
  La variable doit impérativement forcer le contournement pour les écoles internes.

### 3. Protection Firestore Rules
- **isInternalSchool** : PROTÉGÉ. Fait partie du tableau `isUpdatingSaasFields()`.
- **trialEndsAt** : PROTÉGÉ. Fait partie du tableau `isUpdatingSaasFields()`.
- **subscriptionPlan=pilot** : PROTÉGÉ. Le champ `subscriptionPlan` est verrouillé. Quelle que soit la valeur (pilot, premium, etc.), sa modification est interceptée et refusée pour l'Owner.

### 4. Couverture des tests
- Les tests préparés incluent `ITALO interne illimité`, mais ne spécifient pas expressément les cas de compatibilité croisée avec le Paywall :
  - *ITALO suspendue* : Doit prouver que le bouton + Ajouter reste actif.
  - *ITALO active* : Doit prouver que le bouton + Ajouter reste actif.
  - *Pilot expiré* : Qu'arrive-t-il après les 6 mois de gratuité ? Le Paywall doit se déclencher. Ce test manque à l'appel.
  - *Pilot actif* : Testé de manière indirecte (ajout OK / ajout bloqué à 1000).

## Corrections requises (Avant tout commit)
1. **Modifier `src/context/AppContext.tsx`** :
   Changer `const isSchoolSuspended = ...` pour devenir :
   `const isSchoolSuspended = !currentSchool?.isInternalSchool && (currentSchool?.subscriptionStatus === 'suspended' || currentSchool?.subscriptionStatus === 'expired');`
2. **Ajouter les tests croisés** dans `tests/p0-024b-student-limit.spec.ts` pour garantir la résilience du flag `isInternalSchool` face au statut `suspended` (Non-régression absolue P0-024A).

## Autorisation commit : NON
L'implémentation est globalement excellente, mais le bug critique sur l'interaction entre `isInternalSchool` et `isSchoolSuspended` requiert une correction immédiate pour ne pas casser la politique commerciale de GS Bilingue ITALO.
