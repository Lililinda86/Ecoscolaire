import React, { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useClassProgram } from '../../../hooks/useClassProgram';
import { normalizeAcademicYearId } from '../../../utils/academicYear';
import { ClassProgramSelectors } from './ClassProgramSelectors';
import { ClassProgramSummary } from './ClassProgramSummary';
import { ClassProgramTable } from './ClassProgramTable';
import { ClassProgramEmptyState } from './ClassProgramEmptyState';

export const ClassProgramPanel: React.FC = () => {
  const { db, currentUser } = useAppContext();

  // Filters state
  const [sectionFilter, setSectionFilter] = useState<'all' | 'francophone' | 'anglophone'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | 'maternelle' | 'primaire' | 'secondaire'>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Manager view switcher: 'published' | 'draft'
  const [requestedView, setRequestedView] = useState<'published' | 'draft'>('published');

  const schoolId = db?.school?.id;
  const rawAcademicYear = db?.school?.academicYear || '';
  const normalizedYear = normalizeAcademicYearId(rawAcademicYear);

  const classes = React.useMemo(() => db?.classes || [], [db?.classes]);
  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    setRequestedView('published');
  };

  const handleSectionFilterChange = (value: 'all' | 'francophone' | 'anglophone') => {
    setSectionFilter(value);
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
    if (selectedClassId) {
      const currentClass = classes.find((c) => c.id === selectedClassId);
      if (currentClass) {
        const cycleVal = currentClass.cycle || currentClass.level;
        let matchesCycle = true;
        if (value !== 'all') {
          const isMaternelle = cycleVal === 'maternelle' || cycleVal === 'nursery' || cycleVal === 'preschool';
          const isPrimaire = cycleVal === 'primaire' || cycleVal === 'primary';
          const isSecondaire = cycleVal === 'secondaire' || cycleVal === 'secondary';
          matchesCycle =
            (value === 'maternelle' && isMaternelle) ||
            (value === 'primaire' && isPrimaire) ||
            (value === 'secondaire' && isSecondaire);
        }
        if (!matchesCycle) {
          setSelectedClassId('');
        }
      }
    }
  };

  // Hook to fetch and resolve ClassProgram details
  const {
    status,
    subjects,
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

  const isManager = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  const isReadOnlyRole = ['secretary', 'teacher'].includes(currentUser.role);

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
        academicYearLabel={rawAcademicYear}
        sectionFilter={sectionFilter}
        setSectionFilter={handleSectionFilterChange}
        cycleFilter={cycleFilter}
        setCycleFilter={handleCycleFilterChange}
        selectedClassId={selectedClassId}
        setSelectedClassId={handleClassSelect}
        classes={classes}
      />

      {/* 2. Loading, Forbidden, and Empty States resolution */}
      {status === 'loading' && <ClassProgramEmptyState type="loading" />}

      {status === 'forbidden' && <ClassProgramEmptyState type="forbidden" />}

      {status === 'error' && (
        <ClassProgramEmptyState
          type="error"
          errorCode={errorCode}
          onRetry={retry}
        />
      )}

      {status === 'idle' && !selectedClassId && (
        <ClassProgramEmptyState type="no-class-selected" />
      )}

      {status === 'success' && (
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

            {/* Right: View switcher (only for managers when both published and draft exist) */}
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
          </div>

          {/* 3. Empty program state or legacy explanation */}
          {source === 'none' && (
            <ClassProgramEmptyState
              type={isReadOnlyRole ? 'no-program-read-only' : 'no-program'}
            />
          )}

          {/* 4. Display totals summary card */}
          {source !== 'none' && (
            <ClassProgramSummary
              subjects={subjects}
              legacyCount={selectedClass?.subjects?.length}
              source={source}
            />
          )}

          {/* 5. Display program table */}
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
