# ITALO-17Q — Rapport de déploiement production

**Date :** 2026-07-11  
**Commit déployé :** `a39f463 feat(docs): school logo and contact info on all printed documents`  
**Branche :** staging  

---

## Statut Git

| Critère | Résultat |
|---|---|
| Branche | `staging` |
| HEAD local | `a39f463` |
| origin/staging | `a39f463` — synchronisés ✅ |
| Fichiers source modifiés | Aucun ✅ |
| test-results/.last-run.json non commité | ✅ |
| Secrets absents | ✅ |

## Build & Lint

| Critère | Résultat |
|---|---|
| **Lint** | ✅ PASS — exit code 0 |
| **Build local** | ✅ PASS — `built in 10.57s` |
| **Build Vercel** | ✅ PASS — `built in 17.08s` |

## Déploiement

| Critère | Résultat |
|---|---|
| **Commande** | `npx vercel --prod --yes` |
| **Deployment ID** | `dpl_G5PrgpHJDsoAiHMChhFLpajLPBmK` |
| **URL déploiement** | https://ecoscolaire-j0v88xwtg-linda-lemofouet-s-projects.vercel.app |
| **Alias production** | ✅ https://ecoscolaire.vercel.app |
| **readyState** | `READY` |
| **target** | `production` |
| **Région** | Washington, D.C., USA (East) – iad1 |

## Points validés automatiquement

- [x] Lint PASS
- [x] Build PASS (local + Vercel)
- [x] Déploiement Vercel READY
- [x] Alias production ecoscolaire.vercel.app actif
- [x] Aucun secret commité
- [x] Git synchronisé local = origin/staging
- [x] PWA Service Worker généré (19 entries, 2051.79 KiB)

## Checklist de validation manuelle production

Connectez-vous sur https://ecoscolaire.vercel.app avec un compte `owner` ou `director` et vérifiez :

### 1. Reçu PDF (`Paiements > Reçus`)
- [ ] Logo école visible sur le reçu PDF
- [ ] Nom école visible
- [ ] Adresse/téléphone/email si renseignés
- [ ] Montant visible et lisible
- [ ] Pas de chevauchement logo/texte

### 2. Aperçu paiement (`Paiements > créer un paiement`)
- [ ] En-tête SchoolDocumentHeader visible
- [ ] Logo ou fallback nom école

### 3. Liste élèves imprimable (`Élèves > Imprimer la liste`)
- [ ] En-tête avec logo ou fallback
- [ ] Nom école, année académique, code établissement
- [ ] Adresse/phone/email si renseignés

### 4. Bulletin individuel (`Notes > Bulletin Individuel > sélectionner élève`)
- [ ] En-tête avec logo ou fallback
- [ ] Infos école complètes

### 5. Palmarès classe (`Notes > Palmarès`)
- [ ] En-tête avec logo ou fallback

### 6. Classement global (`Notes > Classement Global`)
- [ ] En-tête avec logo ou fallback

### 7. Rapport présences (`Présences > Imprimer`)
- [ ] En-tête avec logo ou fallback

### 8. Liste staff (`Personnel > Imprimer la liste`)
- [ ] En-tête avec logo ou fallback

### 9. Fallback sans logo
- [ ] Supprimer le logo dans Paramètres
- [ ] Vérifier que le nom école apparaît dans le rond de fallback
- [ ] Vérifier que les documents restent propres

### 10. Erreurs console
- [ ] Aucun Patch Sync Error
- [ ] Aucune erreur critique console

## Prochain ticket recommandé

> **ITALO-18** — Nettoyage des fichiers non-trackés (scripts temporaires, rapports .md, captures .png, fichiers diagnostiques) accumulés dans le répertoire de travail.
