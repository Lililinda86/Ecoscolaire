# ECOSCOLAIRE-SECURITY-STATE-AFTER-ROUTE-GUARDS

Ce document présente l'état de la sécurité des autorisations d'accès dans EcoScolaire suite à la sécurisation globale des routes React.

## 1. Routes sécurisées et validées

Les routes suivantes disposent d'un contrôle strict (`allowedRoles`) au niveau de `App.tsx` ainsi que de gardes défensives injectées au niveau des composants pour empêcher tout contournement par l'Optimistic UI. Elles ont été validées formellement par exécution Playwright :

* `/settings`
* `/students`
* `/grades`
* `/attendance`
* `/classes`
* `/buses`
* `/communication`
* `/school-dashboard`
* `/ai-director`
* `/ai-teacher`
* `/payments`
* `/staff`
* `/inventory`

## 2. Routes non encore testées ou partiellement testées

Bien que définies et potentiellement restreintes dans `App.tsx`, les routes suivantes n'ont pas encore fait l'objet d'un audit de sécurité automatisé (preuve par l'exécution) de leurs interfaces :

* `/parent`
* `/superadmin`
* `/superadmin/users`
* `/dashboard`
* `/users`
* `/validations`
* `/audit`

## 3. Rôles non encore testés

En raison de limitations d'authentification sur les environnements de test au moment des audits automatisés, les interfaces relatives à ces rôles n'ont pas été formellement prouvées :

* `superAdmin`
* `driver`
* `student`

## 4. Commits récents liés à la sécurité

Les efforts récents ont permis de sceller les failles critiques d'exposition des données et du CRUD de manière itérative :

* `ECOSCOLAIRE-FIX-PAYMENTS-ROLE-GUARD` : Résolution de la vulnérabilité d'optimistic UI sur `/payments`.
* `ECOSCOLAIRE-FIX-STAFF-ROLE-GUARD` : Application des restrictions sur `/staff`.
* `ECOSCOLAIRE-FIX-INVENTORY-ROLE-GUARD` : Protection du module logistique et des mouvements de stocks sur `/inventory`.
* `ECOSCOLAIRE-FIX-GLOBAL-ROUTE-AUTHORIZATION` : Protection systématique des 18+ routes de l'application via `App.tsx` et injection des gardes défensives de conformité des rôles.

## 5. Risques restants

La protection du client React étant acquise, la posture de sécurité globale de l'application n'est toutefois pas entièrement garantie. Les vecteurs de risques restants sont :

* **Firestore Rules non encore auditées globalement** : Le backend rejette-t-il réellement les écritures (CRUD) forgées si la validation Frontend est contournée ?
* **Isolation multi-tenant globale non encore auditée** : L'étanchéité des données entre l'école Alpha et l'école Beta (ou toute autre école) est-elle infaillible au niveau de la base de données ?
* **Cloud Functions non encore auditées** : Les points d'entrée serverless sont-ils correctement protégés et authentifiés ?
* **Rôles driver/student non prouvés** : Le confinement visuel et d'accès pour ces rôles mineurs reste partiellement non-vérifié en automatisation.
* **superAdmin non testable** : Les privilèges globaux du `superAdmin` nécessitent un audit manuel ou spécifique.

## 6. Prochaine étape recommandée

L'interface client étant sécurisée, il est impératif de vérifier que les données elles-mêmes sont protégées à la source contre les requêtes API malveillantes ou le spoofing (usurpation d'identité/de locataire).

**Étape recommandée** : Mener l'audit de sécurité des **Règles Firestore** (Firestore Rules) et valider formellement l'**Isolation Multi-Tenant** (Alpha vs Beta) pour s'assurer de l'étanchéité absolue de l'architecture.
