import { describe, expect, it } from 'vitest';
import { fridayWindow, parseFridayPolicy } from '../../functions/src/pedagogy/fridayPolicy';
describe('Friday schedule policy', () => {
  const policy = { enabled: true, localTime: '10:00', classIds: ['synthetic-class'] };
  it('uses Douala rather than host time and never runs before the configured hour', () => {
    expect(fridayWindow(new Date('2026-09-11T08:59:00Z'), policy).due).toBe(false);
    expect(fridayWindow(new Date('2026-09-11T09:00:00Z'), policy)).toEqual({ date: '2026-09-11', due: true });
    expect(fridayWindow(new Date('2026-09-11T23:00:00Z'), policy).due).toBe(false);
    expect(fridayWindow(new Date('2026-09-10T09:00:00Z'), policy).due).toBe(false);
  });
  it('requires explicit activation, a valid local time and distinct configured classes', () => {
    expect(fridayWindow(new Date('2026-09-11T10:00:00Z'), { ...policy, enabled: false }).due).toBe(false);
    expect(() => parseFridayPolicy({ ...policy, localTime: '25:00' })).toThrow();
    expect(() => parseFridayPolicy({ ...policy, classIds: [] })).toThrow();
    expect(() => parseFridayPolicy({ ...policy, classIds: ['x', 'x'] })).toThrow();
    expect(parseFridayPolicy(policy)).toEqual(policy);
  });
});
