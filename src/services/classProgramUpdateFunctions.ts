import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';
import type { ClassProgram, ClassSubject } from '../types';
import { ClassProgramDraftError, mapClassProgramDraftError } from './classProgramDrafts';

export async function updateClassProgramDraft(program: ClassProgram, subjects: ClassSubject[]): Promise<void> {
  try {
    const callable = httpsCallable(functions, 'updateClassProgramDraft');
    await callable({
      schoolId: program.schoolId,
      academicYearId: program.academicYearId,
      classId: program.classId,
      expectedDraftRevisionId: program.draftRevisionId,
      subjects: subjects.map(subject => ({
        subjectId: subject.subjectId,
        ...(subject.coefficient === undefined ? {} : { coefficient: subject.coefficient }),
        ...(subject.weeklyHours === undefined ? {} : { weeklyHours: subject.weeklyHours }),
        isRequired: subject.isRequired,
        isActive: subject.isActive,
        displayOrder: subject.displayOrder,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof ClassProgramDraftError) throw error;
    const callableError = error as { details?: { businessCode?: string }; code?: string; message?: string };
    if (callableError.details?.businessCode) {
      throw new ClassProgramDraftError(
        callableError.details.businessCode === 'DRAFT_CHANGED' ? 'DRAFT_REVISION_CHANGED' : 'DRAFT_VALIDATION_ERROR',
        callableError.message || 'Impossible d’enregistrer le brouillon.',
      );
    }
    throw mapClassProgramDraftError(error);
  }
}
