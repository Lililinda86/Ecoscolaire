/**
 * Fail-closed runtime identity guard. The broker must be structurally incapable
 * of operating anywhere except the exact Staging project, and must explicitly
 * reject Production and the real ITALO school regardless of caller input.
 */

export const STAGING_PROJECT_ID = 'ecoscolaire-staging' as const;
export const PRODUCTION_PROJECT_ID = 'ecoscolaire-c5861' as const;
export const REAL_ITALO_SCHOOL_ID = 'italo-gsb' as const;

export class RuntimeGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuntimeGuardError';
    this.code = code;
  }
}

/**
 * All runtime project identifiers the process can observe. Every field that is
 * present must agree with STAGING_PROJECT_ID; there is no fallback/default project.
 */
export interface RuntimeProjectContext {
  readonly projectId?: string | null;
  readonly gcloudProject?: string | null;
  readonly googleCloudProject?: string | null;
  readonly functionsConfigProjectId?: string | null;
}

const containsItaloReference = (value: unknown, seen: WeakSet<object> = new WeakSet()): boolean => {
  if (typeof value === 'string') {
    return value.toLowerCase().includes(REAL_ITALO_SCHOOL_ID);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => containsItaloReference(entry, seen));
  }
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some((entry) => containsItaloReference(entry, seen));
  }
  return false;
};

/** Defense-in-depth: reject any payload referencing the real ITALO school anywhere in its structure. */
export const assertNoItaloReference = (value: unknown): void => {
  if (containsItaloReference(value)) {
    throw new RuntimeGuardError('REAL_ITALO_SCHOOL_REFERENCED', 'Reference to the real ITALO school is forbidden.');
  }
};

const identifiersOf = (context: RuntimeProjectContext): (string | null | undefined)[] => [
  context.projectId,
  context.gcloudProject,
  context.googleCloudProject,
  context.functionsConfigProjectId,
];

/**
 * Throws unless every available runtime project identifier is present and exactly
 * equal to ecoscolaire-staging. No fallback project is ever assumed.
 */
export const assertStagingRuntime = (context: RuntimeProjectContext): void => {
  const identifiers = identifiersOf(context);

  if (identifiers.every((identifier) => identifier === undefined || identifier === null)) {
    throw new RuntimeGuardError('NO_RUNTIME_PROJECT_IDENTIFIER', 'No runtime project identifier is available.');
  }

  for (const identifier of identifiers) {
    if (identifier === undefined || identifier === null) continue;
    if (identifier === PRODUCTION_PROJECT_ID) {
      throw new RuntimeGuardError('PRODUCTION_PROJECT_REJECTED', 'Production project is explicitly rejected.');
    }
    if (identifier !== STAGING_PROJECT_ID) {
      throw new RuntimeGuardError('WRONG_PROJECT', `Unexpected runtime project: ${identifier}`);
    }
  }

  const present = identifiers.filter((identifier): identifier is string => typeof identifier === 'string');
  const distinct = new Set(present);
  if (distinct.size > 1) {
    throw new RuntimeGuardError('PROJECT_IDENTIFIER_MISMATCH', 'Runtime project identifiers disagree.');
  }

  assertNoItaloReference(context);
};
