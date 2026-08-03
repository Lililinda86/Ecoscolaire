# ECOSCOLAIRE — P0-003 — COMMIT 3B.3A — REPORT

## 1. Modèle de Données `student_import_jobs`
Le modèle a été défini dans `src/types/index.ts`.
Il comprend les états de progression (`PENDING`, `RUNNING`, etc.) et garantit que seul un job vierge (`processedCount = 0`) peut être initialisé par le client.

## 2. Firestore Rules
La sécurité Firestore a été implémentée dans `firestore.rules`.
- `match /student_import_jobs/{jobId}`
- **Create :** Limité aux membres pédagogiques de la bonne école (`schoolId`), à l'état `PENDING` avec tous les compteurs à 0 et un `storagePath` conforme (`^import_jobs_data/schoolId/.*`).
- **Read :** Autorisé pour l'école concernée et le superAdmin.
- **Update / Delete :** Strictement interdits (`allow update, delete: if false;`). Seul l'Admin SDK de la Cloud Function pourra mettre à jour le statut, évitant ainsi toute triche de compteurs côté frontend.

## 3. Storage Rules
La sécurité de Firebase Storage a été ajoutée dans `storage.rules`.
- `match /import_jobs_data/{schoolId}/{jobId}.json`
- **Create :** Limité aux utilisateurs pédagogiques de l'école (max 10MB, type JSON).
- **Read :** Limité à l'école ou au backend.
- **Update (Overwrite) :** Strictement interdit pour éviter qu'un utilisateur n'écrase le payload alors que le serveur est déjà en train de le traiter.

## 4. Tests et Build
Le script `scripts/test-p0-003-importjob-3b3a.mjs` a été créé pour inspecter de manière statique (Regex) la présence formelle des conditions de sécurité dans les fichiers `.rules`.
Tous les tests sont au vert. La compilation Vite / TypeScript a été passée avec succès.

## 5. Limites identifiées
- Les tests de règles actuels sont statiques car l'Emulator Suite n'était pas configuré dans ce contexte d'exécution. Les Regex couvrent le cas d'usage nominal de la syntaxe.
- Le backend n'étant pas encore implémenté, les jobs resteront bloqués sur l'état `PENDING`.

## 6. Fichiers Modifiés
- `src/types/index.ts`
- `firestore.rules`
- `storage.rules`
- `scripts/test-p0-003-importjob-3b3a.mjs`

## 7. SHA du Commit
`22e043d442a7954aaf0e30f0bd6ff9c6fe9823b0`

---

# VERDICT

**COMMIT CREATED — READY FOR REVIEW**
