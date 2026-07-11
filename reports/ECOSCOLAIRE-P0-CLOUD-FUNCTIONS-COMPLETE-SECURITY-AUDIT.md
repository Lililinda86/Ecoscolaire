# ECOSCOLAIRE-P0-CLOUD-FUNCTIONS-COMPLETE-SECURITY-AUDIT

## 1. Résumé Exécutif
L'audit forensic du backend Cloud Functions a été réalisé sans modification de code, en analysant la surface d'attaque, les mécanismes d'authentification, les transactions Firestore et les limites architecturales. La faille `mockConfirmPayment` étant traitée, aucune autre porte dérobée critique (P0) n'a été découverte. 
Cependant, des vulnérabilités significatives subsistent concernant la validation des entrées financières et l'application asynchrone des règles métier (P2/P3). Le webhook Campay est remarquablement bien protégé contre l'usurpation grâce à la validation Server-to-Server, mais reste exposé aux attaques par déni de service.

## 2. Score de sécurité global
**Score : 82 / 100**
*(Points forts : Validation Server-to-Server Campay stricte, idempotence parfaite sur les webhooks et factures via transactions Firestore. Points faibles : Manque de validation sur l'origine et le montant des paiements côté Callable, contrôles SaaS réactifs).*

## 3. Tableau de toutes les fonctions
| Fonction | Type | Trigger | Runtime | Surface d'exposition |
|---|---|---|---|---|
| `initiatePayment` | Callable | HTTP | Node.js 20 | Authenticated Firebase (Public) |
| `campayWebhook` | HTTP | Webhook | Node.js 20 | Public / Internet |
| `onPaymentCreated` | Trigger | Firestore | Node.js 20 | Interne (Firebase System) |
| `enforceStudentSaasLimits`| Trigger | Firestore | Node.js 20 | Interne (Firebase System) |
| `createSaaSCheckout` | Callable | HTTP | Node.js 20 | Authenticated Firebase |
| `verifySaaSPayment` | Callable | HTTP | Node.js 20 | Authenticated Firebase |
| `dailySubscriptionCheck` | Cron | PubSub | Node.js 20 | Interne (Scheduler) |

---

## 4. Tableau des vulnérabilités & 5. Classement P0 → P3

### [P2] Validation Inexistante du Montant (Arbitrary Payment Amount)
- **Fichier** : `functions/src/index.ts`
- **Fonction** : `initiatePayment`
- **Ligne** : 236 (`if (typeof amount !== 'number' || amount <= 0)`)
- **Cause Racine** : Le client fournit un paramètre `amount` arbitraire qui est directement envoyé au fournisseur (Campay) sans être croisé avec une facture ou une dette enregistrée en base (ex: `school/tuitionFees`).
- **Scénario** : Un parent malveillant ou altérant sa requête réseau appelle `initiatePayment` avec `amount: 1`. La transaction est enregistrée et Campay valide le paiement de 1 FCFA. Le backend traitera ce paiement comme valide pour la scolarité.
- **Impact** : Fraude financière. Pertes économiques pour l'école.
- **Probabilité** : Moyenne (nécessite l'interception de la requête).
- **Sévérité CVSS** : ~6.5

### [P2] Application Asynchrone des Limites SaaS (Race Condition / TOCTOU)
- **Fichier** : `functions/src/index.ts`
- **Fonction** : `enforceStudentSaasLimits`
- **Ligne** : 618 (`transaction.delete(change.after.ref)`)
- **Cause Racine** : La vérification des limites de plan d'abonnement est appliquée en réaction (`onWrite`) au lieu d'être appliquée proactivement (via les Firestore Rules).
- **Scénario** : Un utilisateur malveillant utilise un script effectuant un `batch.set()` pour insérer 5 000 étudiants simultanément. Les documents sont insérés avec succès. La fonction est déclenchée 5 000 fois en parallèle. Bien que le compteur finisse par intercepter le dépassement et supprime les documents "a posteriori", pendant un court instant les données ont dépassé la limite de la base, causant un pic de facturation d'écriture/suppression.
- **Impact** : Dépassement temporaire des quotas et facturation inutile.
- **Probabilité** : Faible à Moyenne.
- **Sévérité CVSS** : ~5.3

### [P3] Usurpation d'ID d'étudiant pour les paiements
- **Fichier** : `functions/src/index.ts`
- **Fonction** : `initiatePayment`
- **Ligne** : 267
- **Cause Racine** : La fonction vérifie que l'étudiant appartient à la même école (`schoolId`), mais ne vérifie pas qu'il appartient au parent appelant.
- **Scénario** : Un parent initie un paiement pour l'ID d'un autre élève de la même école.
- **Impact** : Paiement attribué à un autre compte (moins grave, car le paiement est réel, mais erreur d'imputation).
- **Probabilité** : Faible.
- **Sévérité CVSS** : ~3.5

### [P3] Injection de Logs & DoS Non-Authentifié
- **Fichier** : `functions/src/index.ts`
- **Fonction** : `campayWebhook`
- **Ligne** : 30 (`db.collection('campay_logs').add(...)`)
- **Cause Racine** : Toute requête POST envoyée à l'URL du Webhook déclenche une écriture `webhook_received_raw` dans Firestore avant la moindre validation du payload.
- **Scénario** : Un attaquant effectue un flood (requêtes massives) vers l'URL `/campayWebhook`.
- **Impact** : Explosion du coût Firestore (Writes), pollution des journaux.
- **Probabilité** : Haute (URL publique et non signée), Impact Faible.
- **Sévérité CVSS** : ~4.3

### [P3] Fuite de PII dans les Logs
- **Fichier** : `functions/src/index.ts`
- **Fonction** : `initiatePayment` et `campayWebhook`
- **Ligne** : 323 / 94
- **Cause Racine** : Le numéro de téléphone de l'appelant (`phoneNumber`) et la réponse brute de l'API Campay sont écrits en clair dans Firestore `campay_logs`.
- **Scénario** : Un administrateur système ou un développeur accède à la collection de logs et y trouve l'historique des PII des utilisateurs sans hachage ni masque.
- **Impact** : Non-conformité aux standards de protection des données (RGPD).
- **Probabilité** : Systématique.
- **Sévérité CVSS** : ~3.0

---

## 6. Dette Technique
- Les fonctions `createSaaSCheckout`, `verifySaaSPayment` et `dailySubscriptionCheck` (Cron) sont actuellement définies mais retournent `"Not implemented yet"` ou `null`. Elles consomment de l'espace de déclaration sans logique métier.

## 7. Risques résiduels
- **Aucune signature Webhook** : Bien que la logique "Server-to-Server" (Vérification du statut via API externe au lieu de se fier au payload) protège intégralement contre l'injection de fausses transactions, le fait que le Webhook n'exige pas de Signature HMAC empêche le rejet précoce des attaques DoS au niveau HTTP.

## 8. Fonctions pouvant encore contourner Firestore Rules
- Toutes les Cloud Functions utilisent l'Admin SDK (`admin.firestore()`) et contournent donc les règles de sécurité Firestore par conception.
- **Analyse du risque** : C'est le comportement attendu. Le code contient ses propres défenses (isolation multi-tenant via `user.schoolId === payload.schoolId` strictement respectée dans `initiatePayment`).

## 9. Fonctions pouvant provoquer une élévation de privilèges
- **Aucune fonction restante ne permet une élévation de privilèges**. Les rôles et les isolations de locataires sont correctement récupérés depuis la source de vérité (la base de données) via le `context.auth.uid`.

## 10. Fonctions prêtes pour certification
- `onPaymentCreated` : La gestion idempotente via transaction atomique et la génération séquentielle des reçus avec un compteur sécurisé est parfaitement implémentée.
- `campayWebhook` : Exception faite du spam des logs, le mécanisme de transaction et la vérification Serveur-à-Serveur de l'état rendent le paiement à toute épreuve contre la manipulation (Spoofing).

## 11. Fonctions non certifiables
- `initiatePayment` : Ne valide pas le montant par rapport à un état enregistré côté serveur.
- `enforceStudentSaasLimits` : Architecture basée sur le modèle réactif (onWrite Trigger) plutôt que défensif strict (Rules).

## 12. Recommandation de priorité des corrections
1. **[Priorité 1] Fixer la faille P2 du montant dans `initiatePayment`** en liant obligatoirement le paiement à une facture/échéance (`invoiceId`) ou à une validation stricte du serveur.
2. **[Priorité 2] Restreindre le DoS du `campayWebhook`** en validant un en-tête avant toute écriture Firestore.
3. **[Priorité 3] Restreindre les logs** de `campay_logs` pour obfusquer le `phoneNumber` et les données PII.
4. **[Priorité 4] Améliorer `enforceStudentSaasLimits`** pour passer la logique des limites directement dans les `firestore.rules`.
