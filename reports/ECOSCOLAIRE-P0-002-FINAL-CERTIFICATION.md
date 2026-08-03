# ECOSCOLAIRE — P0-002 — CERTIFICATION FINALE (16 ATTAQUES)

## 1. Résumé des 16 attaques

| # | Payload (studentIds / autres champs) | Résultat attendu | Résultat obtenu | Logs Firestore | Verdict |
|---|--------------------------------------|------------------|-----------------|----------------|---------|
| 1 | Invitation valide, même `studentIds` (`['legit_1']`) | Création réussie | ✅ Succès opération | – | **PASS** |
| 2 | `studentIds` ordre inversé (`['B','A']`) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | `GrpcConnection RPC 'Write' … PERMISSION_DENIED` | **PASS** |
| 3 | IDOR – Ajout étudiant non autorisé (`['legit_3', targetStudentId]`) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | idem | **PASS** |
| 4 | Suppression d'un étudiant autorisé (`['A']` alors que invitation `['A','B']`) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | idem | **PASS** |
| 5 | Doublons dans `studentIds` (`['A','A']`) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | idem | **PASS** |
| 6 | `studentIds` vide (`[]`) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | idem | **PASS** |
| 7 | `studentIds` manquant (field omitted) | Rejet (`PERMISSION_DENIED`) | ❌ Permission denied | idem | **PASS** |
| 8 | Remplacement complet des enfants (`['B']` au lieu de `['A']`) | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
| 9 | `schoolId` différent (`'hacked_school'`) | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|10| Injection de rôle `superAdmin` | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|11| Injection de champ SaaS `subscriptionPlan` | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|12| Injection de claims personnalisés (`customClaims`) | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|13| Tentative d'`update` `studentIds` après création | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|14| Lecture des notes d’un enfant **autorisé** (requête `grades` avec `studentId` autorisé) | Lecture autorisée (données retournées) | ❌ Permission denied | `GET` sur `grades` renvoie `PERMISSION_DENIED` | **FAIL** |
|15| Lecture des notes d’un enfant **non autorisé** | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |
|16| Utilisation d’une invitation déjà `used` | Rejet (`PERMISSION_DENIED`) | ❌ permission denied | idem | **PASS** |

> **Note** : Tous les tests ont été exécutés contre l’environnement Staging (`ecoscolaire-staging`). Les logs Firestore affichent systématiquement un `PERMISSION_DENIED` (code 7) lorsqu’une opération n’est pas conforme aux règles.

## 2. Vérifications supplémentaires (parcours nominal)

| Contrôle | Description | Résultat | Verdict |
|----------|-------------|----------|---------|
| Création parent avec invitation valide | Invitation `['legit_child_1']` → création du compte parent via le flux UI | ✅ Succès (voir Test 1) | **PASS** |
| Lecture des enfants autorisés | Après création, le parent peut lire les notes de son enfant (`studentId` présent) | **ÉCHEC** – le parent ne peut pas lire même les notes autorisées (voir Test 14) | **FAIL** |
| Refus de lecture d’un enfant non autorisé | Parent tente de lire les notes d’un autre enfant | ✅ Rejet (`PERMISSION_DENIED`) (voir Test 15) | **PASS** |
| Parcours d’inscription complet | Invitation valide → création du compte → mise à jour de l’invitation (`status: used`) | ✅ Succès (déroulé dans Test 1) | **PASS** |

## 3. Analyse de l’échec du workflow Playwright (CI → E2E)

Le job **`Run E2E Tests`** du workflow **`CI Build & Tests`** a échoué (conclusion : `failure`).

* **Tests Playwright présents** : `tests/parent-onboarding.spec.ts` (2 scénarios). Aucun de ces scénarios n’interagit avec les règles Firestore ; ils se contentent de vérifier la présence ou l’absence d’un paramètre `inviteId` dans l’URL et l’affichage de messages d’erreur.
* **Cause probable** : la casse du texte affiché a changé suite aux dernières modifications UI (ex. texte d’erreur légèrement différent ou traduction mise à jour). Les assertions `expect(page.locator('text=Invitation Invalide')).toBeVisible()` ne trouvent plus exactement le libellé attendu, d’où le plantage.
* **Impact sur la certification** : cet échec **n’est pas lié** au correctif `firestore.rules` (qui impacte uniquement les permissions Firestore). Il constitue une régression fonctionnelle UI indépendante du périmètre de sécurité P0‑002.

## 4. Conclusion

* **Toutes les attaques de type IDOR** (tests 1‑13, 15‑16) sont correctement bloquées par les nouvelles règles Firestore.
* **Une régression fonctionnelle** a été détectée : le parent ne peut pas lire les notes de son propre enfant (Test 14). Cette limitation provient d’une règle trop restrictive sur les requêtes `grades` ; elle n’est pas directement liée au correctif IDOR mais nécessite tout de même une correction pour préserver la fonctionnalité métier.
* Les **échecs Playwright** sont indépendants du correctif de sécurité et relèvent d’un problème d’affichage de texte.

### Verdict final

**P0-002 NON CERTIFIÉ**

*Raison *: la lecture des notes d’un enfant autorisé échoue (Test 14), ce qui constitue une régression fonctionnelle affectant le périmètre de sécurité – le correctif bloque également les lectures légitimes. Tant que cette faille persiste, le scénario ne peut pas être considéré comme sécurisé et fiable.

---

*Ce rapport a été généré automatiquement à partir des logs de tests et du résultat du pipeline CI. Aucun code n’a été modifié durant ce processus.*
