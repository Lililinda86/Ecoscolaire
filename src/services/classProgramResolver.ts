import type { ClassProgram } from '../types';

export interface ResolveClassProgramParams {
  classPrograms: ClassProgram[];
  schoolId: string;
  classId: string;
  academicYearIds: string[];
  mode: 'any' | 'published';
}

export interface ResolveClassProgramResult {
  status: 'no_program' | 'success' | 'ambiguous_program';
  program: ClassProgram | null;
}

export function resolveClassProgram({
  classPrograms,
  schoolId,
  classId,
  academicYearIds,
  mode
}: ResolveClassProgramParams): ResolveClassProgramResult {
  if (!classPrograms || classPrograms.length === 0) {
    return { status: 'no_program', program: null };
  }

  // Find all programs for this school and class
  let candidates = classPrograms.filter(
    (p) => p.schoolId === schoolId && p.classId === classId
  );

  if (mode === 'published') {
    candidates = candidates.filter(
      (p) => p.status === 'published' && p.publishedRevisionId != null && p.publishedRevisionId !== ''
    );
  } else {
    // Mode any: accept published and drafts
    candidates = candidates.filter(
      (p) => p.status === 'published' || p.status === 'draft'
    );
  }

  // Exact match with active year
  const activeYearId = academicYearIds[0];
  const exactPrograms = candidates.filter((p) => p.academicYearId === activeYearId);

  if (exactPrograms.length === 1) {
    return { status: 'success', program: exactPrograms[0] };
  } else if (exactPrograms.length > 1) {
    return { status: 'ambiguous_program', program: null };
  }

  // Fallback match with equivalent years
  const fallbackPrograms = candidates.filter((p) => academicYearIds.includes(p.academicYearId));

  if (fallbackPrograms.length === 1) {
    return { status: 'success', program: fallbackPrograms[0] };
  } else if (fallbackPrograms.length > 1) {
    return { status: 'ambiguous_program', program: null };
  }

  return { status: 'no_program', program: null };
}
