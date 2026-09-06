import { describe, expect, it } from 'vitest';
import { nextRemediationStatus, type RemediationAction, type RemediationStatus } from '../../functions/src/pedagogy/remediationPolicy';
describe('teacher-declared remediation transitions', () => {
  const allowed = { 'proposed:APPROVE': 'approved', 'approved:COMPLETE': 'completed', 'completed:REVIEW': 'reviewed', 'proposed:CANCEL': 'cancelled', 'approved:CANCEL': 'cancelled' };
  for (const status of ['proposed', 'approved', 'completed', 'reviewed', 'cancelled'] as RemediationStatus[]) {
    for (const action of ['APPROVE', 'COMPLETE', 'REVIEW', 'CANCEL'] as RemediationAction[]) {
      it(`${status} -> ${action}`, () => {
        const expected = allowed[`${status}:${action}` as keyof typeof allowed];
        if (expected) expect(nextRemediationStatus(status, action)).toBe(expected);
        else expect(() => nextRemediationStatus(status, action)).toThrow('REMEDIATION_TRANSITION_NOT_ALLOWED');
      });
    }
  }
});
