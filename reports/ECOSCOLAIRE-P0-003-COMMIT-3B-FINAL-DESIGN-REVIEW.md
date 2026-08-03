# ECOSCOLAIRE — P0-003 — COMMIT 3B — FINAL DESIGN REVIEW (PRE-IMPLEMENTATION)

**Auteur :** Comité Indépendant (Principal Distributed Systems Architect, Staff SWE, Firestore SRE)
**Date :** 28 Juin 2026

---

## ÉTAPE 1 : VULNÉRABILITÉS DE DÉSYNCHRONISATION (Faux `studentCount`)

L'architecture `schools/{schoolId}.studentCount` est un compteur matérialisé. Par nature, un compteur matérialisé est vulnérable à la désynchronisation spatio-temporelle. 

Voici l'exhaustivité des cas où il deviendra faux :
1. **Manipulation Firebase Console :** Un développeur ou Super Admin supprime un document élève à la main. Le compteur n'est pas décrémenté.
2. **Scripts administrateur backend :** Un script d'import Node.js bypass l'UI et utilise `db.collection('students').add()`.
3. **Network Drop post-commit :** Le client envoie sa transaction, Firestore la valide (commit = true, compteur = OK), mais la connexion du client coupe avant le `ACK`. L'UI catch une erreur, mais le backend est juste. Risque de retry manuel par l'utilisateur (géré par le fait que l'ID élève pré-généré rejettera le retry via une contrainte `if (!exists)`).
4. **Restauration de backup partielle :** Restauration de la collection `students` de J-1 sans restaurer la collection `schools`.
5. **Code legacy orphelin :** S'il reste un seul `setDoc` de création (ex: via un portail Parent non audité) qui ne fait pas partie de la transaction.
6. **Soft Delete vs Hard Delete :** Si la stratégie de Soft Delete est adoptée un jour (`deleted: true`), `studentCount` risque d'être décrémenté 2 fois si mal géré.
7. **Échec d'un Batch Partiel :** En cas d'import de masse. (Firestore Batch est atomique, donc 0% de risque ici).

---

## ÉTAPE 2 : ANALYSE DES RISQUES ET REMÉDIATIONS

| Scénario | Fréquence | Gravité | Détectabilité | Correction |
| :--- | :--- | :--- | :--- | :--- |
| Console Firebase | Très Rare | Moyenne | Faible en temps réel | Réconciliation on-demand |
| Scripts Admin | Rare | Haute (Bulk) | Faible en temps réel | Réconciliation Cloud Cron |
| Network ACK Drop | Très Rare | Faible (Backend OK) | Haute (Mismatch UI) | Auto-géré par IDempotence |
| Restauration Backup | Exceptionnelle | Critique | Haute | Procédure DevOps stricte |
| Code Legacy oublié | Possible | Haute (Quota bypass) | Faible | Test automatisé `grep` CI |

---

## ÉTAPE 3 : AUDIT STRICT DE `runTransaction`

- **Est-ce vraiment ACID ?** Oui. Firestore Transactions garantissent l'Atomicité, la Cohérence (selon le modèle Firestore), l'Isolation (Niveau *Strictly Serializable* pour les documents impliqués) et la Durabilité.
- **Linéarisable ?** Oui, Firestore utilise Spanner en sous-couche. Les reads dans la transaction prennent un snapshot lock logique.
- **Garanties exactes :** La transaction SDK Firebase Client lit `schoolId`, exécute la logique de vérification, puis envoie la payload de write. Si le document `schoolId` a changé *pendant* ce temps (un autre parent est inscrit par une autre secrétaire), le serveur Firestore rejette la payload. Le SDK client **rejoue silencieusement** la logique (jusqu'à 5 fois avec backoff).
- **Conflits détectés :** Toute modification concurrente du compteur (secrétaire A et B cliquent à la même milliseconde).
- **Conflits NON détectés :** Création hors-transaction (si un hackeur utilise l'API REST Firestore en bypassant le SDK client, car nos Firestore Rules actuelles ne forcent pas la cohérence entre `students` et `schools`). *Ceci est une faille de sécurité nécessitant une évolution des `firestore.rules` (hors scope 3B immédiat mais crucial pour 3C).*
- **Erreurs explicites à gérer :** `offline` (les transactions échouent immédiatement hors ligne), `quota-exceeded` (si l'école crée >1 élève par seconde en continu), `permission-denied`.

---

## ÉTAPE 4 : COMPARAISON DES ARCHITECTURES DE QUOTA

| Architecture | Sécurité | Scalabilité | Offline | Coût | UX | Note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A.** Client-side array length | 0/10 | 10/10 | 10/10 | Gratuit | 10/10 | **0/10** (Write Skew) |
| **B.** `increment()` seul | 4/10 | 9/10 | 10/10 | Bas | 10/10 | **4/10** (Pas de blocage pré-création) |
| **C.** `runTransaction` Client | 9/10 | 6/10 | 0/10 | Bas | 7/10 | **8/10** |
| **D.** Cloud Functions API | 10/10 | 10/10 | 0/10 | Élevé | 5/10 | **7/10** (Surcoût et latence) |
| **H. Hybride (Transac + Réconciliation)** | **9.5/10** | **8/10** | **0/10*** | **Bas** | **7/10** | **9/10 (Gagnant)** |

*\*Offline sacrifié au profit de l'intégrité financière (Accepté contractuellement pour le SaaS).*

---

## ÉTAPE 5 : AUDIT DE LA RÉCONCILIATION (SELF-HEALING)

| Mécanisme | Avantage | Danger / Inconvénient | Verdict |
| :--- | :--- | :--- | :--- |
| **Trigger (`onCreate`/`onDelete`)** | Temps réel. | **DANGEREUX (Hotspot).** Créera une contention massive lors d'imports. Limité à 1 write/sec. | 🚫 REJETÉ |
| **Cloud Scheduler (Cron Nuit)** | Silencieux, robuste, coût lissé. | Nécessite un déploiement backend (Functions). | 🟠 OPTION LONG TERME |
| **Diagnostic Dashboard (On-demand)** | Zéro coût infra, très simple. | Demande une action humaine. | ✅ RECOMMANDÉ IMMÉDIAT |
| **Hook `onMount` (Login Admin)** | Translucide. | Rallonge le temps de connexion. | 🚫 REJETÉ |

*Décision :* Implémenter un bouton "Recalculer les Quotas" dans le Dashboard Super Admin/Diagnostic.

---

## ÉTAPE 6 : EFFETS DE BORD ET CONTENTION (HOTSPOTS)

L'utilisation de `schools/{schoolId}` comme point central de comptage crée un **Hotspot Firestore**. Firestore limite l'écriture sur un même document à ~1 par seconde.
- **Trafic manuel :** 1 secrétaire saisit un élève toutes les minutes. (Risque : Nul).
- **Imports simultanés :** Si on importe 500 élèves dans une boucle de transactions unitaires, on va frapper la limite de 1 write/sec, ça prendra 8 minutes ou ça plantera en timeout.
- **Solution OBLIGATOIRE :** L'import Excel doit utiliser un `writeBatch()` (ou une grosse transaction). Il écrira les 500 élèves d'un coup, et fera un SEUL `updateDoc` sur `studentCount += 500` (ou `increment(500)`). Contention : 1 write. **Si cette règle n'est pas suivie, l'architecture plantera à la première rentrée scolaire.**

---

## ÉTAPE 7 : ROADMAP DÉFINITIVE COMMIT 3B

- **3B.1 : Pré-requis Data (SuperAdmin)**
  - *Objectif :* Permettre l'initialisation de `studentCount` sur les écoles.
  - *Fichiers autorisés :* `Diagnostic.tsx` (ou Dashboard Admin).
- **3B.2 : CRUD Atomique**
  - *Objectif :* Remplacer la création et suppression unitaire par `runTransaction`.
  - *Fichiers :* `Students.tsx`.
  - *Critère :* Catch explicite des erreurs offline.
- **3B.3 : Imports Massifs (Anti-Contention)**
  - *Objectif :* Utiliser un `writeBatch` plafonné à 500 opérations pour l'import.
  - *Fichiers :* `Students.tsx`.
  - *Risque :* Plantage silencieux si > 500 élèves (Firestore hard limit sur Batch).
- **3B.4 : Test & CI**
  - *Objectif :* Prouver la fin du `saveDB` de manière statique.
  - *Fichiers :* `scripts/test-p0-003-*`

---

## ÉTAPE 8 : MATRICE DE TESTS (STRATÉGIE)

1. **Test Concurrence Extreme (Script Node) :** Envoyer 50 requêtes `runTransaction` asynchrones simultanées avec un quota de 5 places. Vérifier que la BDD finit exactement à 5.
2. **Test Contention (Import) :** Fichier Excel de 499 élèves. Vérifier que ça passe en < 3 secondes. Fichier de 501 élèves. Vérifier que ça batche proprement (2 batches).
3. **Test Offline :** Couper le Wi-Fi, cliquer "Créer". Vérifier que l'UI dit "Connexion requise pour la licence". Rétablir Wi-Fi, vérifier succès.
4. **Test Corruption Manuelle :** Via Firebase Console, supprimer 3 élèves. Aller dans Diagnostic, cliquer "Réconcilier". Vérifier que le compteur redevient correct.

---

# VERDICT FINAL

**APPROVED WITH REQUIRED CHANGES**

**Justification technique :**
L'architecture de compteurs transactionnels matérialisés (`runTransaction` sur `studentCount`) est l'approche la plus robuste pour garantir les licences SaaS d'un système distribué sans backend lourd, tout en évitant le Write Skew de lecture cliente. 
Cependant, l'architecture est **APPROUVÉE SOUS RÉSERVE** de la règle suivante : **L'import Excel ne doit absolument pas boucler sur des transactions unitaires**. Il doit utiliser un `writeBatch()` global pour mettre à jour la taille de la classe et incrémenter le quota en une seule écriture serveur afin d'éviter les `Retry Storms` et le `Contention Hotspot`. La réconciliation doit être manuelle (Diagnostic) dans l'immédiat pour éviter d'inutiles coûts de Cloud Functions.
