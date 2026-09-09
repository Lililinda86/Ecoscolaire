# Audit préalable global
Base produit : 9bac81340bf003551ac96802d60dbd93ca9665cf.
Les contrôles existants sont présents dans Settings.tsx et AcademicCalendarSettings.tsx. La validation précédente couvrait les finances et la navigation, pas la sauvegarde propriétaire ni le cycle complet des périodes depuis Paramètres. Aucun défaut produit établi avant le nouveau test.
Ajouter un runner dédié sans paiement : métadonnées complètes, gouvernance, cycles, politique transport, logo automatique, rechargement, bornes académiques, périodes CRUD/ouverture/fermeture, RBAC et UX-VALIDATION-FEE ciblé. Nettoyage limité à une école synthétique et ses utilisateurs. Aucun secret réel de paiement testé/modifié, aucune migration et aucune Production.
Les anciens scénarios financiers du run 34313285967 restent les preuves complémentaires pour la même version produit. Le nouveau runner ne remplace pas leur couverture exhaustive des catégories/versionnement/legacy.

Audit approfondi : action historique de nouvelle année destructive identifiée puis corrigée dans PR 240. Cible finale 99c2daacd8ead63c9337456ea72c81bfe4f822b5, incluant les modifications pédagogiques concurrentes. Rejouer le clic de calendrier avec une note legacy synthétique inchangée, les 19 types et le parcours global sans paiement.
