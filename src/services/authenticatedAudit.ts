import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';

export type AuthenticatedAuditEvent = {
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, unknown>;
};

export const recordAuthenticatedAudit = async (event: AuthenticatedAuditEvent): Promise<string> => {
  const callable = httpsCallable<AuthenticatedAuditEvent, { auditId: string }>(
    functions,
    'recordAuthenticatedAudit'
  );
  const result = await callable(event);
  return result.data.auditId;
};
