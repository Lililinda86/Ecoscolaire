import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  executeCreateStudentSecure,
  handleCreateStudentSecure,
  type CreateStudentSecureInput
} from '../../functions/src/studentCreationSecure';

const projectId = 'ecoscolaire-test-create-student-secure';
let db: FirebaseFirestore.Firestore;
let sequence = 0;

const nextId = (label: string): string => `${label}-${Date.now()}-${sequence++}`;

const businessCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'details' in error
  && typeof (error as { details?: unknown }).details === 'object'
  && (error as { details?: { businessCode?: unknown } }).details !== null
  && typeof (error as { details: { businessCode?: unknown } }).details.businessCode === 'string'
    ? (error as { details: { businessCode: string } }).details.businessCode
    : undefined;

const expectBusinessError = async (promise: Promise<unknown>, expected: string): Promise<void> => {
  try {
    await promise;
    throw new Error(`Expected ${expected}`);
  } catch (error) {
    expect(businessCode(error)).toBe(expected);
  }
};

const seed = async ({
  role = 'secretary',
  studentsCount = 0,
  studentLimit = 10,
  subscriptionPlan = 'starter',
  isInternalSchool = false,
  activeYear = true,
  classSchool = 'same',
  classActive = true
}: {
  role?: string;
  studentsCount?: number | null;
  studentLimit?: number;
  subscriptionPlan?: string;
  isInternalSchool?: boolean;
  activeYear?: boolean;
  classSchool?: 'same' | 'other';
  classActive?: boolean;
} = {}) => {
  const uid = nextId(`user-${role}`);
  const schoolId = nextId('school');
  const otherSchoolId = nextId('other-school');
  const academicYearId = nextId('year');
  const classId = nextId('class');
  const school: Record<string, unknown> = {
    name: 'École test', activeAcademicYearId: activeYear ? academicYearId : '',
    studentLimit, subscriptionPlan, isInternalSchool
  };
  if (studentsCount !== null) school.studentsCount = studentsCount;
  await Promise.all([
    db.collection('users').doc(uid).set({ role, schoolId, active: true, status: 'active' }),
    db.collection('schools').doc(schoolId).set(school),
    db.collection('academicYears').doc(academicYearId).set({
      schoolId, name: '2026-2027', status: 'active'
    }),
    db.collection('classes').doc(classId).set({
      schoolId: classSchool === 'same' ? schoolId : otherSchoolId,
      name: 'CP', isActive: classActive, section: 'francophone'
    })
  ]);
  return { uid, schoolId, otherSchoolId, academicYearId, classId };
};

const input = (classId: string, overrides: Partial<CreateStudentSecureInput> = {}): CreateStudentSecureInput => {
  const studentId = nextId('student');
  return {
    studentId,
    requestedMatricule: `MAT-${studentId}`,
    studentData: {
      name: 'Élève Test', studentLastName: 'Élève', studentFirstName: studentId,
      gender: 'F', section: 'francophone', classId, studentStatus: 'nouveau'
    },
    privateData: { dob: '2018-01-02', parentName: 'Parent Test', parentPhone: '600000000' },
    financeData: { feeT1: 1000, feeT2: 2000, feeT3: 3000 },
    parentPrivateData: { dob: '2018-01-02' },
    parentFinanceData: { feeT1: 1000, feeT2: 2000, feeT3: 3000 },
    ...overrides
  };
};

const call = (uid: string, payload: CreateStudentSecureInput) =>
  executeCreateStudentSecure(uid, payload, db, () => new Date().toISOString());

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required for createStudentSecure tests.');
  }
  const app = getApps().find(candidate => candidate.name === projectId)
    ?? initializeApp({ projectId }, projectId);
  db = getFirestore(app);
});

describe('createStudentSecure callable', () => {
  it('01 unauthenticated -> DENY', async () => {
    const fixture = await seed();
    await expectBusinessError(handleCreateStudentSecure(input(fixture.classId), {}, db, () => new Date().toISOString()), 'UNAUTHENTICATED');
  }, 15_000);

  for (const role of ['teacher', 'accountant', 'boardViewer']) {
    it(`02 ${role} create -> DENY`, async () => {
      const fixture = await seed({ role });
      await expectBusinessError(call(fixture.uid, input(fixture.classId)), 'PERMISSION_DENIED');
    }, 15_000);
  }

  for (const [number, role] of [['03', 'secretary'], ['04', 'owner'], ['05', 'director'], ['05b', 'superAdmin']] as const) {
    it(`${number} ${role} -> PASS`, async () => {
      const fixture = await seed({ role });
      const payload = input(fixture.classId);
      if (role === 'superAdmin') payload.studentData.schoolId = fixture.schoolId;
      await expect(call(fixture.uid, payload)).resolves.toMatchObject({ created: true });
    });
  }

  it('05c superAdmin cannot target a non-existent school', async () => {
    const fixture = await seed({ role: 'superAdmin' });
    const payload = input(fixture.classId);
    payload.studentData.schoolId = nextId('missing-school');
    await expectBusinessError(call(fixture.uid, payload), 'SCHOOL_NOT_FOUND');
  });

  it('06 ignores falsified client schoolId and derives the authenticated school', async () => {
    const fixture = await seed();
    const payload = input(fixture.classId);
    payload.studentData.schoolId = fixture.otherSchoolId;
    payload.privateData.schoolId = fixture.otherSchoolId;
    const result = await call(fixture.uid, payload);
    expect((await db.collection('students').doc(result.studentId).get()).data()?.schoolId).toBe(fixture.schoolId);
    expect((await db.collection('studentPrivate').doc(result.studentId).get()).data()?.schoolId).toBe(fixture.schoolId);
  });

  it('07 inactive class -> DENY', async () => {
    const fixture = await seed({ classActive: false });
    await expectBusinessError(call(fixture.uid, input(fixture.classId)), 'INVALID_CLASS');
  });

  it('08 cross-school class -> DENY', async () => {
    const fixture = await seed({ classSchool: 'other' });
    await expectBusinessError(call(fixture.uid, input(fixture.classId)), 'INVALID_CLASS');
  });

  it('09 missing active academic year -> DENY', async () => {
    const fixture = await seed({ activeYear: false });
    await expectBusinessError(call(fixture.uid, input(fixture.classId)), 'INVALID_ACADEMIC_YEAR');
  });

  it('10 missing canonical counter -> STUDENT_COUNTER_NOT_INITIALIZED', async () => {
    const fixture = await seed({ studentsCount: null });
    await expectBusinessError(call(fixture.uid, input(fixture.classId)), 'STUDENT_COUNTER_NOT_INITIALIZED');
  });

  it('11 quota available -> PASS', async () => {
    const fixture = await seed({ studentsCount: 1, studentLimit: 2 });
    await expect(call(fixture.uid, input(fixture.classId))).resolves.toMatchObject({ created: true });
  });

  it('12 full quota -> DENY', async () => {
    const fixture = await seed({ studentsCount: 2, studentLimit: 2 });
    const payload = input(fixture.classId);
    await expectBusinessError(call(fixture.uid, payload), 'STUDENT_QUOTA_REACHED');
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(2);
    expect((await db.collection('students').where('schoolId', '==', fixture.schoolId).get()).empty).toBe(true);
    expect((await db.collection('studentMatriculeReservations').where('schoolId', '==', fixture.schoolId).get()).empty).toBe(true);
    expect((await db.collection('studentDuplicateReservations').where('schoolId', '==', fixture.schoolId).get()).empty).toBe(true);
  });

  it('13 unlimited plan -> PASS and increments counter', async () => {
    const fixture = await seed({ studentsCount: 500, studentLimit: 1, subscriptionPlan: 'premium' });
    await call(fixture.uid, input(fixture.classId));
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(501);
  });

  it('14 concurrent last slot -> one PASS and one quota DENY', async () => {
    const fixture = await seed({ studentsCount: 99, studentLimit: 100 });
    const results = await Promise.allSettled([
      call(fixture.uid, input(fixture.classId)), call(fixture.uid, input(fixture.classId))
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(businessCode((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)).toBe('STUDENT_QUOTA_REACHED');
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(100);
  });

  it('15 duplicate matricule -> DENY', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, { requestedMatricule: first.requestedMatricule });
    await expectBusinessError(call(fixture.uid, second), 'MATRICULE_ALREADY_EXISTS');
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(1);
    expect((await db.collection('students').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
    expect((await db.collection('studentMatriculeReservations').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
  });

  it('16 concurrent same matricule -> one PASS and one DENY', async () => {
    const fixture = await seed();
    const matricule = `MAT-${nextId('shared')}`;
    const results = await Promise.allSettled([
      call(fixture.uid, input(fixture.classId, { requestedMatricule: matricule })),
      call(fixture.uid, input(fixture.classId, { requestedMatricule: matricule }))
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(1);
    expect((await db.collection('students').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
    expect((await db.collection('studentMatriculeReservations').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
  });

  it('17 probable duplicate without confirmation -> error', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, {
      studentData: { ...first.studentData }, privateData: { ...first.privateData }
    });
    await expectBusinessError(call(fixture.uid, second), 'PROBABLE_DUPLICATE');
  });

  it('18 probable duplicate confirmed -> PASS with distinct matricule', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, {
      studentData: { ...first.studentData }, privateData: { ...first.privateData }, confirmProbableDuplicate: true
    });
    await expect(call(fixture.uid, second)).resolves.toMatchObject({ created: true });
  });

  it('19 identical retry is idempotent', async () => {
    const fixture = await seed();
    const payload = input(fixture.classId);
    const first = await call(fixture.uid, payload);
    const second = await call(fixture.uid, payload);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, studentId: first.studentId });
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(1);
  });

  it('20 failed transaction creates no partial document', async () => {
    const fixture = await seed({ classActive: false });
    const payload = input(fixture.classId);
    await expectBusinessError(call(fixture.uid, payload), 'INVALID_CLASS');
    for (const collectionName of [
      'students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance'
    ]) {
      expect((await db.collection(collectionName).doc(payload.studentId).get()).exists).toBe(false);
    }
    expect((await db.collection('studentMatriculeReservations').where('schoolId', '==', fixture.schoolId).get()).empty).toBe(true);
    expect((await db.collection('studentDuplicateReservations').where('schoolId', '==', fixture.schoolId).get()).empty).toBe(true);
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(0);
  });

  it('21 counter is exact after one successful creation', async () => {
    const fixture = await seed({ studentsCount: 7 });
    await call(fixture.uid, input(fixture.classId));
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(8);
  });

  it('22 creates private and finance source documents', async () => {
    const fixture = await seed();
    const result = await call(fixture.uid, input(fixture.classId));
    expect((await db.collection('studentPrivate').doc(result.studentId).get()).exists).toBe(true);
    expect((await db.collection('studentFinance').doc(result.studentId).get()).exists).toBe(true);
  });

  it('23 creates minimal parent projections', async () => {
    const fixture = await seed();
    const result = await call(fixture.uid, input(fixture.classId));
    expect((await db.collection('studentParentPrivate').doc(result.studentId).get()).data()).toMatchObject({ dob: '2018-01-02' });
    expect((await db.collection('studentParentFinance').doc(result.studentId).get()).data()).toMatchObject({ feeT1: 1000 });
  });

  it('24 never writes any student document into a client-supplied foreign school', async () => {
    const fixture = await seed();
    await db.collection('schools').doc(fixture.otherSchoolId).set({ studentsCount: 41 });
    const payload = input(fixture.classId);
    payload.studentData.schoolId = fixture.otherSchoolId;
    const result = await call(fixture.uid, payload);
    const collections = ['students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance'];
    for (const collectionName of collections) {
      expect((await db.collection(collectionName).doc(result.studentId).get()).data()?.schoolId).toBe(fixture.schoolId);
    }
    expect((await db.collection('schools').doc(fixture.otherSchoolId).get()).data()?.studentsCount).toBe(41);
  });

  for (const [label, studentFirstName] of [['empty', ''], ['whitespace-only', '   ']] as const) {
    it(`25 direct callable rejects a ${label} first name`, async () => {
      const fixture = await seed();
      const payload = input(fixture.classId);
      payload.studentData.studentFirstName = studentFirstName;
      await expectBusinessError(call(fixture.uid, payload), 'INVALID_ARGUMENT');
    });
  }

  for (const [label, medicalData] of [
    ['no medical fields', {}],
    ['allergies only', { allergies: 'Arachides' }],
    ['medical condition only', { medicalConditions: 'Asthme' }],
    ['empty medical strings', { allergies: '', medicalConditions: '' }],
    ['explicit no known condition confirmation', { allergies: '', medicalConditions: '' }]
  ] as const) {
    it(`26 accepts ${label}`, async () => {
      const fixture = await seed();
      const payload = input(fixture.classId, {
        privateData: { ...input(fixture.classId).privateData, ...medicalData }
      });
      const result = await call(fixture.uid, payload);
      expect(result).toMatchObject({ created: true });
      const privateDocument = (await db.collection('studentPrivate').doc(result.studentId).get()).data();
      if (medicalData.allergies) expect(privateDocument?.allergies).toBe(medicalData.allergies);
      if (medicalData.medicalConditions) {
        expect(privateDocument?.medicalConditions).toBe(medicalData.medicalConditions);
      }
    });
  }

  it('27 same matricule and same identity is denied for a distinct operation', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, {
      requestedMatricule: first.requestedMatricule,
      studentData: { ...first.studentData },
      privateData: { ...first.privateData }
    });
    await expectBusinessError(call(fixture.uid, second), 'MATRICULE_ALREADY_EXISTS');
  });

  it('28 same matricule and different identity is denied', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, { requestedMatricule: first.requestedMatricule });
    await expectBusinessError(call(fixture.uid, second), 'MATRICULE_ALREADY_EXISTS');
  });

  it('29 duplicate confirmation never bypasses a matricule collision', async () => {
    const fixture = await seed();
    const first = input(fixture.classId);
    await call(fixture.uid, first);
    const second = input(fixture.classId, {
      requestedMatricule: first.requestedMatricule,
      studentData: { ...first.studentData },
      privateData: { ...first.privateData },
      confirmProbableDuplicate: true
    });
    await expectBusinessError(call(fixture.uid, second), 'MATRICULE_ALREADY_EXISTS');
    expect((await db.collection('schools').doc(fixture.schoolId).get()).data()?.studentsCount).toBe(1);
    expect((await db.collection('students').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
    expect((await db.collection('studentMatriculeReservations').where('schoolId', '==', fixture.schoolId).get()).size).toBe(1);
  });

  it('30 allows the same normalized matricule in two different schools', async () => {
    const firstSchool = await seed();
    const secondSchool = await seed();
    const sharedMatricule = `CODEX-C5-${nextId('cross-school')}`;

    await expect(call(firstSchool.uid, input(firstSchool.classId, {
      requestedMatricule: sharedMatricule
    }))).resolves.toMatchObject({ created: true });
    await expect(call(secondSchool.uid, input(secondSchool.classId, {
      requestedMatricule: sharedMatricule
    }))).resolves.toMatchObject({ created: true });
  });
});
