import { describe, expect, it } from 'vitest';
import { transition, TransitionDeniedError, FixtureRunState } from '../src/stateMachine';

const ALL_STATES: (FixtureRunState | null)[] = [null, 'PREPARED', 'RUNNING', 'CLEANING', 'VERIFIED'];

describe('stateMachine', () => {
  it('prepare: only allowed from no manifest (null) -> PREPARED', () => {
    expect(transition(null, 'prepare')).toBe('PREPARED');
    for (const state of ['PREPARED', 'RUNNING', 'CLEANING', 'VERIFIED'] as const) {
      expect(() => transition(state, 'prepare')).toThrowError(TransitionDeniedError);
    }
  });

  it('inspect: PREPARED->RUNNING and RUNNING->RUNNING allowed; others denied', () => {
    expect(transition('PREPARED', 'inspect')).toBe('RUNNING');
    expect(transition('RUNNING', 'inspect')).toBe('RUNNING');
    for (const state of [null, 'CLEANING', 'VERIFIED'] as const) {
      expect(() => transition(state, 'inspect')).toThrowError(TransitionDeniedError);
    }
  });

  it('cleanup: PREPARED/RUNNING/CLEANING -> CLEANING; VERIFIED -> VERIFIED no-op; null denied', () => {
    expect(transition('PREPARED', 'cleanup')).toBe('CLEANING');
    expect(transition('RUNNING', 'cleanup')).toBe('CLEANING');
    expect(transition('CLEANING', 'cleanup')).toBe('CLEANING');
    expect(transition('VERIFIED', 'cleanup')).toBe('VERIFIED');
    expect(() => transition(null, 'cleanup')).toThrowError(TransitionDeniedError);
  });

  it('verify: CLEANING + zero residuals -> VERIFIED', () => {
    expect(transition('CLEANING', 'verify', { allResidualsZero: true })).toBe('VERIFIED');
  });

  it('verify: CLEANING + non-zero residuals stays CLEANING (no throw, fail reported by caller)', () => {
    expect(transition('CLEANING', 'verify', { allResidualsZero: false })).toBe('CLEANING');
    expect(transition('CLEANING', 'verify')).toBe('CLEANING');
  });

  it('verify: VERIFIED -> VERIFIED no-op regardless of residual flag', () => {
    expect(transition('VERIFIED', 'verify', { allResidualsZero: false })).toBe('VERIFIED');
    expect(transition('VERIFIED', 'verify', { allResidualsZero: true })).toBe('VERIFIED');
  });

  it('verify: denied from null/PREPARED/RUNNING', () => {
    for (const state of [null, 'PREPARED', 'RUNNING'] as const) {
      expect(() => transition(state, 'verify', { allResidualsZero: true })).toThrowError(TransitionDeniedError);
    }
  });

  it('every reverse/undocumented transition is denied', () => {
    const allowed = new Set([
      'null:prepare', 'PREPARED:inspect', 'RUNNING:inspect',
      'PREPARED:cleanup', 'RUNNING:cleanup', 'CLEANING:cleanup', 'VERIFIED:cleanup',
      'CLEANING:verify', 'VERIFIED:verify',
    ]);
    for (const state of ALL_STATES) {
      for (const action of ['prepare', 'inspect', 'cleanup', 'verify'] as const) {
        const key = `${state ?? 'null'}:${action}`;
        if (allowed.has(key)) continue;
        expect(() => transition(state, action, { allResidualsZero: true })).toThrowError(TransitionDeniedError);
      }
    }
  });
});
