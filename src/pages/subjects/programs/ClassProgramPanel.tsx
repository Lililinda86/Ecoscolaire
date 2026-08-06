import React, { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useClassProgram } from '../../../hooks/useClassProgram';
import { canManageAcademicPrograms } from '../../../utils/academicPermissions';
import { getActiveAcademicYearId } from '../../../utils/academicYearDeduplication';
import { normalizeClassCycle } from '../../../utils/classClassification';
import { ClassProgramSelectors } from './ClassProgramSelectors';
import { ClassProgramSummary } from './ClassProgramSummary';
import { ClassProgramTable } from './ClassProgramTable';
import { ClassProgramEmptyState } from './ClassProgramEmptyState';
import { ClassProgramEditor } from './editor/ClassProgramEditor';
import { ensureClassProgramDraft } from '../../../services/classProgramDraftFunctions';
import { determineProgramAction } from '../../../services/classProgramActions';
import type { TechnicalSpecialty } from '../../../types';

export const ClassProgramPanel: React.FC<{ onDirtyChange?: (isDirty: boolean) => void }> = ({ onDirtyChange }) => {
  const { db, currentUser, currentSchool, updateLocalState } = useAppContext();

  // Filters state
  const [sectionFilter, setSectionFilter] = useState<'all' | 'francophone' | 'anglophone'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | 'maternelle' | 'primaire' | 'secondaire'>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Manager view switcher: 'published' | 'draft'
  const [requestedView, setRequestedView] = useState<'published' | 'draft'>('published');

  // Edit mode state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState<boolean>(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const schoolId = db?.school?.id;
  const normalizedYear = React.useMemo(() => {
    return getActiveAcademicYearId(db?.academicYears, db?.school);
  }, [db?.academicYears, db?.school]);

  const classes = React.useMemo(() => db?.classes || [], [db?.classes]);
  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;

  const rawAcademicYear = db?.school?.academicYear || '';
  const activeYearName = React.useMemo(() => {
    if (!normalizedYear || !db?.academicYears) return rawAcademicYear;
    const y = db.academicYears.find(y => y.id === normalizedYear);
    return y ? y.name : rawAcademicYear;
  }, [normalizedYear, db?.academicYears, rawAcademicYear]);

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    setRequestedView('published');
    setIsEditing(false);
    setDraftError(null);
  };

  const handleCreateDraft = async () => {
    if (!schoolId || !normalizedYear || !selectedClassId) return;
    setIsCreatingDraft(true);
    setDraftError(null);
    try {
      const result = await ensureClassProgramDraft({
        schoolId,
        academicYearId: normalizedYear,
        classId: selectedClassId
      });

      // Si le programme n'est pas dǸj dans le state local, on le charge
      if (result && result.programId && db && db.classPrograms && !db.classPrograms.some(p => p.id === result.programId)) {
        const { getDoc, doc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('../../../db/firebase');
        const snap = await getDoc(doc(firestoreDb, 'classPrograms', result.programId));
        if (snap.exists()) {
          const newProgram = { id: snap.id, ...snap.data() } as import('../../../types').ClassProgram;
          updateLocalState(prev => {
            const current = prev.classPrograms || [];
            if (current.some(p => p.id === newProgram.id)) {
              return { classPrograms: current.map(p => p.id === newProgram.id ? newProgram : p) };
            }
            return { classPrograms: [...current, newProgram] };
          });
        }
      }

      // Force reload the program view
      retry();
      // Select draft view and open editor
      setRequestedView('draft');
      setIsEditing(true);
      if (onDirtyChange) {
        onDirtyChange(false);
      }
    } catch (err: unknown) {
      let errMessage = 'Le programme n’a pas pu être créé. Veuillez réessayer.';
      const errObj = err as Record<string, unknown>;
      const bCode = errObj?.details && typeof errObj.details === 'object' ? (errObj.details as Record<string, unknown>).businessCode : undefined;
      const code = errObj?.code;

      if (bCode === 'PROGRAM_INTEGRITY_ERROR') {
        errMessage = 'Les données du programme sont incohérentes.';
      } else if (bCode === 'CLASS_NOT_FOUND') {
        errMessage = 'La classe sélectionnée est introuvable.';
      } else if (code === 'permission-denied' || bCode === 'PERMISSION_DENIED') {
        errMessage = 'Vous n’êtes pas autorisé à créer le programme de cette classe.';
      } else if (err instanceof Error) {
        errMessage = err.message;
      }
      setDraftError(errMessage);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleSectionFilterChange = (value: 'all' | 'francophone' | 'anglophone') => {
    setSectionFilter(value);
    setIsEditing(false);
    if (selectedClassId) {
      const currentClass = classes.find((c) => c.id === selectedClassId);
      if (currentClass) {
        const sectionVal = currentClass.type || currentClass.section;
        const matchesSection =
          value === 'all' ||
          (value === 'francophone' && sectionVal === 'francophone') ||
          (value === 'anglophone' && sectionVal === 'anglophone');
        if (!matchesSection) {
          setSelectedClassId('');
        }
      }
    }
  };

  const handleCycleFilterChange = (value: 'all' | 'maternelle' | 'primaire' | 'secondaire') => {
    setCycleFilter(value);
    setIsEditing(false);
    if (selectedClassId) {
      const currentClass = classes.find((c) => c.id === selectedClassId);
      if (currentClass) {
        const normalized = normalizeClassCycle(currentClass);
        if (value !== 'all' && normalized !== value) {
          setSelectedClassId('');
        }
      }
    }
  };

  // Hook to fetch and resolve ClassProgram details
  const {
    status,
    subjects,
    program,
    source,
    hasPublishedVersion,
    hasDraftVersion,
    hasUnpublishedChanges,
    errorCode,
    retry
  } = useClassProgram({
    schoolId,
    academicYearId: normalizedYear,
    selectedClass,
    currentRole: currentUser?.role,
    requestedView
  });

  if (!currentUser || !db) return null;

  const isManager = canManageAcademicPrograms(currentUser.role);
  const isReadOnlyRole = currentUser.role === 'teacher';

  // If academic year is not configured correctly
  if (!normalizedYear) {
    return (
      <div style={{ padding: '2rem 0' }}>
        <ClassProgramEmptyState type="error" errorCode="FIRESTORE_ERROR" />
        <div style={{ textAlign: 'center', color: 'var(--danger)', fontWeight: 600, marginTop: '1rem' }}>
          L’année scolaire active n’est pas configurée correctement ({rawAcademicYear || 'Non renseignée'}).
        </div>
      </div>
    );
  }

  // Render main panel contents
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1rem 0' }}>
      {/* 1. Selector fields */}
      <ClassProgramSelectors
        academicYearLabel={activeYearName}
        sectionFilter={sectionFilter}
        setSectionFilter={handleSectionFilterChange}
        cycleFilter={cycleFilter}
        setCycleFilter={handleCycleFilterChange}
        selectedClassId={selectedClassId}
        setSelectedClassId={handleClassSelect}
        classes={classes}
        technicalSpecialties={(db?.technicalSpecialties || []) as TechnicalSpecialty[]}
        activeSchoolId={currentSchool?.id || ''}
      />

      {draftError && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          color: '#b91c1c',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          fontSize: '0.875rem',
          fontWeight: 600,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxSizing: 'border-box',
          width: '100%'
        }}>
          <span>{draftError}</span>
          <button
            onClick={() => setDraftError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#b91c1c',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              marginLeft: '1rem'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Loading, Forbidden, and Empty States resolution */}
      {!isEditing && status === 'loading' && <ClassProgramEmptyState type="loading" />}

      {!isEditing && status === 'forbidden' && <ClassProgramEmptyState type="forbidden" />}

      {!isEditing && status === 'error' && (
        <ClassProgramEmptyState
          type="error"
          errorCode={errorCode}
          onRetry={retry}
        />
      )}

      {!isEditing && status === 'idle' && !selectedClassId && (
        <ClassProgramEmptyState type="no-class-selected" />
      )}

      {/* 3. Editor mode when requested */}
      {isEditing && selectedClass && (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '0.75rem',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          boxSizing: 'border-box',
          width: '100%'
        }}>
          <ClassProgramEditor
            initialProgram={program}
            initialSubjects={subjects}
            schoolId={schoolId || ''}
            academicYearId={normalizedYear}
            classId={selectedClassId}
            selectedClass={selectedClass}
            classes={classes}
            userId={currentUser.id || ''}
            userRole={currentUser.role}
            catalogSubjects={db.subjects || []}
            onClose={() => {
              setIsEditing(false);
              retry();
            }}
            onSaveSuccess={() => {
              setIsEditing(false);
              retry();
            }}
            onDirtyChange={onDirtyChange}
          />
        </div>
      )}

      {/* 4. Reading Mode view */}
      {!isEditing && status === 'success' && (
        <>
          {/* Header metadata row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            backgroundColor: 'var(--card-bg)',
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            boxSizing: 'border-box'
          }}>
            {/* Left: Program status title & badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1.05rem' }}>
                Statut du programme :
              </span>

              {/* legacy configuration badge */}
              {source === 'legacy' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    color: 'var(--primary-color)',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}>
                    Configuration historique
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    (Cette classe utilise encore l'ancienne configuration des matières)
                  </span>
                </div>
              )}

              {/* no program / fallback missing */}
              {source === 'none' && (
                <span style={{
                  backgroundColor: 'rgba(100, 116, 139, 0.1)',
                  color: '#475569',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}>
                  {isReadOnlyRole ? 'Aucun programme publié' : 'Aucun programme'}
                </span>
              )}

              {/* version published / draft badges */}
              {source !== 'legacy' && source !== 'none' && (
                <>
                  {/* Published status */}
                  {hasPublishedVersion && (
                    <span style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#047857',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700
                    }}>
                      Publié
                    </span>
                  )}

                  {/* Manager-only draft badges */}
                  {isManager && (
                    <>
                      {!hasPublishedVersion && (
                        <span style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.1)',
                          color: '#d97706',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}>
                          Brouillon
                        </span>
                      )}

                      {hasPublishedVersion && hasUnpublishedChanges && (
                        <span style={{
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: '#2563eb',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 700
                        }}>
                          Modifications non publiées
                        </span>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Right: View switcher and Modifier action button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {isManager && hasPublishedVersion && hasDraftVersion && hasUnpublishedChanges && (
                <div style={{
                  display: 'inline-flex',
                  background: '#f1f5f9',
                  padding: '0.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}>
                  <button
                    onClick={() => setRequestedView('published')}
                    style={{
                      border: 'none',
                      background: requestedView === 'published' ? 'white' : 'transparent',
                      color: requestedView === 'published' ? 'var(--text-main)' : 'var(--text-muted)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: requestedView === 'published' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Version publiée
                  </button>
                  <button
                    onClick={() => setRequestedView('draft')}
                    style={{
                      border: 'none',
                      background: requestedView === 'draft' ? 'white' : 'transparent',
                      color: requestedView === 'draft' ? 'var(--text-main)' : 'var(--text-muted)',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: requestedView === 'draft' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Brouillon en cours
                  </button>
                </div>
              )}

              {(() => {
                const action = determineProgramAction({
                  status,
                  source,
                  program,
                  isManager
                });

                if (action === 'create-modification-draft') {
                  return (
                    <button
                      type="button"
                      onClick={handleCreateDraft}
                      disabled={isCreatingDraft || !!draftError}
                      style={{
                        border: 'none',
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: isCreatingDraft ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)',
                        transition: 'all 0.15s ease',
                        opacity: isCreatingDraft ? 0.7 : 1
                      }}
                    >
                      {isCreatingDraft ? 'Création...' : 'Créer un brouillon de modification'}
                    </button>
                  );
                }

                if (action === 'edit-draft') {
                  return (
                    <button
                      type="button"
                      onClick={handleCreateDraft}
                      disabled={isCreatingDraft || !!draftError}
                      style={{
                        border: 'none',
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: isCreatingDraft ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)',
                        transition: 'all 0.15s ease',
                        opacity: isCreatingDraft ? 0.7 : 1
                      }}
                    >
                      {isCreatingDraft ? 'Ouverture...' : 'Modifier le brouillon'}
                    </button>
                  );
                }

                return null;
              })()}
            </div>
          </div>

          {/* 5. Empty program state or legacy explanation */}
          {source === 'none' && !draftError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', width: '105%' }}>
              <div style={{ width: '95%' }}>
                <ClassProgramEmptyState
                  type={isReadOnlyRole ? 'no-program-read-only' : 'no-program'}
                />
              </div>
              {determineProgramAction({
                status,
                source,
                program,
                isManager
              }) === 'create-program' && (
                <button
                  type="button"
                  onClick={handleCreateDraft}
                  disabled={isCreatingDraft}
                  style={{
                    border: 'none',
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: isCreatingDraft ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 4px rgba(79, 70, 229, 0.15)',
                    transition: 'all 0.15s ease',
                    opacity: isCreatingDraft ? 0.7 : 1
                  }}
                >
                  {isCreatingDraft ? 'Création...' : 'Créer le programme'}
                </button>
              )}
            </div>
          )}

          {/* 6. Display totals summary card */}
          {source !== 'none' && (
            <ClassProgramSummary
              subjects={subjects}
              legacyCount={selectedClass?.subjects?.length}
              source={source}
            />
          )}

          {/* 7. Display program table */}
          {source !== 'none' && (
            <ClassProgramTable
              subjects={subjects}
              source={source}
              legacySubjectIds={selectedClass?.subjects}
              allSchoolSubjects={db.subjects}
              activeSchoolId={schoolId}
            />
          )}
        </>
      )}
    </div>
  );
};
