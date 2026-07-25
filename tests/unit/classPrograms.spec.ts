import { test, expect } from '@playwright/test';
import {
  interpretClassProgramQueryResult,
  validateClassProgramIdentityParams
} from '../../src/services/classProgramQueryResult';
import { buildClassProgramQueryConstraints } from '../../src/services/classProgramQueryConstraints';

test.describe('ClassProgram Query & Interpretation production logic tests', () => {
  const schoolId = 'school-a';
  const academicYearId = '2026-2027';
  const classId = 'class-a';
  const expectedId = 'school-a__2026-2027__class-a';

  test('1. validateClassProgramIdentityParams: schoolId absent', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: '',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
  });

  test('2. validateClassProgramIdentityParams: academicYearId absent', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: 'school-a',
      academicYearId: '',
      classId: 'class-a'
    });
    expect(res).toBeNull();
  });

  test('3. validateClassProgramIdentityParams: classId absent', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: ''
    });
    expect(res).toBeNull();
  });

  test('4. validateClassProgramIdentityParams: slash invalide dans schoolId', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: 'school/a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
  });

  test('5. validateClassProgramIdentityParams: slash invalide dans academicYearId', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: 'school-a',
      academicYearId: '2026/2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
  });

  test('6. validateClassProgramIdentityParams: slash invalide dans classId', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class/a'
    });
    expect(res).toBeNull();
  });

  test('7. validateClassProgramIdentityParams: paramètres valides sont nettoyés et retournés', () => {
    const res = validateClassProgramIdentityParams({
      schoolId: ' school-a  ',
      academicYearId: ' 2026-2027 ',
      classId: ' class-a '
    });
    expect(res).toEqual({
      cleanSchoolId: 'school-a',
      cleanAcademicYearId: '2026-2027',
      cleanClassId: 'class-a'
    });
  });

  test('8. interpretClassProgramQueryResult: zéro document retourne null', () => {
    const res = interpretClassProgramQueryResult({
      docs: [],
      schoolId,
      academicYearId,
      classId
    });
    expect(res).toBeNull();
  });

  test('9. interpretClassProgramQueryResult: un document valide est retourné', () => {
    const mockData = {
      id: expectedId,
      schoolId,
      academicYearId,
      classId,
      status: 'draft'
    };
    const res = interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    });
    expect(res).toEqual(mockData);
  });

  test('10. interpretClassProgramQueryResult: doc.id incohérent refusé', () => {
    const mockData = {
      id: expectedId,
      schoolId,
      academicYearId,
      classId,
      status: 'draft'
    };
    expect(() => interpretClassProgramQueryResult({
      docs: [{ id: 'wrong-doc-id', data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('11. interpretClassProgramQueryResult: data.id présent et incohérent refusé', () => {
    const mockData = {
      id: 'wrong-data-id',
      schoolId,
      academicYearId,
      classId,
      status: 'draft'
    };
    expect(() => interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('12. interpretClassProgramQueryResult: data.id absent accepté pour legacy', () => {
    const mockLegacyData = {
      schoolId,
      academicYearId,
      classId,
      status: 'published'
    };
    const res = interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockLegacyData }],
      schoolId,
      academicYearId,
      classId
    });
    expect(res).toEqual(mockLegacyData);
  });

  test('13. interpretClassProgramQueryResult: mauvais schoolId refusé', () => {
    const mockData = {
      id: expectedId,
      schoolId: 'wrong-school',
      academicYearId,
      classId,
      status: 'draft'
    };
    expect(() => interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('14. interpretClassProgramQueryResult: mauvais academicYearId refusé', () => {
    const mockData = {
      id: expectedId,
      schoolId,
      academicYearId: 'wrong-year',
      classId,
      status: 'draft'
    };
    expect(() => interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('15. interpretClassProgramQueryResult: mauvais classId refusé', () => {
    const mockData = {
      id: expectedId,
      schoolId,
      academicYearId,
      classId: 'wrong-class',
      status: 'draft'
    };
    expect(() => interpretClassProgramQueryResult({
      docs: [{ id: expectedId, data: () => mockData }],
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('16. interpretClassProgramQueryResult: deux documents refusés', () => {
    const docs = [
      { id: expectedId, data: () => ({}) },
      { id: expectedId + '-2', data: () => ({}) }
    ];
    expect(() => interpretClassProgramQueryResult({
      docs,
      schoolId,
      academicYearId,
      classId
    })).toThrow('Les données du programme de cette classe sont incohérentes.');
  });

  test('17. buildClassProgramQueryConstraints: validation de la structure de requête Firestore de production', () => {
    const q = buildClassProgramQueryConstraints('school-1', '2026-2027', 'class-1');

    // Assure collection name is correct
    expect(q.collectionName).toBe('classPrograms');

    // Assure limit(2) is used
    expect(q.limitVal).toBe(2);

    // Assure 3 where filters are used
    expect(q.filters.length).toBe(3);

    const schoolFilter = q.filters.find((c) => c.field === 'schoolId');
    expect(schoolFilter).toBeDefined();
    expect(schoolFilter?.op).toBe('==');
    expect(schoolFilter?.val).toBe('school-1');

    const yearFilter = q.filters.find((c) => c.field === 'academicYearId');
    expect(yearFilter).toBeDefined();
    expect(yearFilter?.op).toBe('==');
    expect(yearFilter?.val).toBe('2026-2027');

    const classFilter = q.filters.find((c) => c.field === 'classId');
    expect(classFilter).toBeDefined();
    expect(classFilter?.op).toBe('==');
    expect(classFilter?.val).toBe('class-1');
  });
});
