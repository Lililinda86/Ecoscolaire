# ECOSCOLAIRE-INFRASTRUCTURE-BLOCKER-ROOT-CAUSE

## 1. Chronologie & Diagnostic

### A. Authentification Locale
**Commande** : `npx firebase-tools login:list`
**Sortie Console** :
```text
!  No authorized accounts, run "firebase login"
```
**Preuve** : Le poste de travail Windows local (`Linda LEMOFOUET`) n'a aucun compte Google actif associé au CLI Firebase.

### B. CI/CD & Déploiement Prévu
**Fichier analysé** : `.github/workflows/firebase-deploy.yml`
**Preuve** : 
```yaml
      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.SERVICE_ACCOUNT }}
```
L'infrastructure utilise le **Workload Identity Federation (WIF)** de Google Cloud. Il n'y a donc pas de `FIREBASE_TOKEN` ou de fichier `serviceAccountKey.json` statique sur le poste local. L'authentification est conçue pour n'être valide qu'au sein de l'environnement GitHub Actions.

### C. Vérification Java
La version installée est Java 8 (`java version "1.8.0_421"`). L'outil `firebase-tools` exige Java 21+ **uniquement pour l'exécution locale de la Firebase Emulator Suite**. Le processus de déploiement cloud (`firebase deploy`) est exécuté à 100% via Node.js et des requêtes HTTP vers l'API GCP. Java n'a aucun rôle dans le blocage du déploiement.

---

## 2. Validation Logique du Rapport Précédent

Le rapport précédent a été interrompu après le succès de l'Attaque 3 (Injection). 
**Question** : *Cette attaque démontre-t-elle (A) que le correctif local est incorrect ou (B) que le correctif n'a jamais été déployé ?*

**Réponse Explicite : B. Le correctif n'a jamais été déployé.**

**Preuves Irréfutables** :
1. Le CLI a renvoyé l'erreur fatale `Failed to authenticate` lors de la commande `deploy`. Le payload local `firestore.rules` (qui contient la rustine stricte `studentIds`) n'a donc physiquement pas pu transiter vers les serveurs de Google.
2. La règle sur Staging est, par conséquent, restée l'ancienne règle vulnérable. L'attaque 3 a frappé une cible inchangée. L'attaque a démontré que l'état *antérieur* était vulnérable, mais n'a en aucun cas évalué la fiabilité de la *nouvelle* règle locale.

---

## 3. Cause Racine Unique

**L'Absence d'Identifiants GCP Locaux (Unauthenticated CLI).**
Le poste de travail de l'auditeur ne dispose d'aucun mécanisme d'autorisation valide (ni compte utilisateur interactif, ni `GOOGLE_APPLICATION_CREDENTIALS`, ni WIF) pour envoyer l'ordre de mise à jour des règles Firestore vers le projet `ecoscolaire-staging`. Le déploiement s'est arrêté avant toute modification distante.

---

## 4. Actions Correctives Minimales (Infrastructure)

Pour permettre la certification finale, **UNE** des trois actions suivantes doit être entreprise par le propriétaire du poste :

1. **Option Utilisateur** : Exécuter `firebase login` dans le terminal interactif pour lier un compte Google possédant le rôle *Firebase Admin / Editor* sur le projet `ecoscolaire-staging`.
2. **Option Service Account** : Télécharger une clé JSON de compte de service GCP et définir temporairement `$env:GOOGLE_APPLICATION_CREDENTIALS="C:\chemin\vers\cle.json"`.
3. **Option CI/CD (Recommandée)** : Pousser (`git push`) la modification du fichier `firestore.rules` sur la branche principale pour déléguer le déploiement au Workflow GitHub Actions qui possède déjà les accès IAM (WIF).

---

## 5. VERDICT
**Cause racine confirmée** : Poste local non authentifié (Firebase CLI Unauthenticated).
**Correctif d'infrastructure recommandé** : Exécuter `firebase login` ou déclencher le pipeline CI/CD existant.
**Statut de la vulnérabilité** : P0-002 toujours **CERTIFIABLE** (en attente du déblocage de l'infrastructure pour l'évaluation réelle du correctif local).
