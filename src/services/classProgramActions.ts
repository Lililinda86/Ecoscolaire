export type ActionType = 'create-program' | 'create-modification-draft' | 'edit-draft' | 'none';

export function determineProgramAction({
  status,
  source,
  program,
  isManager
}: {
  status: 'idle' | 'loading' | 'success' | 'error' | 'forbidden';
  source: 'published' | 'draft' | 'legacy' | 'none';
  program: {
    publishedRevisionId?: string | null;
    draftRevisionId?: string | null;
    hasUnpublishedChanges?: boolean;
  } | null;
  isManager: boolean;
}): ActionType {
  if (status === 'loading' || status === 'idle' || status === 'error' || status === 'forbidden') {
    return 'none';
  }

  if (!isManager) {
    return 'none';
  }

  if (source === 'legacy') {
    return 'none';
  }

  if (source === 'none' || !program) {
    return 'create-program';
  }

  const hasPub = !!program.publishedRevisionId && program.publishedRevisionId !== '';
  const hasDraft = !!program.draftRevisionId && program.draftRevisionId !== '';

  if (hasPub && !hasDraft) {
    return 'create-modification-draft';
  }

  if (hasDraft) {
    return 'edit-draft';
  }

  return 'none';
}
