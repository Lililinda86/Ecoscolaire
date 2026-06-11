# 🚀 Plan d'Exécution Opérationnelle - EcoScolaire

**Auteur :** COO-ECOSCOLAIRE
**Date :** Juin 2026
**Objectif :** Atteindre 100 écoles clientes payantes en 12 mois.

---

## 1. Situation actuelle

* **Ce qui existe :** Un produit front-end robuste (SaaS multi-tenant, gestion des rôles, notes, portail parent), validé statiquement, compilant parfaitement sur Vercel avec Firebase.
* **Ce qui manque :** Le pont financier (Backend Webhooks MoMo), la facturation automatisée (Paywall SaaS), un historique de tests en conditions réelles (Runtime), et une force de vente.
* **Ce qui bloque la vente :** L'absence de preuve sociale (zéro école pilote) et l'impossibilité technique d'automatiser le recouvrement financier via Mobile Money en direct.

**Notes d'Exécution :**
* Produit : 75/100
* Technique : 80/100
* Business : 10/100
* Exécution : 20/100

---

## 2. Objectif principal

| Échéance | Écoles Clientes | Revenus (ARR) | Utilisateurs (Admins) | Élèves Gérés |
|---|---|---|---|---|
| **90 Jours** | 3 (Pilotes) | 0 FCFA (Test) | ~15 | ~1 000 |
| **6 Mois** | 10 (Payantes) | 3 000 000 FCFA | ~50 | ~3 500 |
| **12 Mois** | 100 (Payantes) | 30 000 000 FCFA| ~500 | ~35 000 |

---

## 3. Plan d'action 7 jours (Immédiat)

1. **Création Compte Campay/Flutterwave :** (Resp: CEO) - 1j - Facile. *Résultat :* Clés API de test générées.
2. **Identification de 3 Écoles Pilotes :** (Resp: COO) - 3j - Moyenne. *Résultat :* Accords de principe signés avec 3 fondateurs.
3. **Préparation des données de test :** (Resp: Tech) - 2j - Facile. *Résultat :* Importation de listes d'élèves Excel pour les démos.
4. **Validation de l'impression PDF en masse :** (Resp: Tech) - 2j - Moyenne. *Résultat :* Impression garantie de 500 bulletins sans crash navigateur.

---

## 4. Plan d'action 30 jours (Déploiement Pilote)

1. **Déploiement Webhook MoMo (Backend) :** (Resp: Tech) - 10j - Élevée. *Résultat :* Les paiements mettent à jour la base Firestore.
2. **Formation des Secrétaires (Pilotes) :** (Resp: COO) - 5j - Moyenne. *Résultat :* 3 secrétaires maîtrisent la saisie des notes.
3. **Migration Firebase Storage (Logos) :** (Resp: Tech) - 3j - Faible. *Résultat :* Baisse des coûts Firestore garantie.
4. **Génération d'un "Success Case" :** (Resp: COO) - 10j - Difficile. *Résultat :* Première école générant officiellement ses bulletins via EcoScolaire.

---

## 5. Plan d'action 90 jours (Go-to-Market)

1. **Recrutement d'un Commercial Terrain :** (Resp: CEO) - 15j - Moyenne. *Résultat :* 1 Sales recruté et formé au pitch "Recouvrement".
2. **Implémentation du Paywall SaaS :** (Resp: Tech) - 10j - Moyenne. *Résultat :* Suspension automatique des écoles qui n'ont pas payé leur abonnement SaaS.
3. **Conversion des 3 Pilotes en Payants :** (Resp: Sales) - 15j - Difficile. *Résultat :* Premier MRR généré.
4. **Signature de 7 Nouvelles Écoles :** (Resp: Sales) - 30j - Très Difficile. *Résultat :* Atteinte du jalon des 10 écoles (3M FCFA ARR).

---

## 6. Backlog Produit (Fonctionnalités École)

* **BACKLOG P0 (Bloquant commercial) :** Impression des bulletins en masse, Blocage du Portail Parent pour impayés.
* **BACKLOG P1 (Très important) :** Saisie ultra-rapide des notes type Excel, Registres de présence.
* **BACKLOG P2 (Important) :** Suivi des absences du personnel.
* **BACKLOG P3 (Confort) :** Inventaire, Gestion des Bus scolaires, Fiches de Santé (Allergies).

---

## 7. Backlog SaaS (Infrastucture de Facturation)

**Priorité d'implémentation :**
1. **Paywall & Suspend (P0) :** Sans cela, l'école utilise le logiciel gratuitement indéfiniment.
2. **Subscriptions & Plans (P1) :** Gérer les limites (200 élèves vs 1000 élèves).
3. **SaaS Payments (P1) :** Recevoir notre propre argent.
4. **Dashboard Super Admin (P2) :** Visualiser la croissance.
5. **Invoices (P3) :** Facturation PDF générée automatiquement.

---

## 8. Backlog Mobile Money

1. **Campay (Cameroun) :** P0. L'agrégateur le plus simple pour intégrer simultanément MTN MoMo et Orange Money au Cameroun.
2. **Flutterwave :** P1. Pour préparer l'expansion internationale (Sénégal, Côte d'Ivoire).
3. **Intégrations directes MTN/Orange :** P3. (Trop lourd administrativement pour une startup early-stage).

*Architecture :* Paiement initié sur le Front -> Requête backend Campay -> Validation USSD Parent -> Webhook reçu par Cloud Function -> Mise à jour Firestore (`isTranchePaid: true`).

---

## 9. Backlog WhatsApp

**Recommandation : Evolution API.**
*Justification :* Les API officielles (Meta/Twilio) imposent des "Templates" stricts soumis à validation et facturent ~0.03$ (20 FCFA) par conversation. Pour une école de 1000 élèves, envoyer 3 relances par mois ruinerait notre marge SaaS. Evolution API se connecte au numéro de l'école (WhatsApp Web Protocol), rendant l'envoi illimité et gratuit pour nous.

---

## 10. Backlog IA

* **IA Directeur (P2) :** *Valeur :* Prestige. *Coût :* Modéré. *ROI :* Aide à vendre le plan Premium (600k FCFA).
* **IA Enseignant (P3) :** *Valeur :* Aide à la notation. *Coût :* Élevé (beaucoup de requêtes). *ROI :* Faible (Les professeurs ne décident pas de l'achat).
* **IA Parent/Comptable :** *Priorité :* Nulle. *ROI :* Négatif.

---

## 11. Recrutement

**Qui recruter en premier ? Un Commercial Terrain (Sales/Customer Success).**
*Justification :* Le produit Frontend est terminé (75/100). Nous n'avons pas de problème de code, nous avons un problème de revenus (10/100). Ce commercial doit être un ancien directeur d'école ou un habitué de la vente B2B locale, capable de faire du porte-à-porte, d'installer l'outil, et de former les secrétaires.

---

## 12. Écoles pilotes

* **Profil idéal :** Collège/Lycée privé laïc.
* **Taille idéale :** 300 à 500 élèves (Suffisamment grand pour avoir un problème de recouvrement, assez petit pour pardonner des bugs initiaux).
* **Localisation idéale :** Même ville que l'équipe fondatrice (Yaoundé ou Douala) pour un support physique immédiat.
* **Critères de sélection :** Le fondateur doit être technophile et souffrir publiquement du non-paiement des pensions.

---

## 13. Risques critiques

1. **Technique (Panne Webhook) :** *Probabilité:* Moyenne. *Impact:* Énorme (Pensions non comptabilisées). *Plan:* Bouton "Vérifier le statut manuellement" appelant l'API de paiement directement.
2. **Financier (Cash burn) :** *Probabilité:* Haute. *Impact:* Faillite. *Plan:* Facturer les écoles annuellement et "Upfront" (D'avance).
3. **Commercial (Rejet des secrétaires) :** *Probabilité:* Haute. *Impact:* Churn. *Plan:* Interface de saisie des notes imitant parfaitement Excel (navigation au clavier).
4. **Juridique (RGPD local) :** *Probabilité:* Faible. *Impact:* Moyen. *Plan:* CGV claires indiquant qu'EcoScolaire n'est qu'un sous-traitant des données.

---

## 14. KPI de pilotage

* **30 Jours :** Nombre d'élèves importés dans la base (Cible: 1000).
* **90 Jours :** Taux d'activation (Cible: 3 pilotes génèrent leurs bulletins à 100% sur l'app).
* **12 Mois :** ARR (Cible: 30 000 000 FCFA), CAC (Cible: < 50 000 FCFA par école).

---

## 15. CEO Dashboard (Le "Morning Brief")

Chaque matin, le CEO ne doit regarder que ces 4 chiffres :
1. **MRR (Revenu Récurrent Mensuel) engagé.**
2. **Cash collecté la veille (via Mobile Money) par nos clients.**
3. **Nombre d'écoles actives (Connexion dans les dernières 24h).**
4. **Nombre d'écoles en période d'essai expirant dans 7 jours.**

---

## 16. Priorisation finale (Top 20 des 90 prochains jours)

| Rang | Action | Impact Revenu | Impact Client | Difficulté | ROI |
|---|---|---|---|---|---|
| 1 | Intégrer Webhooks Mobile Money (Backend Campay) | Énorme | Énorme | Élevée | 💎💎💎 |
| 2 | Importer les données de 3 écoles pilotes (Excel) | Nul | Énorme | Faible | 💎💎💎 |
| 3 | Assister physiquement les pilotes pour générer les bulletins | Nul | Énorme | Moyenne | 💎💎💎 |
| 4 | Implémenter le Paywall SaaS (Coupure automatique) | Énorme | Nul | Moyenne | 💎💎💎 |
| 5 | Embaucher 1 Commercial B2B local | Énorme | Nul | Élevée | 💎💎 |
| 6 | Intégrer WhatsApp via Evolution API (Relances impayés) | Fort | Fort | Élevée | 💎💎 |
| 7 | Migrer les Logos (Base64) vers Firebase Storage | Nul | Faible | Faible | 💎💎 |
| 8 | Créer le pitch deck commercial "Recouvrement" | Fort | Fort | Faible | 💎💎 |
| 9 | Lancer la campagne de vente (Cible: 10 écoles à 300k FCFA) | Énorme | Nul | Élevée | 💎💎 |
| 10 | Optimiser la navigation clavier (type Excel) pour les notes | Nul | Fort | Moyenne | 💎💎 |
| 11 | Signer un contrat formel avec les écoles pilotes | Faible | Nul | Faible | 💎 |
| 12 | Créer la collection `subscriptions` dans Firestore | Fort | Nul | Faible | 💎 |
| 13 | Définir les rôles SaaS limitant à X élèves (Standard vs Premium) | Fort | Faible | Moyenne | 💎 |
| 14 | Mettre en place les sauvegardes quotidiennes (Backups DB) | Nul | Nul | Moyenne | 💎 |
| 15 | Créer une Cloud Function d'envoi d'emails SaaS (Factures) | Moyen | Moyen | Moyenne | 💎 |
| 16 | Créer une vidéo tutoriel pour la saisie des notes | Nul | Fort | Faible | 💎 |
| 17 | Organiser un webinaire syndical pour fondateurs d'écoles | Fort | Faible | Moyenne | 💎 |
| 18 | Afficher le MRR et le statut SaaS sur le Dashboard SuperAdmin | Faible | Nul | Faible | 💎 |
| 19 | Rédiger les CGV et conditions d'utilisation | Nul | Faible | Faible | 💎 |
| 20 | Préparer le déploiement "IA Directeur" (pour démo prestige) | Faible | Fort | Élevée | 💎 |
