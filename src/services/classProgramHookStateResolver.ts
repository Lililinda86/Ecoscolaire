import type { ClassProgram } from '../types';

export interface SimulatedState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'forbidden';
  source: 'published' | 'draft' | 'legacy' | 'none';
  program: ClassProgram | null;
  subjects: unknown[];
  visibleRevisionId: string | null;
  errorCode: string | null;
}

export function resolveClassProgramHookState({
  program,
  isReadOnlyRole,
  isManager,
  requestedView,
  legacySubjectsCount
}: {
  program: ClassProgram | null;
  isReadOnlyRole: boolean;
  isManager: boolean;
  requestedView: 'published' | 'draft';
  legacySubjectsCount: number;
}): SimulatedState {
  if (program === null) {
    if (legacySubjectsCount === 0) {
      return {
        status: 'success',
        source: 'none',
        program: null,
        subjects: [],
        visibleRevisionId: null,
        errorCode: null
      };
    }
    return {
      status: 'success',
      source: 'legacy',
      program: null,
      subjects: [], // will resolve legacy subjects
      visibleRevisionId: null,
      errorCode: null
    };
  }

  const hasPub = !!program.publishedRevisionId && program.publishedRevisionId !== '';

  let targetRevisionId: string | undefined;
  let selectedSource: 'published' | 'draft' = 'published';

  if (isReadOnlyRole) {
    if (!hasPub) {
      if (legacySubjectsCount === 0) {
        return {
          status: 'success',
          source: 'none',
          program: null,
          subjects: [],
          visibleRevisionId: null,
          errorCode: null
        };
      }
      return {
        status: 'success',
        source: 'legacy',
        program: null,
        subjects: [],
        visibleRevisionId: null,
        errorCode: null
      };
    }
    targetRevisionId = program.publishedRevisionId;
    selectedSource = 'published';
  } else if (isManager) {
    if (requestedView === 'draft') {
      targetRevisionId = program.draftRevisionId;
      selectedSource = 'draft';
    } else {
      if (!hasPub) {
        targetRevisionId = program.draftRevisionId;
        selectedSource = 'draft';
      } else {
        targetRevisionId = program.publishedRevisionId;
        selectedSource = 'published';
      }
    }
  }

  if (!targetRevisionId) {
    return {
      status: 'success',
      source: 'none',
      program,
      subjects: [],
      visibleRevisionId: null,
      errorCode: null
    };
  }

  return {
    status: 'success',
    source: selectedSource,
    program,
    subjects: [], // loaded asynchronously
    visibleRevisionId: targetRevisionId,
    errorCode: null
  };
}
