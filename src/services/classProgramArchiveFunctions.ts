import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export async function archiveClassProgram(input: {
  schoolId: string;
  academicYearId: string;
  classId: string;
  expectedPublishedRevisionId: string;
}): Promise<void> {
  const callable = httpsCallable(functions, 'archiveClassProgram');
  await callable(input);
}
