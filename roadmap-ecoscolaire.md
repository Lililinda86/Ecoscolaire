# 🗺️ Roadmap Produit & Commerciale - EcoScolaire

**Date :** Juin 2026
**Auteur :** PRODUCT-MANAGER-ECOSCOLAIRE
**Cible :** Marché EdTech (Cameroun & Afrique Francophone)

---

## 1. État actuel du produit

### Forces
- **Architecture SaaS Multi-tenant robuste :** L'isolation par `schoolId` et la gestion granulaire des rôles (Directeur, Professeur, Parent, etc.) sont structurellement validées par les règles Firestore (*Vérifié*).
- **Stack Moderne & Performante :** React, Vite et TypeScript garantissent une application rapide. Le build compile sans aucune erreur (zéro TS6133), assurant des déploiements fluides sur Vercel (*Vérifié*).
- **Couverture fonctionnelle large :** Gestion des élèves, notes, présences, personnel, transport, paiements et portail parent. La majorité du "Core System" scolaire est codée (*Implémenté mais non testé en runtime*).

### Faiblesses
- **Absence de tests End-to-End (E2E) :** Aucune fonctionnalité dynamique n'a été testée en conditions réelles (Runtime). 
- **Dette technique mineure :** Stockage des logos en Base64 dans Firestore (impacte les coûts de lecture) au lieu de Firebase Storage.
- **Simulations d'API :** Les modules à haute valeur ajoutée (Paiements Mobile Money, IA, WhatsApp) reposent actuellement sur des "Mocks" ou des interfaces purement frontend (*Non implémenté côté Backend*).

### Niveau de maturité
**Phase : Bêta Privée (Pre-MVP).** Le produit est visuellement complet et l'architecture de base de données est sécurisée. Cependant, l'absence de tests runtime et d'intégration réelle des API critiques empêche une commercialisation immédiate.

---

## 2. MVP commercial actuel

### Ce qui est déjà vendable (Core Edition)
*État : Implémenté mais non testé en runtime*
- Gestion dématérialisée des élèves et des classes.
- Saisie centralisée des notes et génération automatique de bulletins PDF paramétrés au logo de l'école.
- Suivi basique de la comptabilité interne (caisse/espèces).

### Ce qui manque avant les premiers clients payants
- **Intégration d'une passerelle de paiement réelle (Flutterwave / Campay)** pour le Mobile Money (MTN/Orange). C'est le nerf de la guerre pour la monétisation.
- **Tests de Charge et Tests E2E** sur la création d'élèves et la génération de bulletins en masse.
- **Hébergement des médias (Storage) :** Migration de l'upload Base64 vers Firebase Storage pour éviter d'exploser le quota Firestore.

---

## 3. Priorités critiques (0 à 30 jours)

1. **Validation Runtime & Tests E2E (Cypress/Playwright)**
   - *Impact client :* Élevé (Évite les bugs bloquants devant les premiers directeurs d'école).
   - *Complexité technique :* Moyenne.
   - *Priorité :* Critique.
   - *Recommandation :* Simuler le flux complet : Inscription Élève ➡️ Paiement T1 ➡️ Saisie Note ➡️ Génération Bulletin.

2. **Intégration Flutterwave (Mobile Money Réel)**
   - *Impact client :* Majeur (Résout le problème de recouvrement des écoles).
   - *Complexité technique :* Élevée (Gestion des Webhooks et statuts asynchrones).
   - *Priorité :* Critique.
   - *Recommandation :* Implémenter le backend pour écouter les webhooks de paiement MTN MoMo/Orange Money. (*Non implémenté*)

3. **Migration Base64 vers Firebase Storage (Upload Logo)**
   - *Impact client :* Faible (Invisible pour l'utilisateur).
   - *Complexité technique :* Faible.
   - *Priorité :* Critique.
   - *Recommandation :* Modifier la logique d'upload dans `SuperAdmin.tsx`. (*Implémenté mais non testé*)

---

## 4. Priorités importantes (30 à 90 jours)

1. **Intégration WhatsApp Business API (Twilio / Meta)**
   - *Impact client :* Très Élevé (Communication instantanée avec les parents pour l'absentéisme et les impayés).
   - *Complexité technique :* Moyenne à Élevée.
   - *Priorité :* Importante.
   - *Recommandation :* Remplacer les liens statiques `wa.me` par des envois automatisés depuis le backend. (*Non implémenté*)

2. **Lancement du Portail Parents Sécurisé**
   - *Impact client :* Élevé (Fidélisation et transparence).
   - *Complexité technique :* Moyenne.
   - *Priorité :* Importante.
   - *Recommandation :* Vérifier en runtime le système de blocage des bulletins pour impayés. Lancer un pilote sur une école. (*Implémenté mais non testé*)

---

## 5. Priorités stratégiques (3 à 6 mois)

1. **Déploiement des Assistants IA (Directeur & Enseignant)**
   - *Impact client :* Élevé (Innovation majeure, argument de vente différenciant).
   - *Complexité technique :* Élevée (Prompt engineering, gestion du contexte RAG).
   - *Priorité :* Stratégique.
   - *Recommandation :* Remplacer les "Mocks" actuels par une intégration OpenAI API / Gemini. (*Non implémenté*)

2. **Tableaux de Bord Avancés & Data Analytics**
   - *Impact client :* Élevé pour les fondateurs d'écoles (Pilotage financier).
   - *Complexité technique :* Moyenne.
   - *Priorité :* Stratégique.
   - *Recommandation :* Agréger les données financières annuelles avec des graphiques. (*Non implémenté*)

---

## 6. Fonctionnalités indispensables

| Fonctionnalité | Classement | État Actuel |
|---|---|---|
| **Gestion des Notes & Bulletins** | **Critique** | Implémenté mais non testé |
| **Comptabilité (Espèces & MoMo)** | **Critique** | Implémenté mais non testé |
| **Gestion des Inscriptions** | **Critique** | Implémenté mais non testé |
| **Registres de Présence** | **Important** | Implémenté mais non testé |
| **Portail Parent** | **Important** | Implémenté mais non testé |
| **Gestion du Bus Scolaire** | À reporter | Implémenté mais non testé |
| **Gestion de l'Inventaire** | À reporter | Implémenté mais non testé |
| **Santé Scolaire (Allergies)** | À reporter | Implémenté mais non testé |

---

## 7. Fonctionnalités différenciantes (Le "SaaS Edge")

- **Mobile Money Intégré :** C'est le cœur du réacteur pour l'Afrique francophone. Le recouvrement des frais de scolarité est la plus grande douleur des fondateurs. Un système qui bloque l'accès aux bulletins tant que la tranche n'est pas réglée par MoMo est un "killer feature".
- **WhatsApp Automatisé :** Les parents camerounais lisent rarement les emails. L'envoi automatique des reçus de paiement et des alertes d'absence par WhatsApp justifie à lui seul l'abonnement SaaS.
- **Portail Parent Punitif/Informatif :** La fonction `renderBlockadeAlert()` qui masque les notes pour impayés est excellente. Elle crée un effet de levier pour forcer les parents à régulariser leur situation.
- **Assistants IA :** Le "AI Director" pour rédiger des discours ou des notes administratives apporte une touche ultra-premium qui justifie un plan d'abonnement plus cher ("Premium").

---

## 8. Risques techniques

- **Quota Firestore :** Si de nombreuses écoles rejoignent la plateforme, la facturation des lectures Firestore peut exploser (surtout avec les logos en Base64 et des requêtes non paginées sur de gros historiques de présences).
- **Fiabilité Webhook MoMo :** En Afrique, les API télécoms (MTN/Orange) subissent parfois des temps de latence ou des échecs silencieux. Il faut un système de "Retry" robuste pour ne jamais perdre la trace d'un paiement de pension.
- **Absence d'environnement de Staging :** Développer et tester directement sur la base de production (même avec un SuperAdmin) mènera inévitablement à des fuites de données ou des crashs.

---

## 9. Risques business

- **Adoption par le personnel administratif :** Les secrétaires dans les écoles camerounaises sont souvent habituées à Excel ou au papier. Si l'UI (saisie des notes) n'est pas *aussi rapide* qu'Excel, le logiciel sera rejeté.
- **Pricing inadapté :** Les écoles ont des budgets limités. Un abonnement mensuel fixe peut effrayer. 
- **Connectivité internet :** Le produit est Cloud-first (Vercel/Firestore). En cas de coupure internet locale, l'école est paralysée.

---

## 10. Plan de commercialisation (Focus Cameroun)

- **Prix :** 
  - *Modèle Freemium/Starter :* Gratuit pour la gestion des élèves, facturation de 500 FCFA par transaction Mobile Money (Commission).
  - *Modèle Standard :* Abonnement annuel (ex: 150 000 FCFA / an) pour le portail parent et SMS/WhatsApp.
  - *Modèle Premium :* 300 000 FCFA / an pour inclure les outils IA et l'analyse avancée.
- **Cibles :** Les complexes scolaires privés (Maternelle + Primaire + Secondaire) situés dans les zones urbaines (Yaoundé, Douala, Bafoussam) avec au moins 300 élèves.
- **Acquisition clients :** Vente directe B2B. Rencontres avec les fondateurs lors des séminaires éducatifs. Démonstration axée sur *la réduction des impayés* via le blocage des bulletins.
- **Déploiement Pilote :** Sélectionner 2 ou 3 écoles partenaires pour la rentrée de septembre. Installer l'application gratuitement en échange de feedbacks intensifs (Tests Runtime).

---

## 11. Recommandation finale

**EcoScolaire possède une fondation technique de classe mondiale pour une EdTech africaine.** L'architecture SaaS, l'interface moderne et le choix des technologies (React, Firebase) sont parfaits. 

Cependant, le produit est aujourd'hui une "très belle coquille" qui demande à être connectée au monde réel. 

**Ma recommandation en tant que Product Manager :** 
1. Ne codez plus de nouvelles fonctionnalités d'interface (Inventaire, Bus, Santé). 
2. Concentrez 100% des ressources de développement des 30 prochains jours sur l'**intégration stricte de l'API Mobile Money** et la **mise en place d'un environnement de test Runtime E2E**.
3. Lancez le produit pilote avec la fonctionnalité phare : **Paiement MoMo + Déblocage automatique du Bulletin sur le Portail Parent.** C'est ce flux précis qui convaincra les investisseurs et les premiers clients payants.
