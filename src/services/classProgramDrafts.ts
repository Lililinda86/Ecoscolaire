import {
  doc,
  runTransaction,
  deleteField,
  getDoc,
  type DocumentReference
} from 'firebase/firestore';
import { db as firestoreDb } from '../db/firebase';
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
  | 'DRAFT_SAVE_FAILED';

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

interface CreateInitialParams {
  schoolId: string;
  academicYearId: string;
  classId: string;
  userId: string;
}

export async function createInitialClassProgram({
  schoolId,
  academicYearId,
  classId,
  userId
}: CreateInitialParams): Promise<ClassProgram> {
  const programId = buildClassProgramId(schoolId, academicYearId, classId);
  const programRef = doc(firestoreDb, 'classPrograms', programId);

  try {
    const newProgram = await runTransaction(firestoreDb, async (transaction) => {
      const programSnap = await transaction.get(programRef);
      if (programSnap.exists()) {
        throw new ClassProgramDraftError('DRAFT_PROGRAM_ALREADY_EXISTS', 'Le programme de cette classe existe déjà.');
      }

      const now = new Date().toISOString();
      const docData: ClassProgram = {
        id: programId,
        schoolId,
        classId,
        academicYearId,
        status: 'draft',
        draftRevisionId: `${programId}__v1`,
        draftRevisionNumber: 1,
        hasUnpublishedChanges: true,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId
      };

      transaction.set(programRef, docData);
      return docData;
    });

    return newProgram;
  } catch (err: unknown) {
    if (err instanceof ClassProgramDraftError) throw err;
    const errObj = err as { code?: string; message?: string };
    if (errObj?.code === 'permission-denied') {
      throw new ClassProgramDraftError('DRAFT_PERMISSION_DENIED', 'Permissions insuffisantes pour créer le programme.');
    }

    // Double check if the document now exists due to race/concurrency
    try {
      const doubleCheck = await getDoc(programRef);
      if (doubleCheck.exists()) {
        throw new ClassProgramDraftError('DRAFT_PROGRAM_ALREADY_EXISTS', 'Le programme de cette classe existe déjà.');
      }
    } catch {
      // Ignore check errors
    }

    if (errObj?.message?.includes('already-exists') || errObj?.code === 'already-exists') {
      throw new ClassProgramDraftError('DRAFT_PROGRAM_ALREADY_EXISTS', 'Le programme de cette classe existe déjà.');
    }
    throw new ClassProgramDraftError('DRAFT_SAVE_FAILED', errObj?.message || 'Erreur lors de la création du programme.');
  }
}

interface SaveClassProgramDraftParams {
  program: ClassProgram;
  originalSubjects: ClassSubject[];
  editedSubjects: ClassSubject[];
  userId: string;
}

export async function saveClassProgramDraft({
  program,
  originalSubjects,
  editedSubjects,
  userId
}: SaveClassProgramDraftParams): Promise<void> {
  const programRef = doc(firestoreDb, 'classPrograms', program.id);

  try {
    await runTransaction(firestoreDb, async (transaction) => {
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

      const allSubjectIds = new Set<string>();
      originalSubjects.forEach(s => allSubjectIds.add(s.id));
      editedSubjects.forEach(s => allSubjectIds.add(s.id));

      for (const id of allSubjectIds) {
        const sRef = doc(firestoreDb, 'classSubjects', id);
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

        if (isNew) {
          if (snap) {
            if (!snap.isActive) {
              transaction.update(subjectRefs[edited.id], {
                isActive: true,
                updatedAt: now,
                updatedBy: userId
              });
            } else {
              throw new ClassProgramDraftError('DRAFT_CONFLICT', `La matière ${edited.subjectNameSnapshot} existe déjà dans le programme.`);
            }
          } else {
            const newDoc: ClassSubject = {
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

            transaction.set(subjectRefs[edited.id], newDoc);
          }
        } else {
          const original = originalSubjects.find(orig => orig.id === edited.id)!;
          const hasChanges =
            original.coefficient !== edited.coefficient ||
            original.weeklyHours !== edited.weeklyHours ||
            original.isRequired !== edited.isRequired ||
            original.displayOrder !== edited.displayOrder ||
            original.isActive !== edited.isActive;

          if (hasChanges && snap) {
            const updates: Record<string, unknown> = {
              isRequired: edited.isRequired,
              displayOrder: edited.displayOrder,
              isActive: edited.isActive,
              updatedAt: now,
              updatedBy: userId
            };

            // Field deletion handling
            if (edited.coefficient === undefined) {
              if (original.coefficient !== undefined) {
                updates.coefficient = deleteField();
              }
            } else {
              updates.coefficient = edited.coefficient;
            }

            if (edited.weeklyHours === undefined) {
              if (original.weeklyHours !== undefined) {
                updates.weeklyHours = deleteField();
              }
            } else {
              updates.weeklyHours = edited.weeklyHours;
            }

            transaction.update(subjectRefs[edited.id], updates);
          }
        }
      }
    });
  } catch (err: unknown) {
    if (err instanceof ClassProgramDraftError) throw err;
    const errObj = err as { code?: string; message?: string };
    if (errObj?.code === 'permission-denied') {
      throw new ClassProgramDraftError('DRAFT_PERMISSION_DENIED', 'Permissions insuffisantes pour enregistrer le brouillon.');
    }
    throw new ClassProgramDraftError('DRAFT_SAVE_FAILED', errObj?.message || 'Erreur lors de la sauvegarde du brouillon.');
  }
}
