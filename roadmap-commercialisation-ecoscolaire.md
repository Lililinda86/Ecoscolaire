# 🗺️ Roadmap de Commercialisation - EcoScolaire

**Contexte :** Marché EdTech Camerounais & Africain Francophone.
Ce document réorganise stratégiquement les fonctionnalités de la plateforme EcoScolaire en fonction de la taille critique de la clientèle, en se basant sur les réalités du terrain (taux de pénétration d'internet, importance du Mobile Money, et habitudes administratives des écoles).

---

## 1. Priorité Absolue : Vendre à la 1ère École (Le "Product-Market Fit" Initial)
Pour convaincre un premier fondateur d'école d'adopter le logiciel et de l'utiliser en conditions réelles, le logiciel doit simplement **faire mieux et plus vite qu'Excel et Word**.

**Fonctionnalités Indispensables :**
- **Gestion des Élèves & Inscriptions :** Pouvoir enregistrer et retrouver facilement un élève (fini les registres papier qui se perdent).
- **Notes & Bulletins Automatisés :** Saisie rapide des notes et génération de bulletins PDF professionnels avec le logo de l'école et le calcul correct des moyennes (gain de temps immense pour les professeurs à la fin du trimestre).
- **Comptabilité Cash Basique :** Enregistrement des frais de scolarité payés en espèces au secrétariat avec émission d'un reçu imprimable.
- **Paramétrage de l'École (Branding) :** Ajout du logo, du nom du directeur et des mentions légales sur tous les documents.

*Recommandation :* Ne vous dispersez pas. Si la génération des bulletins prend plus de 2 clics ou s'il y a un bug de calcul de moyenne, la première école abandonnera. Le focus est 100% sur la **stabilité (Tests Runtime)** de ce cœur de métier.

---

## 2. Priorité Haute : Gérer 10 Écoles (La Phase d'Expansion & Rétention)
Une fois que 10 écoles utilisent le système, le volume de transactions et de requêtes parents explose. La plateforme doit automatiser le recouvrement financier et la communication.

**Fonctionnalités Indispensables :**
- **Intégration Mobile Money (MoMo/Orange) avec Webhooks Réels :** Le fondateur d'école doit pouvoir voir les paiements arriver automatiquement dans le système sans que le secrétaire n'ait à saisir manuellement chaque transaction.
- **Le Portail Parent (Sécurisé) :** Les parents doivent pouvoir consulter les notes de leurs enfants sur leur téléphone.
- **La Barrière Financière Automatique (Le "Killer Feature") :** Blocage automatique de l'affichage des bulletins sur le Portail Parent si la pension n'est pas réglée. C'est l'argument de vente numéro 1 au Cameroun.
- **Notifications WhatsApp (Twilio/Meta) :** Envoi automatisé des reçus de paiement et alertes d'absences directement sur le WhatsApp des parents, qui lisent rarement leurs e-mails.

*Recommandation :* À ce stade, la plateforme passe de "logiciel de gestion" à "logiciel de recouvrement". C'est ici que l'école constate un retour sur investissement direct (ROI) en récupérant l'argent des impayés.

---

## 3. Priorité Moyenne : Gérer 100 Écoles (L'Échelle Industrielle & Optimisation)
Avec 100 écoles, les contraintes techniques, le volume de données et les besoins de gestion interne des grands complexes scolaires deviennent les enjeux principaux.

**Fonctionnalités Indispensables :**
- **Migration Firebase Storage :** Supprimer l'encodage des logos en Base64 pour stocker les fichiers dans un Cloud Storage afin de réduire drastiquement la facture Firestore liée à la bande passante.
- **Gestion des Présences Avancée :** Suivi strict des retards et absences des élèves et du personnel.
- **Data Analytics & Dashboard Financier :** Des graphiques et reportings avancés pour les promoteurs possédant plusieurs écoles.
- **Validation Requests (Workflows) :** Lorsqu'une école grandit, le directeur ne fait plus tout lui-même. Le système d'approbation (ex: valider la suppression d'un paiement ou d'un élève) devient obligatoire pour éviter la fraude interne.

*Recommandation :* Optimisation drastique des coûts d'infrastructure (Firestore/Vercel) et sécurité contre les malversations financières du personnel administratif des écoles.

---

## 4. Priorité Faible : Différenciation Premium (Le Upsell)
Ces fonctionnalités ne sont pas vitales pour faire fonctionner une école camerounaise standard, mais elles positionnent EcoScolaire comme l'outil le plus moderne et prestigieux du continent. Elles permettent de vendre des abonnements "Premium".

**Fonctionnalités Différenciantes :**
- **Les Assistants IA (Director AI & Teacher AI) :** Génération de correspondances administratives, suggestions pédagogiques. (Gadget prestigieux pour les écoles privées haut de gamme).
- **Santé Scolaire (Allergies & Contacts) :** Rassure les parents des écoles maternelles/primaires très chères.
- **Gestion de la flotte de Bus :** Utile uniquement pour les grands complexes scolaires ayant leur propre flotte.
- **Inventaire :** Gestion du matériel de l'école.

*Recommandation :* Ces modules sont déjà codés (en Mocks ou partiellement). Ne dépensez plus un seul euro ni une seule heure de développement dessus tant que les priorités absolues (Bulletins) et hautes (Mobile Money) ne sont pas déployées et validées par des clients payants.
