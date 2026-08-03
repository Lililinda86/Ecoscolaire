# P0-022-PARENT-PORTAL-BLOCKING-AUDIT

## PRÉVU
Restreindre l'accès à certaines fonctionnalités du portail parent (notes, bulletins, ou portail entier) pour les élèves dont les frais de scolarité ne sont pas en règle.

## CODÉ
Un début de logique de blocage existe déjà dans `src/pages/ParentPortal.tsx` : la fonction `renderBlockadeAlert(student, trimester)` masque le bulletin du trimestre spécifié si la pension correspondante n'est pas réglée, calculé par `isTranchePaid`. Le blocage global du portail n'est pas implémenté (un parent en impayé total peut toujours voir les présences, la vue d'ensemble, le transport, etc.).

## BUILDÉ
Oui (l'existant). Le nouveau système est à faire.

## DÉPLOYÉ
Non applicable (le nouveau système de blocage global n'est pas déployé).

## TESTÉ
Non.

## VALIDÉ
Non.

---

## Audit du portail parent
**Fichiers identifiés :**
* `src/pages/ParentPortal.tsx` : Composant principal du portail parent contenant les onglets (Overview, Grades, Attendance, Finance, Transport).
* `src/App.tsx` : Déclaration de la route `<Route path="/parent" element={<ProtectedRoute allowedRoles={['parent']}><ParentPortal /></ProtectedRoute>} />`.
* `src/components/ProtectedRoute.tsx` : Composant qui gère le filtrage d'accès selon le rôle `currentUser.role`.

**Contrôles d'accès existants :**
* L'utilisateur doit avoir `role === 'parent'`.
* L'utilisateur ne voit que les élèves dont l'`id` est présent dans `currentUser.studentIds`.
* L'onglet "Grades" masque les notes du trimestre X si la tranche X n'est pas payée (`!isTranchePaid(student, 'TX')`), sauf si `financialBypass` est activé.

**Calculs de paiements (actuel) :**
* Le total attendu par tranche est lu depuis `student.feeT1`, `student.feeT2`, `student.feeT3`.
* Le total payé est la somme des montants dans `db.payments` où `studentId == student.id`, `type == 'tuition'`, et `installment == 'T1' | 'T2' | 'T3'`.
* Une dérogation (`financialBypass: { t1, t2, t3 }`) permet de forcer l'accès.

---

## Audit Firestore

**`students`**
* Champs financiers : `feeT1`, `feeT2`, `feeT3`, `feeAmount` (legacy).
* Champ de déblocage : `financialBypass: { t1: boolean, t2: boolean, t3: boolean }`.
* Relation : Lié à `users` via `studentIds` et à `classes` via `classId`.

**`payments`**
* Structure : `id`, `studentId`, `amount`, `type`, `installment`, `date`.
* Relation : Clé étrangère `studentId`. Sert à calculer le solde payé.

**`classes`**
* Structure : `id`, `name`. Sert uniquement à l'affichage sur la vue d'ensemble.

**`users`**
* Structure : `id`, `role: 'parent'`, `studentIds: string[]`. 
* Relation : Contient le tableau des enfants pour autoriser la lecture de leurs données.

---

## Proposition fonctionnelle

### STATUT FINANCIER
Pour chaque élève, l'état financier global ou par tranche peut être qualifié :
1. **PAID (À jour)** : Le total payé correspond au total exigible à la date actuelle.
2. **PARTIALLY_PAID (Paiement partiel)** : Un paiement a été effectué mais le solde exigible n'est pas nul.
3. **UNPAID (Impayé)** : Aucun paiement n'a été fait pour la période exigible.

### Seuil de blocage et logique de calcul
* **Niveau 1 (Blocage Pédagogique - Actuel amélioré)** : Si la tranche N n'est pas payée à 100%, bloquer les notes et bulletins du Trimestre N.
* **Niveau 2 (Blocage Sévère - Nouveau)** : Si l'impayé global dépasse un certain seuil de tolérance (ex: `feeT1` n'est pas payé du tout au 2e trimestre), le dossier de l'élève est verrouillé sur tout le portail parent (impossible de voir les présences, la vue d'ensemble ou le transport). Le parent ne verra que l'onglet "Finance" affichant la dette et un message bloquant.

### Impact sur le portail parent
* **Écran bloquant global** : Si l'élève est en blocage de Niveau 2, un encart rouge l'indique dès l'onglet "Vue d'ensemble" et masque tous les autres onglets à l'exception de "Finances".
* L'administration conserve la possibilité de lever ce blocage via le `financialBypass`.

---

## Plan d'implémentation (P0-022-IMPLEMENTATION-PLAN)

1. **Fichiers à modifier :**
   * `src/pages/ParentPortal.tsx` : Ajouter le statut financier global et conditionner le rendu des onglets.
   * `src/types/index.ts` : Optionnellement enrichir le modèle `Student` si un champ "seuil de tolérance" est configuré au niveau école.

2. **Collections impactées :**
   * Aucune modification structurelle stricte. L'existant (`feeT1`, `payments`, `financialBypass`) suffit pour calculer le statut.

3. **Règles Firestore impactées :**
   * (Si applicable) S'assurer que les parents ne peuvent télécharger les reçus PDF ou les documents liés aux notes via un accès direct API si l'impayé est constaté, bien que la sécurité front-end (React) soit la première étape visée ici.

4. **Composants React impactés :**
   * `ParentPortal` : Modification du `return` pour masquer la navigation interne (`activeTab`) des dossiers bloqués, ne laissant accessible que la vue "Finance".

5. **Tests nécessaires :**
   * Créer un parent lié à un élève 100% payé (doit voir tous les onglets).
   * Créer un parent lié à un élève avec retard partiel (doit voir les présences, mais notes bloquées).
   * Créer un parent lié à un élève en grand impayé (ne doit voir que l'onglet Finances).
   * Tester le basculement via `financialBypass` (déblocage manuel par l'administration).

6. **Risques :**
   * **Frustration parentale** : Un parent pourrait avoir payé par banque mais le paiement n'est pas encore enregistré dans l'application, entraînant un blocage perçu comme abusif.
   * **Performance** : Si le nombre de paiements est élevé, le filtrage côté client (`db.payments.filter(...)`) pourrait ralentir l'affichage. (Déjà présent, mais à surveiller).

7. **Stratégie de rollback :**
   * Restauration du fichier `ParentPortal.tsx` à son état précédent via un simple `git revert`. Puisque la logique repose entièrement sur la vue React (lecture seule) sans migrer de données, le rollback est instantané et sans perte de données.
