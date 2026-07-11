# ECOSCOLAIRE — P0-003 — COMMIT 3B.3B-PHASE2C — REPORT

**Rôle :** Principal Firestore Engineer, SaaS Billing Integrity Engineer
**Date :** 28 Juin 2026
**Commit SHA :** `b41d2afc77626aa8f5647d0b77e7a5edbc162340`

---

## 1. Scope d'Intervention
Conformément aux directives, la logique a été isolée sans polluer le scope global :
- `functions/src/importStudents.ts` (Appel à la fonction)
- `functions/src/studentImportQuota.ts` (Nouveau helper transactionnel exclusif)
- `tests/functions/test-student-import-quota.cjs` (Nouveaux tests)

## 2. Algorithme Transactionnel (Write Skew Protection)
La fonction `reserveStudentImportQuota` repose sur un unique `db.runTransaction()`.
1. **Idempotence du Job** : La transaction lit le statut du Job. S'il n'est pas `VALIDATING_COMPLETE`, elle s'arrête (`no-op` ou lève une exception). Cela empêche le double trigger de modifier le quota deux fois.
2. **Lecture des droits SaaS** : Le document `school` est lu sous verrou. On vérifie `subscriptionStatus !== 'active'|'trialing'` et la présence du `studentLimit`.
3. **Validation de capacité** : L'addition `currentCount + newStudentsCount` est validée par rapport au `limit`.
4. **Mutations couplées** : Si la capacité est validée, la transaction procède à deux mutations garanties atomiques :
   - Mise à jour du `school.studentCount` en y ajoutant `newStudentsCount`.
   - Passage du `job.status` à `RUNNING`, ajout de `reservedCount`, et estampillage `quotaReservedAt`.
En cas d'échec (ex: Quota Exceeded), aucune écriture n'affecte l'école et le Job est passé en statut `FAILED` en dehors du corps de la transaction échouée.

## 3. Preuves d'idempotence
La transaction bloque toute course concurrente sur l'Incrément.
Si le Cloud Pub/Sub redéclenche l'événement, la re-lecture du Job constatera l'état `RUNNING` et retournera immédiatement sans re-modifier `studentCount` ni échouer (idempotence douce).

## 4. Tests
10 scénarios de tests stricts couvrant les comportements métier et les états concurrents ont été écrits.
```text
=== DÉMARRAGE DES TESTS MOCKÉS PHASE 2C ===
✅ 1. quota suffisant -> studentCount incrémenté
✅ 2. quota insuffisant -> FAILED, compteur inchangé
✅ 3. newStudents = 0 -> reservedCount = 0, compteur inchangé
✅ 4. double appel -> pas de double incrément
✅ 5. job déjà RUNNING -> no-op
✅ 6. school inexistante -> FAILED
✅ 7. studentCount absent -> treat as 0
✅ 8. limite absente -> erreur claire
✅ 9. abonnement suspendu -> refus
✅ 10. transaction concurrente simulée -> une seule réservation

=== RÉSULTATS: 10 PASS, 0 FAIL ===
```

## 5. Build
Le build TypeScript s'est achevé avec succès. Le code est propre.

## 6. Dette Résiduelle (Assumée)
Il existe actuellement un état "Zombie" temporaire dans notre workflow :
- *Le quota est réservé, le job est RUNNING, mais la base de données `students` ne contient toujours pas les élèves.*
- Si le serveur crashe juste après la Phase 2C, le quota aura été volé au client (Write Skew inversé).
Cette dette architecturale était prévue au design et sera apurée lors des :
- **Phase 2D** : Exécution du BulkWriter.
- **Phase 2E** : Ajustement transactionnel rétroactif en cas d'écritures partielles échouées par Firebase ou crash serveur non-récupérable.

# VERDICT
**COMMIT CREATED — READY FOR REVIEW**
