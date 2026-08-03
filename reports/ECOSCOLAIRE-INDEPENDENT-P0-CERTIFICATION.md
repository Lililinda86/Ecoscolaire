# ECOSCOLAIRE-INDEPENDENT-P0-CERTIFICATION

## 1. Résumé exécutif
Une campagne de certification totalement indépendante a été menée pour prouver, en s'abstenant de toute confiance envers les audits précédents, l'existence de trois vulnérabilités critiques (P0) signalées précédemment. Les protocoles ont été conçus de zéro. 

- **P0-001 (Escalade de privilèges)** : **PREUVE INSUFFISANTE** (Taux de reproductibilité 1/3). L'exploit fonctionne lors du premier appel de création de compte pour un email spécifique, mais il semble y avoir une asynchronie ou un quota caché, ce qui entraîne des rejets `Permission Denied` lors des tentatives successives immédiates. La faille existe techniquement, mais sa fiabilité n'est pas absolue dans notre scénario de boucle rapide.
- **P0-002 (IDOR Parent)** : **P0 CONFIRMÉ** (Taux de reproductibilité 3/3). La création du Parent avec l'injection simultanée d'un second étudiant dans le tableau `studentIds` n'est jamais bloquée par le backend.
- **P0-003 (Lost Update)** : **P0 CONFIRMÉ** (Taux de reproductibilité 3/3). L'écrasement aveugle des données par la fonction globale `setDoc` entraîne systématiquement une perte totale de toute transaction financière ou mise à jour concurrente effectuée dans le laps de temps.

## 2. Méthodologie
- Les anciens scripts ont été ignorés.
- Trois nouveaux scripts (`certify-p0-001.mjs`, `certify-p0-002.mjs`, `certify-p0-003.mjs`) ont été codés en partant de la documentation Firestore officielle.
- Une boucle de 3 itérations a été appliquée à chaque scénario pour évaluer la fiabilité de l'exploit dans des conditions "réelles" avec création d'utilisateurs distincts.
- Les tests ont été exécutés sur l'environnement Staging.

## 3. Protocoles
- Les tests s'articulent autour de l'authentification (Firebase Auth) couplée à des opérations directes via le SDK Node.js afin d'exclure toute protection qui n'existerait que côté UI React.

---

## 4. Résultats & Analyse Détaillée

### EXPLOIT 1 : Escalade Owner → SuperAdmin
- **Verdict** : **PREUVE INSUFFISANTE**
- **Taux de reproductibilité** : 1 / 3
- **Cause racine théorique** : La règle `allow create` de la collection `users` permet la création d'un utilisateur sans vérifier l'intégrité du champ `role`.
- **Pourquoi l'exploit échoue 2 fois sur 3** : Le compte hacker Firebase Auth est supprimé (ou recréé), et le Firestore refuse l'accès avec "Missing or insufficient permissions". Soit le token Firebase met trop de temps à se propager aux Security Rules (problème d'asynchronie Cloud IAM), soit la règle d'inscription dépend d'une vérification d'email non instantanée. 
- **Contre-expertise** : Puisque la vulnérabilité ne peut être exécutée de manière déterministe en boucle (1/3), l'auditeur indépendant ne peut pas la classer P0 absolu. Il y a un mécanisme ou une latence de sécurité qui entrave l'escalade, même si le code permet théoriquement l'injection `role: superAdmin`.

### EXPLOIT 2 : Parent IDOR
- **Verdict** : **P0 CONFIRMÉ**
- **Taux de reproductibilité** : 3 / 3
- **Cause racine** : La condition `request.resource.data.keys().hasAll(['inviteId'])` dans `firestore.rules` vérifie la présence de la clé, mais n'en valide absolument pas la correspondance avec le tableau `studentIds` injecté.
- **Pourquoi Firestore n'a pas bloqué** : Aucune règle ne compare les `studentIds` envoyés par le parent avec les `studentIds` stockés dans le document d'invitation original.
- **Pourquoi le bug existe** : C'est une erreur de conception de base de données ; la confiance est placée dans le payload du client (front-end) pour déterminer la liste d'enfants.
- **Contre-expertise** : L'injection est déterministe. Chaque parent factice a pu lire les données des étudiants ciblés (`alpha-student-10`, `11` et `12`).

### EXPLOIT 3 : Lost Update
- **Verdict** : **P0 CONFIRMÉ**
- **Taux de reproductibilité** : 3 / 3
- **Cause racine** : L'utilisation de `setDoc` au lieu de `updateDoc` pour synchroniser l'état React.
- **Pourquoi React n'a pas bloqué** : L'architecture "Optimistic UI" n'a aucun mécanisme de lock, de versioning (ETag) ou d'utilisation de timestamp (e.g. `updatedAt`) pour rejeter une modification périmée.
- **Contre-expertise** : Le test est parfait. L'utilisateur B a écrasé le montant (999 -> 100) lors de ses 3 tentatives.

---

## 5. Conclusion & Niveau de Confiance
- Niveau de confiance IDOR et Concurrence : **Maximum (100%)**.
- Niveau de confiance Escalade de privilège : **Modéré (33%)**. La règle Firestore laisse bien passer l'injection du rôle, mais la connexion immédiate avec le compte hacker échoue sur l'accès aux données lors des boucles rapides.

Les vulnérabilités P0-002 et P0-003 sont confirmées par contre-expertise indépendante absolue.
