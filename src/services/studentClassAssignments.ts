import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export interface AssignStudentToClassInput {
  studentId: string;
  targetClassId: string;
}

export interface AssignStudentToClassResult {
  success: true;
  changed: boolean;
  studentId: string;
  previousClassId: string | null;
  classId: string;
  schoolId: string;
}

export const assignStudentToClass = async (
  input: AssignStudentToClassInput,
): Promise<AssignStudentToClassResult> => {
  const callable = httpsCallable<AssignStudentToClassInput, AssignStudentToClassResult>(
    functions,
    'assignStudentToClass',
  );
  const response = await callable(input);
  return response.data;
};
