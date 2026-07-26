import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClassProgram, ClassSubject, ClassSection, GlobalRole, Subject } from '../types';
import {
  getClassProgramByIdentity,
  getClassSubjectsByRevision
} from '../services/classPrograms';
import type { ClassProgramErrorType } from '../services/classPrograms';
import { resolveClassProgramHookState } from '../services/classProgramHookStateResolver';

export interface UseClassProgramProps {
  schoolId: string | undefined;
  academicYearId: string | null;
  selectedClass: ClassSection | null;
  currentRole: GlobalRole | undefined;
  requestedView: 'published' | 'draft';
}

export interface UseClassProgramResult {
  status: 'idle' | 'loading' | 'success' | 'error' | 'forbidden';
  program: ClassProgram | null;
  subjects: ClassSubject[];
  source: 'published' | 'draft' | 'legacy' | 'none';
  visibleRevisionId: string | null;
  hasPublishedVersion: boolean;
  hasDraftVersion: boolean;
  hasUnpublishedChanges: boolean;
  errorCode: ClassProgramErrorType | 'LEGACY_MISSING' | null;
  retry: () => void;
}

export type ClassProgramAccessMode = 'manager' | 'read-only' | 'forbidden';

import { canManageAcademicPrograms } from '../utils/academicPermissions';

export function getClassProgramAccessMode(role: string | undefined): ClassProgramAccessMode {
  if (!role) return 'forbidden';
  if (canManageAcademicPrograms(role)) return 'manager';
  if (role === 'teacher') return 'read-only';
  return 'forbidden';
}

export function useClassProgram({
  schoolId,
  academicYearId,
  selectedClass,
  currentRole,
  requestedView
}: UseClassProgramProps): UseClassProgramResult {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'forbidden'>('idle');
  const [program, setProgram] = useState<ClassProgram | null>(null);
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [source, setSource] = useState<'published' | 'draft' | 'legacy' | 'none'>('none');
  const [visibleRevisionId, setVisibleRevisionId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ClassProgramErrorType | 'LEGACY_MISSING' | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const requestSeq = useRef<number>(0);

  const retry = useCallback(() => {
    setRetryTrigger((prev) => prev + 1);
  }, []);

  const classId = selectedClass?.id;
  const legacySubjectsString = selectedClass?.subjects?.join(',') || '';

  useEffect(() => {
    // 1. Reset state immediately on inputs change to avoid displaying stale data
    setStatus('idle');
    setProgram(null);
    setSubjects([]);
    setSource('none');
    setVisibleRevisionId(null);
    setErrorCode(null);

    // 2. Access control check
    const accessMode = getClassProgramAccessMode(currentRole);
    if (accessMode === 'forbidden') {
      setStatus('forbidden');
      return;
    }

    if (!schoolId || !academicYearId || !classId) {
      return;
    }

    const currentSeq = ++requestSeq.current;
    setStatus('loading');

    const isManager = accessMode === 'manager';
    const isReadOnlyRole = accessMode === 'read-only';

    async function loadData() {
      try {
        // Fetch ClassProgram using query identity instead of direct getDoc
        let prog: ClassProgram | null = null;
        try {
          prog = await getClassProgramByIdentity({
            schoolId: schoolId!,
            academicYearId: academicYearId!,
            classId: classId!
          });
        } catch (err: unknown) {
          if (currentSeq !== requestSeq.current) return;
          throw err;
        }

        if (currentSeq !== requestSeq.current) return;

        const resolvedState = resolveClassProgramHookState({
          program: prog,
          isReadOnlyRole,
          isManager,
          requestedView,
          legacySubjectsCount: legacySubjectsString ? legacySubjectsString.split(',').filter(Boolean).length : 0
        });

        if (resolvedState.source === 'legacy') {
          handleLegacyFallback(currentSeq);
          return;
        }

        if (resolvedState.source === 'none' && !resolvedState.visibleRevisionId) {
          setProgram(resolvedState.program);
          setSubjects([]);
          setSource('none');
          setVisibleRevisionId(null);
          setStatus('success');
          return;
        }

        const targetRevisionId = resolvedState.visibleRevisionId!;

        // Fetch subjects
        const list = await getClassSubjectsByRevision(schoolId!, prog!.id, targetRevisionId);
        if (currentSeq !== requestSeq.current) return;

        setProgram(prog);
        setSubjects(list);
        setSource(resolvedState.source as 'published' | 'draft');
        setVisibleRevisionId(targetRevisionId);
        setStatus('success');
      } catch (err: unknown) {
        if (currentSeq !== requestSeq.current) return;

        console.error('Error in useClassProgram:', err);
        const errObj = err as Record<string, unknown>;
        setErrorCode((errObj?.code as ClassProgramErrorType) || 'FIRESTORE_ERROR');
        setStatus('error');
      }
    }

    // Helper for legacy class.subjects fallback resolution
    function handleLegacyFallback(seq: number) {
      if (seq !== requestSeq.current) return;

      const legacySubjectIds = legacySubjectsString ? legacySubjectsString.split(',') : [];
      if (legacySubjectIds.length === 0) {
        setSource('none');
        setStatus('success');
        return;
      }

      setSource('legacy');
      setStatus('success');
    }

    loadData();
  }, [schoolId, academicYearId, classId, legacySubjectsString, currentRole, requestedView, retryTrigger]);

  const hasPublishedVersion = !!program?.publishedRevisionId && program.publishedRevisionId !== '';
  const hasDraftVersion = !!program?.draftRevisionId && program.draftRevisionId !== '';
  const hasUnpublishedChanges = !!program?.hasUnpublishedChanges;

  return {
    status,
    program,
    subjects,
    source,
    visibleRevisionId,
    hasPublishedVersion,
    hasDraftVersion,
    hasUnpublishedChanges,
    errorCode,
    retry
  };
}

export interface ResolveLegacyClassSubjectsProps {
  subjectIds: string[];
  subjects: Subject[];
  activeSchoolId: string | undefined;
}

export interface ResolvedLegacySubject {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isMissing: boolean;
}

export function resolveLegacyClassSubjects({
  subjectIds,
  subjects,
  activeSchoolId
}: ResolveLegacyClassSubjectsProps): ResolvedLegacySubject[] {
  if (!subjectIds) return [];

  return subjectIds.map((id) => {
    const matches = subjects.filter((s) => s.id === id);
    if (matches.length === 0) {
      return {
        id,
        code: '',
        name: 'Matière historique introuvable',
        isActive: false,
        isMissing: true
      };
    }

    const allowedMatches = matches.filter((s) => !s.schoolId || s.schoolId === activeSchoolId);
    if (allowedMatches.length === 0) {
      return {
        id,
        code: '',
        name: 'Matière historique introuvable',
        isActive: false,
        isMissing: true
      };
    }

    const schoolSpecific = allowedMatches.find((s) => s.schoolId === activeSchoolId);
    const chosen = schoolSpecific || allowedMatches[0];

    return {
      id: chosen.id,
      code: chosen.code || '',
      name: chosen.name,
      isActive: chosen.isActive !== false,
      isMissing: false
    };
  });
}
