import { useState, useEffect, useRef } from 'react';
import type { ClassProgram, ClassSubject, Subject } from '../types';
import {
  createInitialClassProgram,
  saveClassProgramDraft,
  buildClassSubjectId,
  ClassProgramDraftError
} from '../services/classProgramDrafts';
import { getClassProgramAccessMode } from './useClassProgram';
import { computeDraftStateToken } from '../utils/draftStateToken';

export interface UseClassProgramDraftProps {
  initialProgram: ClassProgram | null;
  initialSubjects: ClassSubject[];
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
  userId?: string;
  userRole?: string;
  onSaveSuccess?: (updatedProgram: ClassProgram, updatedSubjects: ClassSubject[]) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function useClassProgramDraft({
  initialProgram,
  initialSubjects,
  schoolId,
  academicYearId,
  classId,
  userId,
  userRole,
  onSaveSuccess,
  onDirtyChange
}: UseClassProgramDraftProps) {
  const accessMode = getClassProgramAccessMode(userRole);
  const isManager = accessMode === 'manager';

  const [program, setProgram] = useState<ClassProgram | null>(initialProgram);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [originalSubjects, setOriginalSubjects] = useState<ClassSubject[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [draftStateToken, setDraftStateToken] = useState<string | null>(null);
  const [isTokenCalculating, setIsTokenCalculating] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const tokenGenerationRef = useRef<number>(0);

  // Sync state with initial values
  useEffect(() => {
    setProgram(initialProgram);
    const activeSubjs = initialSubjects.filter(s => s.isActive);
    setSubjects(JSON.parse(JSON.stringify(activeSubjs)));
    setOriginalSubjects(JSON.parse(JSON.stringify(initialSubjects)));
    setIsDirty(false);
    setError(null);
    if (onDirtyChange) onDirtyChange(false);
    const nextGen = ++tokenGenerationRef.current;
    setIsTokenCalculating(true);
    setTokenError(null);
    setDraftStateToken(null);

    computeDraftStateToken(initialSubjects)
      .then((token) => {
        if (tokenGenerationRef.current === nextGen) {
          setDraftStateToken(token);
          setIsTokenCalculating(false);
        }
      })
      .catch((err) => {
        if (tokenGenerationRef.current === nextGen) {
          setTokenError(err.message || 'Erreur lors du calcul du token.');
          setIsTokenCalculating(false);
        }
      });
  }, [initialProgram, initialSubjects, onDirtyChange]);

  const updateDirtyState = (newSubjects: ClassSubject[]) => {
    // Check if new list differs from original active list
    const originalActive = originalSubjects.filter(s => s.isActive);

    let dirty = false;
    if (newSubjects.length !== originalActive.length) {
      dirty = true;
    } else {
      for (const ns of newSubjects) {
        const orig = originalActive.find(o => o.subjectId === ns.subjectId);
        if (!orig) {
          dirty = true;
          break;
        }
        if (
          orig.coefficient !== ns.coefficient ||
          orig.weeklyHours !== ns.weeklyHours ||
          orig.isRequired !== ns.isRequired ||
          orig.displayOrder !== ns.displayOrder
        ) {
          dirty = true;
          break;
        }
      }
    }

    setIsDirty(dirty);
    if (onDirtyChange) onDirtyChange(dirty);
  };

  const addSubject = (catalogSubject: Subject) => {
    if (!isManager || !program) return;

    if (subjects.some(s => s.subjectId === catalogSubject.id)) {
      return;
    }

    const previouslyPersisted = originalSubjects.find(s => s.subjectId === catalogSubject.id);

    let nextSubjects = [...subjects];
    if (previouslyPersisted) {
      const updated = subjects.map(s => s.subjectId === catalogSubject.id ? { ...s, isActive: true } : s);
      if (!updated.some(s => s.subjectId === catalogSubject.id)) {
        updated.push({ ...previouslyPersisted, isActive: true });
      }
      nextSubjects = updated;
    } else {
      const newId = buildClassSubjectId(program.draftRevisionId, catalogSubject.id);
      const newSubject: ClassSubject = {
        id: newId,
        programId: program.id,
        schoolId: program.schoolId,
        classId: program.classId,
        academicYearId: program.academicYearId,
        subjectId: catalogSubject.id,
        revisionId: program.draftRevisionId,
        revisionNumber: program.draftRevisionNumber,
        subjectNameSnapshot: catalogSubject.name,
        isRequired: true,
        isActive: true,
        displayOrder: subjects.length,
        createdAt: new Date().toISOString(),
        createdBy: userId || '',
        updatedAt: new Date().toISOString(),
        updatedBy: userId || ''
      };

      if (catalogSubject.code) {
        newSubject.subjectCodeSnapshot = catalogSubject.code;
      }

      nextSubjects.push(newSubject);
    }
    setSubjects(nextSubjects);
    updateDirtyState(nextSubjects);
  };

  const updateSubjectFields = (subjectId: string, fields: Partial<ClassSubject>) => {
    if (!isManager) return;
    const nextSubjects = subjects.map(s => {
      if (s.subjectId === subjectId) {
        const updated = { ...s };

        if (fields.coefficient !== undefined) {
          if (fields.coefficient === null) {
            delete updated.coefficient;
          } else {
            const val = typeof fields.coefficient === 'string' ? parseFloat(fields.coefficient) : fields.coefficient;
            if (!isNaN(val) && isFinite(val) && val >= 0) {
              updated.coefficient = val;
            }
          }
        }

        if (fields.weeklyHours !== undefined) {
          if (fields.weeklyHours === null) {
            delete updated.weeklyHours;
          } else {
            const val = typeof fields.weeklyHours === 'string' ? parseFloat(fields.weeklyHours) : fields.weeklyHours;
            if (!isNaN(val) && isFinite(val) && val >= 0) {
              updated.weeklyHours = val;
            }
          }
        }

        if (fields.isRequired !== undefined) {
          updated.isRequired = !!fields.isRequired;
        }

        return updated;
      }
      return s;
    });

    setSubjects(nextSubjects);
    updateDirtyState(nextSubjects);
  };

  const removeSubject = (subjectId: string) => {
    if (!isManager) return;

    const isPersisted = originalSubjects.some(s => s.subjectId === subjectId);
    let nextSubjects = [];

    if (isPersisted) {
      nextSubjects = subjects.map(s => s.subjectId === subjectId ? { ...s, isActive: false } : s);
    } else {
      nextSubjects = subjects.filter(s => s.subjectId !== subjectId);
    }

    setSubjects(nextSubjects);
    updateDirtyState(nextSubjects.filter(s => s.isActive));
  };

  const reorderSubjects = (startIndex: number, endIndex: number) => {
    if (!isManager) return;
    const result = Array.from(subjects);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    const updated = result.map((item, index) => ({
      ...item,
      displayOrder: index
    }));

    setSubjects(updated);
    updateDirtyState(updated);
  };

  const cancelChanges = () => {
    const activeSubjs = originalSubjects.filter(s => s.isActive);
    setSubjects(JSON.parse(JSON.stringify(activeSubjs)));
    setIsDirty(false);
    setError(null);
    if (onDirtyChange) onDirtyChange(false);
  };

  const createInitialProgram = async () => {
    if (!isManager || !schoolId || !academicYearId || !classId || !userId) return null;
    setIsSaving(true);
    setError(null);

    try {
      const newProgram = await createInitialClassProgram({
        schoolId,
        academicYearId,
        classId,
        userId
      });
      setProgram(newProgram);
      setSubjects([]);
      setOriginalSubjects([]);
      setIsDirty(false);
      if (onDirtyChange) onDirtyChange(false);
      return newProgram;
    } catch (err: unknown) {
      setError(err instanceof ClassProgramDraftError ? err.message : 'Erreur lors de la création du programme.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!isManager || !program || !userId) return;
    setIsSaving(true);
    setError(null);

    try {
      const finalSubjects: ClassSubject[] = [];

      const activeSubjs = subjects.filter(s => s.isActive);
      activeSubjs.forEach((s, idx) => {
        finalSubjects.push({
          ...s,
          displayOrder: idx
        });
      });

      originalSubjects.forEach(orig => {
        const isStillInList = subjects.some(s => s.subjectId === orig.subjectId);
        const isActiveInList = subjects.some(s => s.subjectId === orig.subjectId && s.isActive);

        if (isStillInList && !isActiveInList) {
          finalSubjects.push({
            ...orig,
            isActive: false,
            updatedAt: new Date().toISOString(),
            updatedBy: userId
          });
        } else if (!isStillInList && orig.isActive) {
          finalSubjects.push({
            ...orig,
            isActive: false,
            updatedAt: new Date().toISOString(),
            updatedBy: userId
          });
        }
      });

      await saveClassProgramDraft({
        program,
        originalSubjects,
        editedSubjects: finalSubjects,
        userId
      });

      setIsDirty(false);
      if (onDirtyChange) onDirtyChange(false);
      if (onSaveSuccess) {
        onSaveSuccess(program, finalSubjects);
      }
    } catch (err: unknown) {
      setError(err instanceof ClassProgramDraftError ? err.message : 'Erreur lors de l\'enregistrement du brouillon.');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    program,
    subjects: subjects.filter(s => s.isActive),
    isDirty,
    isSaving,
    error,
    draftStateToken,
    isTokenCalculating,
    tokenError,
    addSubject,
    updateSubjectFields,
    removeSubject,
    reorderSubjects,
    cancelChanges,
    saveDraft,
    createInitialProgram
  };
}
