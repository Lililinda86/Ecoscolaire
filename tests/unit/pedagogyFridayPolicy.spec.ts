import { describe, expect, it } from 'vitest';
import { fridayWindow, fridayTrialClock, parseFridayPolicy } from '../../functions/src/pedagogy/fridayPolicy';
describe('Friday schedule policy', () => {
  it('expires the separate eight-stage fixture and never changes another school or project clock', () => {
    const now = new Date('2026-09-16T12:00:00Z');
    const school = 'pedagogy-preschool-automation-20260916';
    const config = { syntheticTrial: 'preschool-automation-2026-09-16', controlledTrialFriday: '2026-09-04T12:00:00Z' };
    expect(fridayTrialClock(now, 'ecoscolaire-staging', school, config).toISOString()).toBe('2026-09-04T12:00:00.000Z');
    for (const date of ['2026-09-15T23:59:59Z', '2026-09-24T00:00:00Z']) {
      const outside = new Date(date);
      expect(fridayTrialClock(outside, 'ecoscolaire-staging', school, config)).toBe(outside);
    }
    expect(fridayTrialClock(now, 'production', school, config)).toBe(now);
    expect(fridayTrialClock(now, 'ecoscolaire-staging', 'real-school', config)).toBe(now);
    expect(fridayTrialClock(now, 'ecoscolaire-staging', school, {})).toBe(now);
    expect(fridayTrialClock(now, 'ecoscolaire-staging', school, { ...config, controlledTrialFriday: '2026-09-11T12:00:00Z' })).toBe(now);
  });
  it('scopes the controlled clock to the exact approved Staging fixture', () => {
    const now = new Date('2026-09-08T12:00:00Z');
    const config = { syntheticTrial: 'synthetic-validation-2026-09-06', controlledTrialFriday: '2026-09-04T12:00:00Z' };
    expect(fridayTrialClock(now, 'ecoscolaire-staging', 'pedagogy-ai-validation-20260906', config).toISOString()).toBe('2026-09-04T12:00:00.000Z');
    expect(fridayTrialClock(now, 'ecoscolaire-staging', 'other-school', config)).toBe(now);
    expect(fridayTrialClock(now, 'other-project', 'pedagogy-ai-validation-20260906', config)).toBe(now);
    expect(fridayTrialClock(now, undefined, 'pedagogy-ai-validation-20260906', config)).toBe(now);
    expect(fridayTrialClock(now, 'ecoscolaire-staging', 'pedagogy-ai-validation-20260906', {})).toBe(now);
    expect(fridayTrialClock(now, 'ecoscolaire-staging', 'pedagogy-ai-validation-20260906', { ...config, controlledTrialFriday: '2026-09-11T12:00:00Z' })).toBe(now);
  });
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
