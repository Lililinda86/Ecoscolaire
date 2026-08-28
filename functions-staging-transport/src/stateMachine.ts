/**
 * Explicit allow-list state machine for one Transport fixture release run.
 * `null` denotes "no manifest yet". Every transition not explicitly listed is denied.
 */

export type FixtureRunState = 'PREPARED' | 'RUNNING' | 'CLEANING' | 'VERIFIED';
export type FixtureRunAction = 'prepare' | 'inspect' | 'cleanup' | 'verify';

export class TransitionDeniedError extends Error {
  readonly from: FixtureRunState | null;
  readonly action: FixtureRunAction;

  constructor(from: FixtureRunState | null, action: FixtureRunAction) {
    super(`Transition denied: ${from ?? 'NONE'} + ${action}`);
    this.name = 'TransitionDeniedError';
    this.from = from;
    this.action = action;
  }
}

export interface TransitionOptions {
  /** Only meaningful for the 'verify' action: whether all residual categories are zero. */
  readonly allResidualsZero?: boolean;
}

/**
 * Returns the next state, or throws TransitionDeniedError. `verify` while CLEANING
 * with allResidualsZero=false intentionally does NOT throw: it stays CLEANING so the
 * caller can report the failure without corrupting run state.
 */
export const transition = (
  current: FixtureRunState | null,
  action: FixtureRunAction,
  options: TransitionOptions = {},
): FixtureRunState => {
  if (action === 'prepare') {
    if (current === null) return 'PREPARED';
    throw new TransitionDeniedError(current, action);
  }

  if (action === 'inspect') {
    if (current === 'PREPARED' || current === 'RUNNING') return 'RUNNING';
    throw new TransitionDeniedError(current, action);
  }

  if (action === 'cleanup') {
    if (current === 'PREPARED' || current === 'RUNNING' || current === 'CLEANING') return 'CLEANING';
    if (current === 'VERIFIED') return 'VERIFIED';
    throw new TransitionDeniedError(current, action);
  }

  if (action === 'verify') {
    if (current === 'CLEANING') return options.allResidualsZero ? 'VERIFIED' : 'CLEANING';
    if (current === 'VERIFIED') return 'VERIFIED';
    throw new TransitionDeniedError(current, action);
  }

  throw new TransitionDeniedError(current, action);
};
