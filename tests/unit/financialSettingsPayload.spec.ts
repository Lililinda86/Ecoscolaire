import { describe, expect, it } from 'vitest';
import type { School } from '../../src/types';
import { financialSettingsPayload, stableConfiguration } from '../../src/utils/financialSettingsPayload';

describe('Financial settings metadata preservation', () => {
  const school = { id: 'test', name: 'School', classFees: { CP: { registration: 15000, t1: 60000 } } } as School;
  it('does not treat a phone or secretary permission change as a tariff revision', () => {
    expect(stableConfiguration(financialSettingsPayload({ ...school, phone: 'test', transportPolicy: { secretaryManageAll: true } })))
      .toBe(stableConfiguration(financialSettingsPayload(school)));
  });
  it('preserves configured class amounts and detects their revision', () => {
    expect(financialSettingsPayload(school).classFees.CP.t1).toBe(60000);
    expect(stableConfiguration(financialSettingsPayload({ ...school, classFees: { CP: { t1: 65000 } } })))
      .not.toBe(stableConfiguration(financialSettingsPayload(school)));
  });
  it('ignores object key order, never values', () => {
    expect(stableConfiguration({ a: 1, b: 2 })).toBe(stableConfiguration({ b: 2, a: 1 }));
    expect(stableConfiguration({ a: 1 })).not.toBe(stableConfiguration({ a: 2 }));
  });
});
