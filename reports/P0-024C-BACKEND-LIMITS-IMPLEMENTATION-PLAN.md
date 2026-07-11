# P0-024C-BACKEND-LIMITS-IMPLEMENTATION-PLAN

## Objectif
Empêcher le contournement des quotas SaaS (nombre maximum d'élèves par école) en bloquant les écritures directes via l'API Firebase, le SDK client, ou la manipulation manuelle de requêtes réseau, tout en respectant l'architecture "Offline-First" et réactive actuelle (`saveDB`).

## Options évaluées

### Approche A — Firestore Rules + compteur `studentsCount`
- **Sécurité** : Bonne. Bloque les ajouts en amont dans Firestore Rules. Vulnérable aux "race conditions" lors de requêtes concurrentes massives (car le trigger met à jour le compteur en asynchrone).
- **Complexité** : Moyenne.
- **Risque régression** : Faible, mais nécessite de migrer la base pour ajouter `studentsCount` sur les écoles.
- **Compatibilité UI/saveDB** : Parfaite. 

### Approche B — Cloud Function callable `createStudent`
- **Sécurité** : Très haute (synchrone).
- **Complexité** : Très élevée.
- **Risque régression** : Très élevé. 
- **Compatibilité UI/saveDB** : Mauvaise. Oblige à sortir la logique de création d'élèves de l'état global synchronisé (`saveDB`), ce qui casse le support hors-ligne / PWA actuel.

### Approche C — Trigger post-écriture (Rétroactif / Nettoyeur)
- **Sécurité** : Moyenne/Bonne. Les données excédentaires sont écrites puis supprimées presque instantanément.
- **Complexité** : Faible. Aucune modification du code Front-end.
- **Risque régression** : Nul.
- **Compatibilité UI/saveDB** : Parfaite. 

## Option recommandée
**L'Approche Hybride (A + C)** : Firestore Rules + Compteur + Nettoyeur Asynchrone.
1. On ajoute un champ `studentsCount` aux documents `schools`.
2. Les `firestore.rules` rejettent la création si ce compteur dépasse la limite (bloque 99% des attaques et protège la facturation).
3. Une Cloud Function gère l'incrémentation/décrémentation de `studentsCount` de façon sécurisée ET supprime l'élève rétroactivement s'il a pu passer grâce à une *race condition* (ex: 500 requêtes en même temps).

## Architecture proposée

1. **Firestore Rules** : 
   La règle `create` sur `/students/{studentId}` inclura une fonction `checkSaaSLimit(schoolId)` qui lit le `studentsCount` de l'école (via `get()`). Si la limite est atteinte, l'écriture est rejetée.

2. **Cloud Functions** :
   Création de `onStudentWritten` (déclenchée sur création et suppression) :
   - Met à jour `studentsCount` sur le document `school` via `FieldValue.increment()`.
   - Effectue un contrôle final d'intégrité (si un élève a été ajouté et que `studentsCount` dépasse la limite absolue, le script le supprime pour colmater la "race condition").

3. **Data Migration** :
   Script unique pour calculer le nombre d'élèves actuels par école et injecter le champ `studentsCount` dans `/schools/{schoolId}`.

## Fichiers à modifier
1. `firestore.rules` : Ajout des règles SaaS sur `/students`.
2. `functions/src/index.ts` : Ajout de la Cloud Function `enforceStudentSaasLimits`.
3. `scripts/migrate-students-count.cjs` : Création du script de migration initial.
*(Aucune modification du code source React `saveDB` ou de l'UI n'est requise, car l'UI bloque déjà les actions légitimes)*.

## Migration / recalcul studentsCount
Un script Node.js sera écrit. Il fera :
- Boucle sur toutes les écoles.
- Requête `COUNT()` sur `/students` où `schoolId == x`.
- `updateDoc` sur l'école pour injecter `studentsCount: result`.

## Tests nécessaires
1. Tester la création légitime (doit passer).
2. Tester la création au-delà du quota via l'UI (déjà bloqué).
3. Tester la création au-delà du quota via un script externe / API directe (doit renvoyer `Permission Denied` par Firebase Rules).
4. Tester le mode offline : création légitime en offline puis reconnexion (doit se synchroniser sans erreur).
5. Tester l'école `ITALO` (illimitée).

## Risques
- **Coût Firestore** : La règle `get()` sur le document `school` ajoute une lecture (1 read) facturable à chaque ajout/modification d'un étudiant. Comme la création n'est pas une action de masse permanente, le coût est négligeable.
- **Désynchronisation du compteur** : Si un élève est supprimé manuellement de la base (sans trigger), le compteur peut dériver. Un chron-job de recalibrage (weekly) peut être envisagé à terme, ou l'utilisation d'une Cloud Function gérant toutes les écritures.

## Plan d'exécution par phases
- **Phase 1** : Création et exécution du script de migration pour initialiser `studentsCount` sur toutes les écoles (Staging puis Prod).
- **Phase 2** : Déploiement de la Cloud Function `enforceStudentSaasLimits` pour maintenir le compteur en temps réel.
- **Phase 3** : Mise à jour des `firestore.rules` pour bloquer les écritures dépassant le quota, puis déploiement des règles.
- **Phase 4** : Validation finale E2E et tests de sécurité avec script de contournement.

## Critères de validation
- Un script de test externe essayant d'insérer un élève au-delà de la limite SaaS sur une école "Starter" échoue avec `PERMISSION_DENIED`.
- L'application web continue de fonctionner normalement sans bugs ou alertes inattendues.
- L'école ITALO (`isInternalSchool: true`) accepte les écritures infinies depuis le script externe.

## Verdict de planification
PLAN APPROUVABLE
