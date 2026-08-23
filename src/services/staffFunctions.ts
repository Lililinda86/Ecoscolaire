import { getFunctions, httpsCallable } from 'firebase/functions';
import type { Staff } from '../types';

export type StaffMutationAction = 'CREATE' | 'UPDATE' | 'DEACTIVATE' | 'REACTIVATE';

export interface StaffMutationInput {
  action: StaffMutationAction;
  staffId?: string;
  schoolId?: string;
  profile?: Partial<Staff>;
}

export interface StaffMutationOutput {
  staffId: string;
  schoolId: string;
  action: StaffMutationAction;
  employmentStatus: string;
  isActive: boolean;
}

export async function mutateStaff(input: StaffMutationInput): Promise<StaffMutationOutput> {
  const callable = httpsCallable<StaffMutationInput, StaffMutationOutput>(
    getFunctions(),
    'manageStaff',
  );
  const response = await callable(input);
  return response.data;
}
