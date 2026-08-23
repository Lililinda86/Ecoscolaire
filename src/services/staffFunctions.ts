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
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as unknown as StaffMutationInput;
  const response = await callable(payload);
  return response.data;
}
