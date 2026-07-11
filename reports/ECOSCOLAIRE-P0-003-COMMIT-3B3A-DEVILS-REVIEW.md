# ECOSCOLAIRE — P0-003 — COMMIT 3B.3A — DEVIL'S REVIEW

**Auditeurs :** Principal Firestore Architect, SRE, Principal Security Engineer
**Date :** 28 Juin 2026

---

## ÉTAPE 1 — Vérification des Affirmations Firestore

1. **Les transactions Firestore sont ACID.** -> **VRAI.** Mais uniquement si le client est en ligne. Une transaction cliente est rejetée immédiatement hors-ligne.
2. **Les transactions Firestore sont strictement sérialisables.** -> **VRAI.** L'isolation est globale.
3. **Le SDK rejoue automatiquement les transactions.** -> **VRAI.** Le backoff exponentiel (Optimistic Concurrency Control) gère les conflits de version sur `schoolRef`.
4. **Une transaction de 250 écritures est raisonnable.** -> **PARTIELLEMENT VRAI.** Le payload (250 élèves) peut faire ~500 Ko. Sur un réseau 3G africain, l'upload de 500 Ko peut prendre 2 à 5 secondes. Or, plus une transaction met de temps à être transmise, plus la probabilité qu'un autre client modifie `schoolRef` (provoquant un échec OCC et un retry) augmente. 
5. **250 est un optimum.** -> **FAUX.** Pour minimiser les collisions OCC et les timeouts réseaux sur mobile/3G, un chunk de **100** est statistiquement beaucoup plus robuste, même s'il demande plus de round-trips.
6. **Le hotspot sur `schoolRef` est négligeable.** -> **FAUX.** Si 5 directeurs d'une même école tentent des imports au même moment, Firestore bridera les écritures à ~1 par seconde sur le document `schoolRef`. Le backoff du SDK causera des temps d'attente immenses (plusieurs dizaines de secondes) et des timeouts (`deadline-exceeded`).
7. **Le backoff Firestore suffit toujours.** -> **FAUX.** Il a une limite max de tentatives (souvent 5 en Web SDK). Si la contention est extrême, la transaction échouera brutalement.
8. **Delete est totalement idempotent.** -> **VRAI.** `transaction.delete()` n'échoue pas si le document n'existe pas.
9. **Le compteur `studentCount` ne peut jamais dériver.** -> **FAUX.** Il dérivera inévitablement si un développeur supprime manuellement un élève dans la console Firebase, ou si un script d'admin `setDoc` hors-transaction est exécuté à l'avenir.
10. **L'import partiel est toujours acceptable.** -> **FAUX.** Métierement et UX parlant, c'est désastreux. L'utilisateur ne sait pas exactement lesquels des 1200 ont été insérés avant le crash.

---

## ÉTAPE 2 — Scénarios Oubliés & Fâcheux

- **Double clic / Absence de Debounce :** Si le bouton "Importer" n'est pas bloqué à la milliseconde près, deux boucles d'import démarrent. Avec des UUID aléatoires, on insèrera 2x les mêmes élèves et on cramera le quota 2x plus vite.
- **Fermeture de l'onglet :** Le script JS s'arrête. Le backend Firebase ne sait pas que l'import devait continuer. Résultat : import tronqué. Le client relance son fichier complet = Création de doublons = Perte de quota sèche.
- **Changement de Token d'Auth pendant l'import :** Au chunk 5, le token expire et doit se rafraîchir. Firebase gère généralement cela en coulisses, mais une transaction peut échouer avec `permission-denied` si la latence de refresh est trop longue.
- **Expiration de l'abonnement pendant l'import :** Si un webhook Stripe déclasse l'école en plein import, le Chunk 3 lira le nouveau quota (réduit) et échouera proprement. Comportement valide.

---

## ÉTAPE 3 — Firestore Limits & Chunk Sizing

- Limite de documents par transaction : 500.
- Taille max du payload d'une transaction : 10 MiB.
- Limite d'écriture par document : 1 / seconde.

**Analyse :** 
250 est trop élevé pour une architecture purement client-side ciblant des réseaux instables, car le temps de maintien du lock OCC grandit avec la taille du payload. 
**Nouvelle Recommandation :** 100 élèves par chunk. La stabilité OCC prime sur le nombre de requêtes HTTP (Firebase utilise le multiplexing HTTP/2 de toute façon).

---

## ÉTAPE 4 — La Dérive du `studentCount`

Le `studentCount` DÉRIVERA, c'est une certitude dans la durée de vie d'une application (support client, suppressions manuelles GDPR, bugs de scripts).
**Correction :** 
1. Le bouton "Recalculer les quotas" (Diagnostic) est vital.
2. Pour éviter les dérives coûteuses, une Cloud Function asynchrone type "Cron" (Scheduled Function) devrait tourner chaque nuit pour faire un `count()` sur les sous-collections et ajuster silencieusement `studentCount`. (Firestore supporte désormais `count()` de manière très peu coûteuse : 1 Read pour 1000 index entrées).

---

## ÉTAPE 5 — Robustesse Métier de l'Import Client

L'approche "Import Partiel avec Doublons sur Retry" (Option A du précédent rapport) est une bombe à retardement pour le support client ("J'ai payé pour 100 places, mon import a planté, j'ai relancé, ça m'a créé des doublons et je suis bloqué à cause du quota !!").

**Comparaison :**
- A. Import partiel aveugle : UX toxique.
- **C. Reprise d'import (Journalisation) :** Seule approche client-side viable. On sauvegarde un document `imports/{importId}` qui tracke `lastChunkProcessed`. Mais trop complexe pour le frontend.

**Recommandation métier :**
L'import massif **DOIT** reposer sur des ID déterministes.
`const studentId = hash(matricule + schoolId)` ou `hash(nom + prenom + classId)`.
Dans la transaction, il faut impérativement vérifier si le document existe (via `transaction.get()`). Mais on ne peut pas lire 100 documents sans éclater le budget de latence.
**Conclusion cruelle :** L'architecture client-side pour des imports massifs AVEC vérification de quota est fondamentalement inadaptée.

---

## ÉTAPE 6 — La Vraie Architecture (Server-Side)

L'architecture actuelle est un pis-aller. La norme de l'industrie (Google Cloud) est :
1. Le client parse le CSV/Excel.
2. Le client enregistre l'array JSON dans un document `import_jobs/{jobId}` (statut: `PENDING`).
3. Une **Cloud Function** (trigger `onCreate`) se déclenche.
4. La Cloud Function tourne côté serveur (réseau Google, pas de timeouts). Elle exécute des `BulkWriter`, vérifie la DB sans limites de `reads` restrictives, calcule les deltas exacts, applique les Upserts, et fait `schoolRef.update(studentCount: finalCount)`.
5. Le client écoute le statut du `jobId` (`IN_PROGRESS` -> `COMPLETED`).

---

## ÉTAPE 7 — Dette Technique Produite

| Catégorie | Dette Technique | Impact |
|---|---|---|
| **Critique** | L'importation est sujette aux crashs client (navigateur fermé = import coupé sans reprise). | Plaintes clients, fuites de quota par création de doublons au retry. |
| **Haute** | Utilisation de transactions OCC massives depuis un environnement réseau non fiable. | Timeouts, erreurs `aborted`. |
| **Moyenne** | Dérive inévitable du `studentCount` via console Admin. | Géré par le Diagnostic Manuel. |

---

## ÉTAPE 8 — Production Readiness

| Critère | Note | Justification |
|---|---|---|
| Intégrité des Données | 4/10 | Risque majeur de doublons (SaaS leak) lors de retries humains après crash partiel. |
| Scalabilité | 5/10 | Client bloqué pendant la durée de la boucle. |
| UX | 3/10 | Pas de reprise après erreur, doublons garantis si retry. |
| Performances | 6/10 | Décent si le réseau est parfait. |
| Simplicité | 8/10 | Facile à coder (pas de Cloud Function). |

**NOTE GLOBALE : 5.2 / 10**

---

# VERDICT FINAL

**NOT READY**

L'architecture 100% "Client-Side Transaction Loop" avec UUID aléatoires pour contourner le manque de validation d'existence est un compromis beaucoup trop dangereux pour un système facturable (SaaS). 

**Recommandation d'Urgence :**
Soit on accepte la dette UX énorme (et on doit coder un "Dédoublonneur" dans le Diagnostic pour rattraper les bêtises des directeurs), soit l'import massif doit être déporté vers Firebase Cloud Functions via un pattern Asynchrone de type Job Queue. L'approche client-side actuelle créera des tickets de support continus.
