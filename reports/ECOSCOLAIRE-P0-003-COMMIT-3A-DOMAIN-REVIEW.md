# ECOSCOLAIRE — P0-003 — COMMIT 3A — FINAL DOMAIN REVIEW

**Auteur :** Domain Architect
**Date :** 28 Juin 2026
**Commit évalué :** `a0aaefdb2f15136669bca3d9cdcd9a7014d6d532`

---

## 1. Analyse Métier et Ownership

| Champ | Module propriétaire | Éditable ici ? | Justification et Risque de conflit |
| :--- | :--- | :--- | :--- |
| `matricule` | **Students** | OUI | Identifiant métier de l'élève. |
| `name` | **Students** | OUI | Identité de base. |
| `gender` | **Students** | OUI | Démographie. |
| `dob` | **Students** | OUI | Démographie. |
| `section` | **Students** | OUI | Académique (Francophone/Anglophone). |
| `classId` | **Students** | OUI | Affectation académique. |
| `parentName` | **Students** (Parents) | OUI | Contact légal. (Peut recouper un futur module Parents, mais lié à l'élève pour le moment). |
| `parentEmails` | **Students** (Parents) | OUI | Contact légal. |
| `parentPhone` | **Students** (Parents) | OUI | Contact légal. |
| `feeT1` | **Finance / Students** | OUI | Montant attendu pour la Tranche 1 (Scolarité). Éditable par élève (ex: remises, bourses). Le module Payments lit ce montant pour calculer le reste à payer. |
| `feeT2` | **Finance / Students** | OUI | Montant attendu pour la Tranche 2. |
| `feeT3` | **Finance / Students** | OUI | Montant attendu pour la Tranche 3. |
| `feeTransport` | **Finance / Students** | OUI | Montant attendu pour le transport. |
| `feeUniforms` | **Finance / Students** | OUI | Montant attendu pour les tenues. |
| `address` | **Students** | OUI | Démographie/Logistique. |
| `emergencyContact` | **Students** (Santé) | OUI | Logistique/Sécurité. |
| `allergies` | **Students** (Santé) | OUI | Donnée médicale rattachée à l'élève. |
| `medicalConditions` | **Students** (Santé) | OUI | Donnée médicale rattachée à l'élève. |

---

## 2. Détection des violations

Tous les champs présents dans l'allowlist sont modifiés directement par les champs du formulaire `Modal` géré dans `Students.tsx`.
- Les champs de type `fee*` (Scolarité et Frais annexes) représentent les **montants attendus/facturés** pour un élève spécifique, et non les paiements réels. Le module *Payments* reste souverain sur l'historique des encaissements, tandis que le profil *Student* est souverain sur le tarif qui lui est appliqué.
- Il n'y a pas d'empiètement sur les configurations globales de l'école (`Settings` / `School`) car on ne modifie pas les tarifs de base de l'école, on modifie uniquement la surcharge appliquée à cet élève spécifique.

**Note sur l'intégrité de la facturation :**
Bien que la modification de `feeT1` impacte le calcul du "Reste à payer" dans le module Payments, cela relève d'une logique métier légitime (ex: la direction accorde une réduction de scolarité en cours d'année). Les transactions enregistrées précédemment par le module Payments restent intactes. Il n'y a donc pas de violation d'ownership de domaine (Domain Ownership Violation).

---

## 3. Conclusion

L'allowlist est correcte et parfaitement alignée avec le formulaire d'édition de l'élève. Les champs financiers présents ne représentent que les "attendus" (le contrat financier de l'élève) et non l'état transactionnel, respectant ainsi les frontières du domaine avec le module Payments.

# VERDICT

**APPROVED FOR PUSH**
