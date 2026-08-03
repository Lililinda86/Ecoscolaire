import { test, expect } from '@playwright/test';
import { buildClassSubjectMutation, mapClassProgramDraftError, getSubjectIdsToFetch } from '../../src/services/classProgramDrafts';
import { ClassProgramDraftError } from '../../src/services/classProgramDrafts';
import type { ClassSubject } from '../../src/types';

test.describe('ClassProgramDrafts Service - Pure Functions', () => {
  const dummyDate = '2026-07-27T00:00:00.000Z';
  const deleteSentinel = () => 'DELETE_SENTINEL';

  const baseSubject: ClassSubject = {
    id: 'school-1__2026__class-1__subj-1',
    programId: 'school-1__2026__class-1',
    schoolId: 'school-1',
    classId: 'class-1',
    academicYearId: '2026',
    subjectId: 'subj-1',
    revisionId: 'rev-1',
    revisionNumber: 1,
    subjectNameSnapshot: 'Maths',
    isRequired: true,
    isActive: true,
    displayOrder: 0,
    createdAt: dummyDate,
    createdBy: 'user-1',
    updatedAt: dummyDate,
    updatedBy: 'user-1'
  };

  test('1. nouvelle matière avec toutes les valeurs', () => {
    const edited = { ...baseSubject, coefficient: 2, weeklyHours: 4, subjectCodeSnapshot: 'MATH' };
    const mutation = buildClassSubjectMutation(edited, null, null, true, 'user-1', dummyDate, deleteSentinel);

    expect(mutation).not.toBeNull();
    expect(mutation?.type).toBe('set');
    expect(mutation?.payload).toEqual(edited);
  });

  test('2. matière existante active modifiée', () => {
    const original = { ...baseSubject, coefficient: 1 };
    const edited = { ...baseSubject, coefficient: 2 };
    const snap = original;

    const mutation = buildClassSubjectMutation(edited, snap, original, false, 'user-1', dummyDate, deleteSentinel);

    expect(mutation).not.toBeNull();
    expect(mutation?.type).toBe('update');
    expect(mutation?.payload).toEqual({
      isActive: true,
      isRequired: true,
      displayOrder: 0,
      updatedAt: dummyDate,
      updatedBy: 'user-1',
      coefficient: 2
    });
  });

  test('3. matière inactive réactivée', () => {
    const snap = { ...baseSubject, isActive: false };
    const edited = { ...baseSubject, isActive: true };

    const mutation = buildClassSubjectMutation(edited, snap, null, true, 'user-1', dummyDate, deleteSentinel);

    expect(mutation).not.toBeNull();
    expect(mutation?.type).toBe('update');
    expect(mutation?.payload.isActive).toBe(true);
  });

  test('4. réactivation conserve isRequired', () => {
    const snap = { ...baseSubject, isActive: false };
    const edited = { ...baseSubject, isActive: true, isRequired: false };

    const mutation = buildClassSubjectMutation(edited, snap, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.isRequired).toBe(false);
  });

  test('5. réactivation conserve displayOrder', () => {
    const snap = { ...baseSubject, isActive: false };
    const edited = { ...baseSubject, isActive: true, displayOrder: 5 };

    const mutation = buildClassSubjectMutation(edited, snap, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.displayOrder).toBe(5);
  });

  test('6. réactivation conserve coefficient', () => {
    const snap = { ...baseSubject, isActive: false, coefficient: 2 };
    const edited = { ...baseSubject, isActive: true, coefficient: 3 };

    const mutation = buildClassSubjectMutation(edited, snap, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.coefficient).toBe(3);
  });

  test('7. réactivation conserve weeklyHours', () => {
    const snap = { ...baseSubject, isActive: false, weeklyHours: 4 };
    const edited = { ...baseSubject, isActive: true, weeklyHours: 5 };

    const mutation = buildClassSubjectMutation(edited, snap, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.weeklyHours).toBe(5);
  });

  test('8. coefficient absent produit la sentinelle deleteField uniquement lorsque le document existant possède ce champ', () => {
    // Si original a le champ
    const originalWith = { ...baseSubject, coefficient: 2 };
    const editedWithout = { ...baseSubject, coefficient: undefined };
    const mutationWith = buildClassSubjectMutation(editedWithout, originalWith, originalWith, false, 'user-1', dummyDate, deleteSentinel);
    expect(mutationWith?.payload.coefficient).toBe('DELETE_SENTINEL');

    // Si original n'a PAS le champ
    const originalWithout = { ...baseSubject, coefficient: undefined };
    const mutationWithout = buildClassSubjectMutation(editedWithout, originalWithout, originalWithout, false, 'user-1', dummyDate, deleteSentinel);
    // mutationWithout is null because there are no changes!
    expect(mutationWithout).toBeNull();

    // If there is another change, it won't send deleteField for coefficient
    const editedWithoutOtherChange = { ...baseSubject, coefficient: undefined, displayOrder: 1 };
    const mutationWithout2 = buildClassSubjectMutation(editedWithoutOtherChange, originalWithout, originalWithout, false, 'user-1', dummyDate, deleteSentinel);
    expect(mutationWithout2?.payload).not.toHaveProperty('coefficient');
  });

  test('9. weeklyHours absent produit la sentinelle deleteField uniquement lorsque le document existant possède ce champ', () => {
    const originalWith = { ...baseSubject, weeklyHours: 4 };
    const editedWithout = { ...baseSubject, weeklyHours: undefined };
    const mutationWith = buildClassSubjectMutation(editedWithout, originalWith, originalWith, false, 'user-1', dummyDate, deleteSentinel);
    expect(mutationWith?.payload.weeklyHours).toBe('DELETE_SENTINEL');

    const originalWithout = { ...baseSubject, weeklyHours: undefined };
    const editedWithoutOtherChange = { ...baseSubject, weeklyHours: undefined, displayOrder: 1 };
    const mutationWithout2 = buildClassSubjectMutation(editedWithoutOtherChange, originalWithout, originalWithout, false, 'user-1', dummyDate, deleteSentinel);
    expect(mutationWithout2?.payload).not.toHaveProperty('weeklyHours');
  });

  test('10. aucune clé ne reçoit undefined', () => {
    const edited = { ...baseSubject, subjectCodeSnapshot: undefined, coefficient: undefined, weeklyHours: undefined };
    const mutation = buildClassSubjectMutation(edited, null, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload).not.toHaveProperty('subjectCodeSnapshot');
    expect(mutation?.payload).not.toHaveProperty('coefficient');
    expect(mutation?.payload).not.toHaveProperty('weeklyHours');
  });

  test('11. updatedBy est correct', () => {
    const original = { ...baseSubject };
    const edited = { ...baseSubject, displayOrder: 1 };
    const mutation = buildClassSubjectMutation(edited, original, original, false, 'user-42', dummyDate, deleteSentinel);
    expect(mutation?.payload.updatedBy).toBe('user-42');
  });

  test('12. isActive est correct', () => {
    const original = { ...baseSubject, isActive: true };
    const edited = { ...baseSubject, isActive: false };
    const mutation = buildClassSubjectMutation(edited, original, original, false, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.isActive).toBe(false);
  });

  test('13. schoolId est présent lors de la création', () => {
    const edited = { ...baseSubject };
    const mutation = buildClassSubjectMutation(edited, null, null, true, 'user-1', dummyDate, deleteSentinel);
    expect(mutation?.payload.schoolId).toBe('school-1');
  });

  test('14. les champs immuables ne sont pas modifiés lors d’un update', () => {
    const original = { ...baseSubject, subjectCodeSnapshot: 'MATH' };
    const edited = { ...baseSubject, subjectCodeSnapshot: 'NEW_MATH', displayOrder: 1 };
    const mutation = buildClassSubjectMutation(edited, original, original, false, 'user-1', dummyDate, deleteSentinel);
    // on Update, only updatable fields are sent
    expect(mutation?.payload).not.toHaveProperty('subjectCodeSnapshot');
    expect(mutation?.payload).not.toHaveProperty('schoolId');
  });

  test('15. getSubjectIdsToFetch - inclut les matières existantes', () => {
    const original = [{ ...baseSubject, id: 'existant-1' }];
    const edited = [{ ...baseSubject, id: 'existant-1' }];
    const ids = getSubjectIdsToFetch(original as unknown as never, edited as unknown as never);
    expect(ids.has('existant-1')).toBe(true);
    expect(ids.size).toBe(1);
  });

  test('16. getSubjectIdsToFetch - exclut les matières nouvelles (jamais enregistrées)', () => {
    const original = [{ ...baseSubject, id: 'existant-1' }];
    const edited = [{ ...baseSubject, id: 'existant-1' }, { ...baseSubject, id: 'nouveau-1' }];
    const ids = getSubjectIdsToFetch(original as unknown as never, edited as unknown as never);
    expect(ids.has('existant-1')).toBe(true);
    expect(ids.has('nouveau-1')).toBe(false);
    expect(ids.size).toBe(1);
  });
});

test.describe('ClassProgramDrafts Service - saveClassProgramDraft', () => {
  const dummyDate = '2026-07-27T00:00:00.000Z';
  const baseProgram = { id: 'prog-1', draftRevisionId: 'rev-1', draftRevisionNumber: 1 };

  const baseSubject = {
    id: 'school-1__2026__class-1__subj-1',
    programId: 'school-1__2026__class-1',
    schoolId: 'school-1',
    classId: 'class-1',
    academicYearId: '2026',
    subjectId: 'subj-1',
    revisionId: 'rev-1',
    revisionNumber: 1,
    subjectNameSnapshot: 'Maths',
    isRequired: true,
    isActive: true,
    displayOrder: 0,
    createdAt: dummyDate,
    createdBy: 'user-1',
    updatedAt: dummyDate,
    updatedBy: 'user-1'
  };

  test('Test complet des appels transaction', async () => {
    const getRefs: unknown[] = [];
    const setCalls: { ref: unknown, payload: unknown }[] = [];
    const updateCalls: { ref: unknown, payload: unknown }[] = [];

    const mockSnapshots: Record<string, unknown> = {
      'prog-1': { exists: () => true, data: () => baseProgram },
      'school-1__2026__class-1__subj-1': { exists: () => true, data: () => baseSubject },
      'school-1__2026__class-1__subj-inactive': { exists: () => true, data: () => ({ ...baseSubject, isActive: false, id: 'school-1__2026__class-1__subj-inactive', coefficient: 2, weeklyHours: 2, displayOrder: 1, isRequired: true }) },
      'school-1__2026__class-1__subj-removed': { exists: () => true, data: () => ({ ...baseSubject, id: 'school-1__2026__class-1__subj-removed', isActive: true }) }
    };

    const mockTransaction = {
      get: async (ref: { id: string }) => {
        getRefs.push(ref);
        const snap = mockSnapshots[ref.id] as { exists: () => boolean, data: () => unknown } | undefined;
        if (snap) return snap;
        return { exists: () => false, data: () => null };
      },
      set: (ref: unknown, payload: unknown) => { setCalls.push({ ref, payload }); },
      update: (ref: unknown, payload: unknown) => { updateCalls.push({ ref, payload }); }
    };

    const mockDeps = {
      db: {},
      doc: (db: unknown, path: unknown, id: unknown) => ({ path, id }),
      runTransaction: async (db: unknown, callback: (t: typeof mockTransaction) => Promise<void>) => {
        await callback(mockTransaction);
      },
      deleteField: () => 'DELETE'
    };

    const originalSubjects = [
      baseSubject, // existant actif (modifié)
      { ...baseSubject, id: 'school-1__2026__class-1__subj-inactive', isActive: false, coefficient: 2, weeklyHours: 2, displayOrder: 1, isRequired: true }, // inactif réactivé
      { ...baseSubject, id: 'school-1__2026__class-1__subj-removed', isActive: true } // retiré
    ];

    const editedSubjects = [
      { ...baseSubject, coefficient: 5 }, // existant modifié
      { ...baseSubject, id: 'school-1__2026__class-1__subj-inactive', isActive: true, coefficient: 2, weeklyHours: 2, displayOrder: 1, isRequired: true }, // réactivé sans changement de coef
      { ...baseSubject, id: 'school-1__2026__class-1__subj-removed', isActive: false }, // retiré
      { ...baseSubject, id: 'school-1__2026__class-1__subj-new-1' }, // nouveau 1
      { ...baseSubject, id: 'school-1__2026__class-1__subj-new-2' } // nouveau 2
    ];

    const { saveClassProgramDraft } = await import('../../src/services/classProgramDrafts');
    await saveClassProgramDraft({
      program: baseProgram as unknown as never,
      originalSubjects: originalSubjects as unknown as never,
      editedSubjects: editedSubjects as unknown as never,
      userId: 'user-1',
      deps: mockDeps
    });

    // 1. Programme lu exactement une fois.
    expect(getRefs.filter(r => (r as {id: string}).id === 'prog-1').length).toBe(1);

    // 4. Sujet existant actif : lecture exacte ; update exact.
    expect(getRefs.some(r => (r as {id: string}).id === 'school-1__2026__class-1__subj-1')).toBe(true);
    const update1 = updateCalls.find(c => (c.ref as {id: string}).id === 'school-1__2026__class-1__subj-1');
    expect(update1).toBeDefined();
    expect((update1?.payload as Record<string, unknown>).coefficient).toBe(5);

    // 5. Sujet inactif réactivé : lecture exacte ; isActive: true ; coefficient conservé ; weeklyHours conservé ; displayOrder conservé ; isRequired conservé.
    expect(getRefs.some(r => (r as {id: string}).id === 'school-1__2026__class-1__subj-inactive')).toBe(true);
    const updateInactive = updateCalls.find(c => (c.ref as {id: string}).id === 'school-1__2026__class-1__subj-inactive');
    expect(updateInactive).toBeDefined();
    expect((updateInactive?.payload as Record<string, unknown>).isActive).toBe(true);
    expect((updateInactive?.payload as Record<string, unknown>).coefficient).toBe(2);
    expect((updateInactive?.payload as Record<string, unknown>).weeklyHours).toBe(2);
    expect((updateInactive?.payload as Record<string, unknown>).displayOrder).toBe(1);
    expect((updateInactive?.payload as Record<string, unknown>).isRequired).toBe(true);

    // 6. Sujet retiré : lecture exacte ; isActive: false.
    expect(getRefs.some(r => (r as {id: string}).id === 'school-1__2026__class-1__subj-removed')).toBe(true);
    const updateRemoved = updateCalls.find(c => (c.ref as {id: string}).id === 'school-1__2026__class-1__subj-removed');
    expect(updateRemoved).toBeDefined();
    expect((updateRemoved?.payload as Record<string, unknown>).isActive).toBe(false);

    // 10. Une matière nouvelle et une existante : seule l'existante est lue.
    // 11. Deux nouvelles matières : aucune lecture classSubjects.
    expect(getRefs.some(r => (r as {id: string}).id === 'school-1__2026__class-1__subj-new-1')).toBe(false);
    expect(getRefs.some(r => (r as {id: string}).id === 'school-1__2026__class-1__subj-new-2')).toBe(false);

    // 2. Nouveau sujet 1 : aucune lecture ; set sur la bonne référence ; payload complet.
    // 3. Nouveau sujet 2 : aucune lecture ; set sur la bonne référence.
    const setNew1 = setCalls.find(c => (c.ref as {id: string}).id === 'school-1__2026__class-1__subj-new-1');
    expect(setNew1).toBeDefined();
    expect((setNew1?.payload as Record<string, unknown>).isActive).toBe(true);
    expect((setNew1?.payload as Record<string, unknown>).schoolId).toBe('school-1');

    const setNew2 = setCalls.find(c => (c.ref as {id: string}).id === 'school-1__2026__class-1__subj-new-2');
    expect(setNew2).toBeDefined();

    // 7. Aucun set/update ne contient undefined.
    [...setCalls, ...updateCalls].forEach(call => {
      Object.values(call.payload as Record<string, unknown>).forEach(value => {
        expect(value).not.toBeUndefined();
      });
    });

    // 9. Les champs immuables ne sont pas réécrits lors d'un update.
    expect(update1?.payload).not.toHaveProperty('schoolId');
    expect(update1?.payload).not.toHaveProperty('programId');
  });
});

test.describe('ClassProgramDrafts Error Mapping', () => {
  test('permission-denied', () => {
    const err = mapClassProgramDraftError({ code: 'permission-denied' });
    expect(err).toBeInstanceOf(ClassProgramDraftError);
    expect(err.code).toBe('DRAFT_PERMISSION_DENIED');
    expect(err.message).toBe('Vous n’avez pas l’autorisation d’enregistrer ce programme.');
  });

  test('invalid-argument', () => {
    const err = mapClassProgramDraftError({ code: 'invalid-argument', message: 'Test message' });
    expect(err.code).toBe('DRAFT_VALIDATION_ERROR');
    expect(err.message).toBe('Test message');
  });

  test('failed-precondition', () => {
    const err = mapClassProgramDraftError({ code: 'failed-precondition', message: 'Precond' });
    expect(err.code).toBe('DRAFT_PRECONDITION_FAILED');
    expect(err.message).toBe('Precond');
  });

  test('aborted', () => {
    const err = mapClassProgramDraftError({ code: 'aborted' });
    expect(err.code).toBe('DRAFT_CONFLICT');
  });

  test('conflict', () => {
    const err = mapClassProgramDraftError({ code: 'conflict' });
    expect(err.code).toBe('DRAFT_CONFLICT');
  });

  test('unavailable', () => {
    const err = mapClassProgramDraftError({ code: 'unavailable' });
    expect(err.code).toBe('DRAFT_NETWORK_ERROR');
  });

  test('erreur inconnue', () => {
    const err = mapClassProgramDraftError({ code: 'unknown', message: 'Custom msg' });
    expect(err.code).toBe('DRAFT_SAVE_FAILED');
    expect(err.message).toBe('Custom msg');
  });

  test('erreur sans propriété code', () => {
    const err = mapClassProgramDraftError(new Error('Normal error'));
    expect(err.code).toBe('DRAFT_SAVE_FAILED');
    expect(err.message).toBe('Normal error');
  });
});
