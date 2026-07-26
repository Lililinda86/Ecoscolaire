import { test, expect } from '@playwright/test';
import { buildClassSubjectMutation, mapClassProgramDraftError } from '../../src/services/classProgramDrafts';
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
