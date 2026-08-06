import { getFirestore, doc, runTransaction, type Firestore, type DocumentReference, deleteField } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import type { ClassProgram, ClassSubject } from '../types';

export type ClassProgramDraftErrorType =
  | 'DRAFT_PERMISSION_DENIED'
  | 'DRAFT_PROGRAM_ALREADY_EXISTS'
  | 'DRAFT_PROGRAM_NOT_FOUND'
  | 'DRAFT_NOT_ACTIVE'
  | 'DRAFT_REVISION_CHANGED'
  | 'DRAFT_CONFLICT'
  | 'DRAFT_SUBJECT_INACTIVE'
  | 'DRAFT_SUBJECT_NOT_FOUND'
  | 'DRAFT_SUBJECT_INVALID'
  | 'DRAFT_INTEGRITY_ERROR'
  | 'DRAFT_SAVE_FAILED'
  | 'DRAFT_VALIDATION_ERROR'
  | 'DRAFT_PRECONDITION_FAILED'
  | 'DRAFT_NETWORK_ERROR';

export class ClassProgramDraftError extends Error {
  public code: ClassProgramDraftErrorType;
  constructor(code: ClassProgramDraftErrorType, message: string) {
    super(message);
    this.code = code;
    this.name = 'ClassProgramDraftError';
  }
}

export function buildClassProgramId(schoolId: string, academicYearId: string, classId: string): string {
  return `${schoolId}__${academicYearId}__${classId}`;
}

export function buildClassSubjectId(revisionId: string, subjectId: string): string {
  return `${revisionId}__${subjectId}`;
}

interface SaveClassProgramDraftParams {
  program: ClassProgram;
  originalSubjects: ClassSubject[];
  editedSubjects: ClassSubject[];
  userId: string;
  deps?: {
    db?: unknown;
    runTransaction?: unknown;
    doc?: unknown;
    deleteField?: unknown;
  };
}

export async function saveClassProgramDraft({
  program,
  originalSubjects,
  editedSubjects,
  userId,
  deps
}: SaveClassProgramDraftParams): Promise<void> {
  const firestoreDb = (deps?.db as Firestore) || getFirestore(getApp());
  const docFn = (deps?.doc as typeof doc) || doc;
  const runTransactionFn = (deps?.runTransaction as typeof runTransaction) || runTransaction;
  const deleteFieldFn = (deps?.deleteField as typeof deleteField) || deleteField;

  const programRef = docFn(firestoreDb, 'classPrograms', program.id);

  try {
    await runTransactionFn(firestoreDb, async (transaction) => {
      // PHASE 1 & 2 — Références et Lectures
      const programSnap = await transaction.get(programRef);
      if (!programSnap.exists()) {
        throw new ClassProgramDraftError('DRAFT_PROGRAM_NOT_FOUND', 'Le programme associé est introuvable.');
      }

      const currentProgram = programSnap.data() as ClassProgram;

      // PHASE 3 — Validations
      if (
        currentProgram.draftRevisionId !== program.draftRevisionId ||
        currentProgram.draftRevisionNumber !== program.draftRevisionNumber
      ) {
        throw new ClassProgramDraftError('DRAFT_REVISION_CHANGED', 'La révision du brouillon a changé entre-temps.');
      }

      const originalSnaps: { [id: string]: ClassSubject | null } = {};
      const subjectRefs: { [id: string]: DocumentReference } = {};

      const allSubjectIds = getSubjectIdsToFetch(originalSubjects, editedSubjects);

      for (const id of allSubjectIds) {
        const sRef = docFn(firestoreDb, 'classSubjects', id);
        subjectRefs[id] = sRef;
        const sSnap = await transaction.get(sRef);
        if (sSnap.exists()) {
          originalSnaps[id] = sSnap.data() as ClassSubject;
        } else {
          originalSnaps[id] = null;
        }
      }

      for (const orig of originalSubjects) {
        const snap = originalSnaps[orig.id];
        if (!snap) {
          throw new ClassProgramDraftError('DRAFT_CONFLICT', `La matière ${orig.subjectNameSnapshot} a été supprimée par un autre utilisateur.`);
        }
        if (snap.updatedAt !== orig.updatedAt) {
          throw new ClassProgramDraftError('DRAFT_CONFLICT', `La matière ${orig.subjectNameSnapshot} a été modifiée par un autre utilisateur.`);
        }
      }

      // PHASE 4 — Écritures
      const now = new Date().toISOString();

      for (const edited of editedSubjects) {
        const snap = originalSnaps[edited.id];
        const isNew = !originalSubjects.some(orig => orig.id === edited.id);
        const original = originalSubjects.find(orig => orig.id === edited.id) || null;

        let sRef = subjectRefs[edited.id];
        if (!sRef) {
          sRef = docFn(firestoreDb, 'classSubjects', edited.id);
        }

        const mutation = buildClassSubjectMutation(edited, snap || null, original, isNew, userId, now, deleteFieldFn);

        if (mutation) {
          if (mutation.type === 'set') {
            transaction.set(sRef, mutation.payload as unknown);
          } else if (mutation.type === 'update') {
            transaction.update(sRef, mutation.payload);
          }
        }
      }
    });
  } catch (err: unknown) {
    if (err instanceof ClassProgramDraftError) throw err;
    throw mapClassProgramDraftError(err);
  }
}

export function getSubjectIdsToFetch(originalSubjects: ClassSubject[], editedSubjects: ClassSubject[]): Set<string> {
  const allSubjectIds = new Set<string>();
  originalSubjects.forEach(s => allSubjectIds.add(s.id));
  editedSubjects.forEach(s => {
    const isNew = !originalSubjects.some(orig => orig.id === s.id);
    if (!isNew) {
      allSubjectIds.add(s.id);
    }
  });
  return allSubjectIds;
}

export function buildClassSubjectMutation(
  edited: ClassSubject,
  snap: ClassSubject | null,
  original: ClassSubject | null,
  isNew: boolean,
  userId: string,
  now: string,
  deleteSentinel: () => unknown
): { type: 'set' | 'update'; payload: Record<string, unknown> } | null {
  if (isNew) {
    if (snap) {
      if (!snap.isActive) {
        const updates: Record<string, unknown> = {
          isActive: true,
          isRequired: edited.isRequired,
          displayOrder: edited.displayOrder,
          updatedAt: now,
          updatedBy: userId
        };

        if (edited.coefficient === undefined) {
          if (snap.coefficient !== undefined) updates.coefficient = deleteSentinel();
        } else {
          updates.coefficient = edited.coefficient;
        }

        if (edited.weeklyHours === undefined) {
          if (snap.weeklyHours !== undefined) updates.weeklyHours = deleteSentinel();
        } else {
          updates.weeklyHours = edited.weeklyHours;
        }

        return { type: 'update', payload: updates };
      } else {
        throw new ClassProgramDraftError('DRAFT_CONFLICT', `La matière ${edited.subjectNameSnapshot} existe déjà dans le programme.`);
      }
    } else {
      const newDoc: Record<string, unknown> = {
        id: edited.id,
        programId: edited.programId,
        schoolId: edited.schoolId,
        classId: edited.classId,
        academicYearId: edited.academicYearId,
        subjectId: edited.subjectId,
        revisionId: edited.revisionId,
        revisionNumber: edited.revisionNumber,
        subjectNameSnapshot: edited.subjectNameSnapshot,
        isRequired: edited.isRequired,
        isActive: edited.isActive,
        displayOrder: edited.displayOrder,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId
      };

      if (edited.subjectCodeSnapshot !== undefined) {
        newDoc.subjectCodeSnapshot = edited.subjectCodeSnapshot;
      }
      if (edited.coefficient !== undefined) {
        newDoc.coefficient = edited.coefficient;
      }
      if (edited.weeklyHours !== undefined) {
        newDoc.weeklyHours = edited.weeklyHours;
      }

      return { type: 'set', payload: newDoc };
    }
  } else {
    if (!original || !snap) return null;
    const hasChanges =
      original.coefficient !== edited.coefficient ||
      original.weeklyHours !== edited.weeklyHours ||
      original.isRequired !== edited.isRequired ||
      original.displayOrder !== edited.displayOrder ||
      original.isActive !== edited.isActive;

    if (hasChanges) {
      const updates: Record<string, unknown> = {
        isRequired: edited.isRequired,
        displayOrder: edited.displayOrder,
        isActive: edited.isActive,
        updatedAt: now,
        updatedBy: userId
      };

      if (edited.coefficient === undefined) {
        if (original.coefficient !== undefined) {
          updates.coefficient = deleteSentinel();
        }
      } else {
        updates.coefficient = edited.coefficient;
      }

      if (edited.weeklyHours === undefined) {
        if (original.weeklyHours !== undefined) {
          updates.weeklyHours = deleteSentinel();
        }
      } else {
        updates.weeklyHours = edited.weeklyHours;
      }

      return { type: 'update', payload: updates };
    }
    return null;
  }
}

export function mapClassProgramDraftError(err: unknown): ClassProgramDraftError {
  const errObj = err as { code?: string; message?: string };
  if (errObj?.code === 'permission-denied') {
    return new ClassProgramDraftError('DRAFT_PERMISSION_DENIED', 'Vous n’avez pas l’autorisation d’enregistrer ce programme.');
  }
  if (errObj?.code === 'invalid-argument') {
    return new ClassProgramDraftError('DRAFT_VALIDATION_ERROR', errObj.message || 'Données invalides.');
  }
  if (errObj?.code === 'failed-precondition') {
    return new ClassProgramDraftError('DRAFT_PRECONDITION_FAILED', errObj.message || 'Précondition non satisfaite.');
  }
  if (errObj?.code === 'aborted' || errObj?.code === 'conflict') {
    return new ClassProgramDraftError('DRAFT_CONFLICT', 'Le brouillon a été modifié ailleurs. Rechargez la page.');
  }
  if (errObj?.code === 'unavailable') {
    return new ClassProgramDraftError('DRAFT_NETWORK_ERROR', 'Impossible de joindre le service. Réessayez.');
  }
  return new ClassProgramDraftError('DRAFT_SAVE_FAILED', errObj?.message || 'Erreur lors de la sauvegarde du brouillon.');
}
