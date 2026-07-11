# ECOSCOLAIRE — P0-003 — COMMIT 3 — STUDENTS ARCHITECTURE AUDIT

**Auteurs :** Lead Firestore Engineer, SaaS Concurrency Specialist, QA Lead
**Date :** 28 Juin 2026
**Statut :** **NOT READY — SAAS CONSISTENCY RISK & TRANSACTION BOUNDARY UNCLEAR** (sans ajustements architecturaux)

---

## 1. Cartographie exhaustive des écritures

Le module `src/pages/Students.tsx` gère la manipulation des élèves. Actuellement, il dépend massivement de la fonction globale `saveDB` (située dans `AppContext.tsx`).

### Flux identifiés :
1. **Création manuelle d'un élève :**
   - Fonction : `handleSave` (Ligne 130)
   - Mutabilité locale : `newDb.students.push(...)`
   - Écriture Firestore : Via `saveDB(newDb)` qui déduit un `setDoc`.
2. **Modification d'un élève :**
   - Fonction : `handleSave` (Ligne 128)
   - Mutabilité locale : `newDb.students.map(...)`
   - Écriture Firestore : Via `saveDB(newDb)` (`setDoc` si JSON diff).
3. **Suppression unitaire (SuperAdmin/Director) :**
   - Fonction : `handleDelete` (Ligne 153)
   - Mutabilité locale : `newDb.students.filter(...)`
   - Écriture Firestore : Via `saveDB(newDb)` (`deleteDoc` déduit de l'absence).
4. **Demande de suppression (Autres rôles) :**
   - Fonction : `handleDelete` (Ligne 164)
   - Écriture Firestore : Pousse un objet dans `newDb.validation_requests`, puis `saveDB`.
5. **Suppression totale (Vider la liste) :**
   - Fonction : `handleDeleteAll` (Ligne 184)
   - Écriture Firestore : `saveDB({ ...db, students: [] })` (déclenche N `deleteDoc` en boucle).
6. **Import Excel (Batch) :**
   - Fonction : `handleConfirmImport` (Ligne 359)
   - Écriture Firestore : `saveDB({ ...db, students: [...db.students, ...previewStudents] })`.
7. **Invitation de parent (Exceptions positives) :**
   - Fonction : `generateInviteLink` (Ligne 94)
   - Écriture Firestore : Utilise déjà un SDK direct atomique : `setDoc(doc(firestoreDb, 'parent_invitations', inviteId), invitation)`.

---

## 2. Analyse des Risques de Concurrence

| Risque | Description | Probabilité | Impact |
|--------|-------------|-------------|--------|
| **SaaS Limit Bypass (Write Skew)** | Si deux utilisateurs (ou deux onglets) créent un élève au moment où le quota est à `Limite - 1`, les deux passent le check UI `db.students.length` (car non synchronisé en temps réel avec le pending) et écrivent. Résultat : Limite + 1. | Haute | **Haut (Fuite de revenu)** |
| **Double Submit (Création)** | Un double-clic sur le bouton "Enregistrer" déclenche 2 fois `handleSave`. L'UUID (`crypto.randomUUID()`) est généré *pendant* la soumission (Ligne 130). 2 clics = 2 UUIDs différents pour la même donnée = 2 élèves. | Haute | Moyen (Données corrompues) |
| **Lost Update (Édition)** | A et B éditent un élève. A sauve, modifiant l'adresse. Puis B sauve. Comme `saveDB` utilise `setDoc` avec l'état local de B, si l'état de B n'avait pas l'adresse de A, B écrase la modif de A. | Haute | Moyen (Perte de données) |
| **Résurrection (ABA Problem)** | A supprime l'élève Z. B modifie l'élève Z sur un vieil onglet. `saveDB` de B fait un `setDoc(Z)` car Z a changé localement, ce qui *recrée* l'élève supprimé. | Moyenne | Haut (Conformité) |

---

## 3. Analyse des Limites SaaS (Quotas)

**Calcul & Stockage actuels :**
- La limite est calculée via `getStudentLimit(currentSchool)` (`src/utils/saas.ts`).
- **Validation** : Faite de manière 100% Client-Side (`Students.tsx`, Lignes 23, 118, 348).
- **Le problème majeur** : Le compteur d'élèves *n'est stocké nulle part*. L'UI utilise `db.students.length`, qui est le count des documents rapatriés en local. 

**Vecteurs de contournement confirmés :**
- Deux secrétaires créant exactement au même instant.
- Un import Excel exécuté pendant qu'un autre utilisateur crée.
- Ajouts massifs simultanés via plusieurs onglets.

*Conclusion SaaS : Sans un compteur centralisé et vérifié côté serveur, la limite SaaS ne peut mathématiquement pas être garantie.*

---

## 4. Frontières Transactionnelles Recommandées

Pour garantir l'intégrité, nous devons supprimer l'utilisation de `saveDB` au profit des SDK atomiques, selon ces règles :

1. **Création unitaire** : 
   - DOIT utiliser **`runTransaction`**. 
   - *Pourquoi ?* Firestore ne permet pas de faire une requête de comptage (`count()`) dans une transaction. Il faut migrer l'architecture pour maintenir un champ `studentCount` sur le document `schools/{schoolId}`. La transaction lira ce document, vérifiera `studentCount < limit`, créera le document dans `students`, et fera `increment(1)`.
2. **Import Excel** :
   - DOIT utiliser **`runTransaction`** (si < 500) avec vérification de `studentCount + importSize <= limit`.
3. **Mise à jour (Édition)** :
   - DOIT utiliser **`updateDoc`**. 
   - *Pourquoi ?* Fusionne uniquement les champs modifiés, évitant le Lost Update et la résurrection d'élèves supprimés (un `updateDoc` échoue si le doc a été supprimé par ailleurs).
4. **Suppression (Delete/DeleteAll)** :
   - DOIT utiliser un **`writeBatch`** combiné potentiellement à une transaction pour faire `increment(-1)` sur `schools`.
5. **Demande de suppression (Validation Request)** :
   - DOIT utiliser **`setDoc`** sur la collection `validation_requests`.

---

## 5. Idempotence & Résilience Client

Pour prévenir les doublons et problèmes réseau :
- **Pré-génération d'UUID** : Déplacer `crypto.randomUUID()` à l'ouverture de la modale (`handleOpenModal`) et stocker l'ID dans l'état `currentStudent`. Le bouton "Enregistrer" sera ainsi idempotent (un retry réseau de `setDoc` écrasera la même entité au lieu d'en recréer une).
- **Garde UI `isSaving`** : Bloquer les boutons et le formulaire pendant l'opération Firestore (`disabled={isSaving}`).

---

## 6. Plan de Migration (En 3 sous-phases)

**Sous-phase 3A : Sécurisation Client-Side & Updates**
- Mettre en place `isSaving` (bloquant le Double Submit UI).
- Pré-générer le UUID à l'ouverture de la modale.
- Migrer l'édition vers `updateDoc(doc(...), { champs_modifies })`.
- Migrer la demande de validation (`validation_requests`) vers `setDoc` direct.

**Sous-phase 3B : Architecture Quotas Serveur**
- Ajouter un script de migration (`scripts/migrate-student-counts.ts`) pour populer `studentCount` dans les documents `schools`.
- Convertir la création manuelle en `runTransaction` qui valide le `studentCount`.
- Convertir la suppression (`handleDelete`) pour décrémenter le `studentCount`.

**Sous-phase 3C : Import Excel Atomique**
- Modifier `handleConfirmImport` pour utiliser `runTransaction` (ou Firebase Cloud Functions s'il y a plus de 500 élèves) pour garantir l'intégrité du quota.

---

## 7. Plan de Tests & Critères de Certification

| Test | Méthode (Playwright / Node) | Invariant attendu |
|------|-----------------------------|-------------------|
| **Idempotence UI** | Modale ouverte, `button.click()` × 5 rapide. | 1 seul document créé dans `students`. |
| **Lost Update (Édition)** | Navigateur A et B éditent 2 champs différents du même élève en même temps. | Les 2 champs sont mis à jour (aucun écrasement). |
| **Ghost Resurrection** | Navigateur A supprime Z. Navigateur B essaie d'éditer Z. | B reçoit une erreur UI (document inexistant), Z reste supprimé. |
| **SaaS Write Skew** | Quota = N. 2 scripts Node tentent la création simultanée à N-1. | Une requête réussit (passe à N), l'autre échoue (Transaction Aborted). |
| **Import Over Quota** | Quota = N. `studentCount` = N-2. Import de 5 élèves. | Rejet UI strict sans aucune création partielle. |

---

# CONCLUSION

Le module `Students.tsx` dans son état actuel présente un risque financier (SaaS bypass) et des risques d'intégrité des données (ABA problem, Lost Update). 

**Nous ne pouvons pas simplement remplacer `saveDB` par `setDoc` pour la création.** 
Il faut d'abord acter la stratégie pour la **Limite SaaS**.
L'introduction d'un compteur incrémentiel `studentCount` sur le document `school` est **obligatoire** pour sécuriser les transactions Firestore face à l'import en masse et la concurrence multi-onglets.

**Veuillez confirmer cette architecture (notamment l'ajout du compteur `studentCount` sur `schools`) avant de commencer l'implémentation (Commit 3A).**
