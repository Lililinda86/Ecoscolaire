import { expect, test } from '@jest/globals';
import { getClassProgramByIdentity, ClassProgramServiceError } from '../src/services/classPrograms';
import { getDocs, query, where, collection, limit } from 'firebase/firestore';

// Mock firestore functions
jest.mock('firebase/firestore', () => {
  const original = jest.requireActual('firebase/firestore');
  return {
    ...original,
    collection: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    getDocs: jest.fn(),
  };
});

jest.mock('../src/db/firebase', () => ({
  db: {}
}));

describe('getClassProgramByIdentity unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. Paramètres invalides (schoolId absent) retourne null sans appeler Firestore', async () => {
    const res = await getClassProgramByIdentity({
      schoolId: '',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  test('2. Paramètres avec slash "/" retourne null sans appeler Firestore', async () => {
    const res = await getClassProgramByIdentity({
      schoolId: 'school/a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
  });

  test('3. Query correcte avec les trois where et limit(2)', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: true,
      size: 0,
      docs: []
    });

    await getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });

    expect(collection).toHaveBeenCalled();
    expect(where).toHaveBeenCalledTimes(3);
    expect(limit).toHaveBeenCalledWith(2);
    expect(query).toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalled();
  });

  test('4. 0 résultat retourne null', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: true,
      size: 0,
      docs: []
    });

    const res = await getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toBeNull();
  });

  test('5. 1 résultat valide retourne le programme', async () => {
    const mockData = {
      id: 'school-a__2026-2027__class-a',
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'school-a__2026-2027__class-a',
        data: () => mockData
      }]
    });

    const res = await getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    });
    expect(res).toEqual(mockData);
  });

  test('6. Mauvais docSnap.id refusé (PROGRAM_INTEGRITY_ERROR)', async () => {
    const mockData = {
      id: 'school-a__2026-2027__class-a',
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'wrong-id',
        data: () => mockData
      }]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('7. Mauvais data.id refusé (PROGRAM_INTEGRITY_ERROR)', async () => {
    const mockData = {
      id: 'wrong-id',
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'school-a__2026-2027__class-a',
        data: () => mockData
      }]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('8. Mauvais data.schoolId refusé (PROGRAM_INTEGRITY_ERROR)', async () => {
    const mockData = {
      id: 'school-a__2026-2027__class-a',
      schoolId: 'wrong-school',
      academicYearId: '2026-2027',
      classId: 'class-a',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'school-a__2026-2027__class-a',
        data: () => mockData
      }]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('9. Mauvais data.academicYearId refusé (PROGRAM_INTEGRITY_ERROR)', async () => {
    const mockData = {
      id: 'school-a__2026-2027__class-a',
      schoolId: 'school-a',
      academicYearId: 'wrong-year',
      classId: 'class-a',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'school-a__2026-2027__class-a',
        data: () => mockData
      }]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('10. Mauvais data.classId refusé (PROGRAM_INTEGRITY_ERROR)', async () => {
    const mockData = {
      id: 'school-a__2026-2027__class-a',
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'wrong-class',
      status: 'draft'
    };
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [{
        id: 'school-a__2026-2027__class-a',
        data: () => mockData
      }]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('11. 2 résultats refusés (PROGRAM_INTEGRITY_ERROR)', async () => {
    (getDocs as jest.Mock).mockResolvedValueOnce({
      empty: false,
      size: 2,
      docs: [
        { id: 'school-a__2026-2027__class-a', data: () => ({}) },
        { id: 'school-a__2026-2027__class-a-2', data: () => ({}) }
      ]
    });

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_INTEGRITY_ERROR', 'Les données du programme de cette classe sont incohérentes.'));
  });

  test('12. permission-denied mappé correctement (PROGRAM_PERMISSION_DENIED)', async () => {
    const permError = new Error('Permission denied');
    (permError as any).code = 'permission-denied';
    (getDocs as jest.Mock).mockRejectedValueOnce(permError);

    await expect(getClassProgramByIdentity({
      schoolId: 'school-a',
      academicYearId: '2026-2027',
      classId: 'class-a'
    })).rejects.toThrow(new ClassProgramServiceError('PROGRAM_PERMISSION_DENIED', 'Vous n’êtes pas autorisé à consulter le programme de cette classe.'));
  });
});
