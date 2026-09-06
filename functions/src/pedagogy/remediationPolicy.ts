export type RemediationStatus = 'proposed' | 'approved' | 'completed' | 'reviewed' | 'cancelled';
export type RemediationAction = 'APPROVE' | 'COMPLETE' | 'REVIEW' | 'CANCEL';
export function nextRemediationStatus(status: RemediationStatus, action: RemediationAction): RemediationStatus {
  if (action === 'APPROVE' && status === 'proposed') return 'approved';
  if (action === 'COMPLETE' && status === 'approved') return 'completed';
  if (action === 'REVIEW' && status === 'completed') return 'reviewed';
  if (action === 'CANCEL' && ['proposed', 'approved'].includes(status)) return 'cancelled';
  throw new Error('REMEDIATION_TRANSITION_NOT_ALLOWED');
}
export const REMEDIATION_OUTCOMES = ['progress_observed', 'continue_support', 'insufficient_evidence'] as const;
