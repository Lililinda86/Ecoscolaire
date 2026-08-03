# ECOSCOLAIRE-P0-PARENT-IDOR-STAGING-CERTIFICATION

## 1. Environnement Testé
- **Environnement** : Staging (`ecoscolaire-staging`)
- **Node.js** : v24.14.0
- **Firebase CLI** : 15.22.2
- **Java** : 1.8.0_421 (Incompatible avec l'émulateur Firebase qui requiert Java 21+)

---

## 2. Étape 1 : Diagnostic de l'Environnement
Exécution de la commande `node -v ; npx firebase-tools --version ; java -version ; npx firebase-tools projects:list`

**Anomalies identifiées** : 
1. Le CLI Firebase n'est pas authentifié sur le système hébergeant le code (`Failed to authenticate, have you run firebase login?`).
2. Aucune variable d'environnement `FIREBASE_TOKEN` ou `GOOGLE_APPLICATION_CREDENTIALS` n'est configurée pour autoriser un déploiement "headless".
3. L'émulateur local est bloqué par une version Java obsolète (Java 8 au lieu de Java 21).

---

## 3. Étape 2 & 3 : Tentative de Correction & Déploiement
**Commande exécutée** :
```bash
npx firebase-tools deploy --only firestore:rules --project ecoscolaire-staging
```
**Résultat (Logs)** :
```text
Error: Failed to authenticate, have you run firebase login?
```
**Analyse** : Le déploiement est matériellement impossible sans intervention utilisateur (exécution de `firebase login` ou ajout d'un token d'intégration). Le correctif `firestore.rules` (qui est présent en local) n'a **pas** pu être poussé sur les serveurs Staging. L'environnement distant exécute toujours le code faillible.

---

## 4. Étape 4 : Certification P0-002 (Exécution Réelle)

Conformément à la règle absolue "Tu ne supposes jamais qu'un correctif fonctionne sans exécution réelle", une batterie d'attaques a été lancée sur l'environnement Staging.

**Script d'attaque** : `run-all-16-tests.mjs`
**Cible** : Staging Firestore en direct

### Attaque 1 : studentIds identiques (Création normale)
- **Payload** : `['child_1']`
- **Résultat attendu** : Création réussie.
- **Résultat obtenu** : `✅ RESULTAT OBTENU: Création réussie (Normal)`
- **Verdict** : Fonctionnement nominal.

### Attaque 3 : Ajout étudiant (Injection P0-002 IDOR)
- **Payload** : `['child_3', 'alpha-student-1']`
- **Résultat attendu** : Échec. Firestore doit rejeter l'injection (Permission Denied).
- **Résultat obtenu** : `❌ RESULTAT OBTENU: INJECTION REUSSIE ! La base Staging n'est pas sécurisée.`
- **Logs Console** :
```text
=== Test 3: ajout étudiant ===
❌ RESULTAT OBTENU: INJECTION REUSSIE ! La base Staging n'est pas sécurisée.

Arrêt critique. L'attaque a fonctionné.
```

---

## 5. VERDICT FINAL

L'attaque 3 d'injection a été acceptée par la base de données distante Staging car le déploiement du correctif n'a pas pu aboutir techniquement. En respectant scrupuleusement la consigne ("Si une seule attaque réussit : Le rapport s'arrête immédiatement"), l'exécution a été stoppée à l'attaque 3.

P0-002 NON CERTIFIÉ
