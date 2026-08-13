import type { Student } from '../types';
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

export type StudentPrivate = Pick<Student,
  | 'dob'
  | 'placeOfBirth'
  | 'parentName'
  | 'parentPhone'
  | 'parentEmails'
  | 'address'
  | 'emergencyContact'
  | 'allergies'
  | 'medicalConditions'
  | 'transportNeighborhood'
  | 'transportPickupPoint'
  | 'fatherName'
  | 'fatherPhone'
  | 'fatherProfession'
  | 'motherName'
  | 'motherPhone'
  | 'motherProfession'
  | 'guardianRelationship'
  | 'guardianRelationshipDetails'
  | 'motherLastName'
  | 'motherFirstName'
  | 'motherEmail'
  | 'motherWhatsapp'
  | 'fatherLastName'
  | 'fatherFirstName'
  | 'fatherEmail'
  | 'fatherWhatsapp'
  | 'guardianLastName'
  | 'guardianFirstName'
  | 'guardianPhone'
  | 'guardianEmail'
  | 'guardianWhatsapp'
  | 'guardianRelation'
  | 'primaryContactType'
> & {
  id: string;
  schoolId: string;
  studentId: string;
};

export type StudentFinance = Pick<Student,
  | 'feeAmount'
  | 'feeT1'
  | 'feeT2'
  | 'feeT3'
  | 'feeTransport'
  | 'feeUniforms'
  | 'financialBypass'
  | 'registrationFeeExpected'
  | 'registrationFeePaid'
  | 'registrationFeeStatus'
  | 'tuitionExpected'
  | 'tuitionPaid'
  | 'tuitionStatus'
  | 'transportMonthlyFee'
  | 'transportPaid'
> & {
  id: string;
  schoolId: string;
  studentId: string;
};

export type StudentParentPrivate = Pick<Student, 'dob'> & {
  id: string;
  schoolId: string;
  studentId: string;
};

export type StudentParentFinance = Pick<Student,
  | 'feeT1'
  | 'feeT2'
  | 'feeT3'
  | 'financialBypass'
> & {
  id: string;
  schoolId: string;
  studentId: string;
};

const PRIVATE_KEYS: ReadonlyArray<keyof StudentPrivate> = [
  'dob', 'placeOfBirth', 'parentName', 'parentPhone', 'parentEmails', 'address',
  'emergencyContact', 'allergies', 'medicalConditions',
  'transportNeighborhood', 'transportPickupPoint',
  'fatherName', 'fatherPhone', 'fatherProfession',
  'motherName', 'motherPhone', 'motherProfession',
  'guardianRelationship', 'guardianRelationshipDetails',
  'motherLastName', 'motherFirstName', 'motherEmail', 'motherWhatsapp',
  'fatherLastName', 'fatherFirstName', 'fatherEmail', 'fatherWhatsapp',
  'guardianLastName', 'guardianFirstName', 'guardianPhone', 'guardianEmail',
  'guardianWhatsapp', 'guardianRelation', 'primaryContactType'
];

const FINANCE_KEYS: ReadonlyArray<keyof StudentFinance> = [
  'feeAmount', 'feeT1', 'feeT2', 'feeT3', 'feeTransport', 'feeUniforms',
  'financialBypass', 'registrationFeeExpected', 'registrationFeePaid',
  'registrationFeeStatus', 'tuitionExpected', 'tuitionPaid', 'tuitionStatus',
  'transportMonthlyFee', 'transportPaid'
];

const pickDefined = <T extends object>(
  source: Partial<Student>,
  keys: ReadonlyArray<keyof T>
): Partial<T> => Object.fromEntries(
  keys
    .map(key => [key, source[key as keyof Student]])
    .filter(([, value]) => value !== undefined && value !== '')
) as Partial<T>;

export const splitStudentData = (
  student: Partial<Student> & { id: string; schoolId: string }
): {
  schoolData: Record<string, unknown>;
  privateData: StudentPrivate;
  financeData: StudentFinance;
  parentPrivateData: StudentParentPrivate;
  parentFinanceData: StudentParentFinance;
} => {
  const privateData = {
    id: student.id,
    schoolId: student.schoolId,
    studentId: student.id,
    ...pickDefined<StudentPrivate>(student, PRIVATE_KEYS)
  } as StudentPrivate;
  const parentFinanceFields = {
    feeT1: student.feeT1 ?? 0,
    feeT2: student.feeT2 ?? 0,
    feeT3: student.feeT3 ?? 0,
    financialBypass: student.financialBypass ?? { t1: false, t2: false, t3: false }
  };
  const financeData = {
    id: student.id,
    schoolId: student.schoolId,
    studentId: student.id,
    ...pickDefined<StudentFinance>(student, FINANCE_KEYS),
    ...parentFinanceFields
  } as StudentFinance;
  const parentPrivateData = {
    id: student.id,
    schoolId: student.schoolId,
    studentId: student.id,
    dob: student.dob ?? ''
  } as StudentParentPrivate;
  const parentFinanceData = {
    id: student.id,
    schoolId: student.schoolId,
    studentId: student.id,
    ...parentFinanceFields
  } as StudentParentFinance;
  const excluded = new Set<string>([...PRIVATE_KEYS, ...FINANCE_KEYS]);
  const schoolData = Object.fromEntries(
    Object.entries(student).filter(([key, value]) => !excluded.has(key) && value !== undefined && value !== '')
  );
  return { schoolData, privateData, financeData, parentPrivateData, parentFinanceData };
};

export const mergeStudentRestrictedData = (
  students: Student[],
  privateRecords: Array<Partial<StudentPrivate>>,
  financeRecords: Array<Partial<StudentFinance>>,
  parentPrivateRecords: Array<Partial<StudentParentPrivate>> = [],
  parentFinanceRecords: Array<Partial<StudentParentFinance>> = []
): Student[] => {
  const privateByStudent = new Map(privateRecords.map(record => [record.studentId, record]));
  const financeByStudent = new Map(financeRecords.map(record => [record.studentId, record]));
  const parentPrivateByStudent = new Map(parentPrivateRecords.map(record => [record.studentId, record]));
  const parentFinanceByStudent = new Map(parentFinanceRecords.map(record => [record.studentId, record]));
  return students.map(student => ({
    ...student,
    ...(privateByStudent.get(student.id) ?? {}),
    ...(financeByStudent.get(student.id) ?? {}),
    ...(parentPrivateByStudent.get(student.id) ?? {}),
    ...(parentFinanceByStudent.get(student.id) ?? {}),
    id: student.id,
    schoolId: student.schoolId
  }));
};

export const canLoadStudentPrivate = (role: string): boolean =>
  ['superAdmin', 'owner', 'director', 'secretary'].includes(role);

export const canLoadStudentFinance = (role: string): boolean =>
  ['superAdmin', 'owner', 'director', 'secretary', 'accountant'].includes(role);

export const canLoadStudentParentPrivate = (role: string): boolean => role === 'parent';

export const canLoadStudentParentFinance = (role: string): boolean => role === 'parent';

export const canUseStudentContactWhatsApp = (role: string): boolean =>
  ['owner', 'director', 'secretary'].includes(role);

export const updateStudentSeparatedData = async ({
  firestore,
  studentId,
  schoolId,
  actorId,
  patch
}: {
  firestore: Firestore;
  studentId: string;
  schoolId: string;
  actorId: string;
  patch: Partial<Student>;
}): Promise<'separated' | 'legacy'> => runTransaction(firestore, async transaction => {
  const studentRef = doc(firestore, 'students', studentId);
  const privateRef = doc(firestore, 'studentPrivate', studentId);
  const financeRef = doc(firestore, 'studentFinance', studentId);
  const parentPrivateRef = doc(firestore, 'studentParentPrivate', studentId);
  const parentFinanceRef = doc(firestore, 'studentParentFinance', studentId);
  const [privateSnapshot, financeSnapshot, parentPrivateSnapshot, parentFinanceSnapshot] = await Promise.all([
    transaction.get(privateRef),
    transaction.get(financeRef),
    transaction.get(parentPrivateRef),
    transaction.get(parentFinanceRef)
  ]);

  if (!privateSnapshot.exists() || !financeSnapshot.exists() || !parentPrivateSnapshot.exists() || !parentFinanceSnapshot.exists()) {
    transaction.update(studentRef, patch);
    return 'legacy';
  }

  const { schoolData, privateData, financeData, parentPrivateData, parentFinanceData } = splitStudentData({
    ...patch,
    id: studentId,
    schoolId
  });
  const withoutIdentity = (record: Record<string, unknown>) => Object.fromEntries(
    Object.entries(record).filter(([key]) => !['id', 'schoolId', 'studentId'].includes(key))
  );
  const schoolPatch = withoutIdentity(schoolData);
  const privatePatch = withoutIdentity(privateData as unknown as Record<string, unknown>);
  const projectedFinanceKeys = new Set(['feeT1', 'feeT2', 'feeT3', 'financialBypass']);
  const financePatch = Object.fromEntries(
    Object.entries(withoutIdentity(financeData as unknown as Record<string, unknown>))
      .filter(([key]) => !projectedFinanceKeys.has(key) || key in patch)
  );
  const parentPrivatePatch = 'dob' in patch
    ? withoutIdentity(parentPrivateData as unknown as Record<string, unknown>)
    : {};
  const parentFinancePatch = Object.fromEntries(
    Object.entries(withoutIdentity(parentFinanceData as unknown as Record<string, unknown>))
      .filter(([key]) => key in patch)
  );
  const auditPatch = { updatedAt: serverTimestamp(), updatedBy: actorId };

  if (Object.keys(schoolPatch).length > 0) transaction.update(studentRef, schoolPatch);
  if (Object.keys(privatePatch).length > 0) transaction.update(privateRef, { ...privatePatch, ...auditPatch });
  if (Object.keys(financePatch).length > 0) transaction.update(financeRef, { ...financePatch, ...auditPatch });
  if (Object.keys(parentPrivatePatch).length > 0) transaction.update(parentPrivateRef, { ...parentPrivatePatch, ...auditPatch });
  if (Object.keys(parentFinancePatch).length > 0) transaction.update(parentFinanceRef, { ...parentFinancePatch, ...auditPatch });
  return 'separated';
});
