import React, { useState, useMemo } from 'react';
import type { Subject, ClassSubject, ClassSection } from '../../../../types';
import { normalizeClassSection, normalizeClassCycle } from '../../../../utils/classClassification';
import { filterAvailableSubjectsForClass } from './classProgramSubjectFilters';
import { sortClassesPedagogically, cleanClassName } from '../../../../utils/pedagogicalSort';

const translateSectionLabel = (val: string): string => {
  const v = (val || '').toLowerCase();
  if (v === 'french' || v === 'francophone') return 'francophone';
  if (v === 'english' || v === 'anglophone') return 'anglophone';
  if (v === 'all' || v === 'toutes sections') return 'toutes sections';
  return val;
};

const translateCycleLabel = (val: string): string => {
  const v = (val || '').toLowerCase();
  if (v.includes('primary')) return 'primaire';
  if (v.includes('secondary')) return 'secondaire';
  if (v.includes('nursery')) return 'maternelle';
  return val;
};

const getSubjectCountLabel = (count: number): string => {
  if (count === 0) return '0 matière sélectionnée';
  if (count === 1) return '1 matière sélectionnée';
  return `${count} matières sélectionnées`;
};

const getClassCountLabel = (count: number): string => {
  if (count === 0) return '0 classe sélectionnée';
  if (count === 1) return '1 classe sélectionnée';
  return `${count} classes sélectionnées`;
};

interface ClassProgramSubjectPickerProps {
  catalogSubjects: Subject[];
  activeSubjects: ClassSubject[];
  schoolId: string;
  classId: string;
  selectedClass?: ClassSection | null;
  classes?: ClassSection[];
  onBulkSelect: (selectedClassIds: string[], selectedSubjectIds: string[]) => void;
  onClose: () => void;
}

type PickerStep = 'classes' | 'subjects';

type SortableClass = Omit<ClassSection, 'section' | 'cycle'> & {
  section: string;
  cycle: string;
};

export const ClassProgramSubjectPicker: React.FC<ClassProgramSubjectPickerProps> = ({
  catalogSubjects,
  activeSubjects,
  schoolId,
  classId,
  selectedClass,
  classes = [],
  onBulkSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubjectFiltered, setIsSubjectFiltered] = useState(true);

  const [classSearchTerm, setClassSearchTerm] = useState('');
  const [isClassFiltered, setIsClassFiltered] = useState(true);

  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set([classId]));
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState<PickerStep>('classes');

  // Current class details for baseline
  const currentClassSection = useMemo(() => {
    if (selectedClass) {
      return normalizeClassSection(selectedClass);
    }
    const classIdLower = (classId || '').toLowerCase();
    if (classIdLower.includes('anglophone') || classIdLower.includes('class_') || classIdLower.includes('nursery_')) {
      return 'anglophone';
    }
    return 'francophone';
  }, [selectedClass, classId]);

  const currentClassCycle = useMemo(() => {
    if (selectedClass) {
      return normalizeClassCycle(selectedClass);
    }
    const classIdLower = (classId || '').toLowerCase();
    if (classIdLower.includes('maternelle') || classIdLower.includes('nursery')) {
      return 'maternelle';
    }
    if (classIdLower.includes('secondaire') || classIdLower.includes('seconde') || classIdLower.includes('terminale')) {
      return 'secondaire';
    }
    return 'primaire';
  }, [selectedClass, classId]);

  // Available subjects for current class logic (as baseline)
  const availableSubjects = useMemo(() => {
    return filterAvailableSubjectsForClass({
      catalogSubjects,
      activeSubjects, // Active subjects of current class
      schoolId,
      classSection: currentClassSection,
      classCycle: currentClassCycle,
      isFiltered: isSubjectFiltered,
      searchTerm
    });
  }, [catalogSubjects, activeSubjects, schoolId, currentClassSection, currentClassCycle, isSubjectFiltered, searchTerm]);

  // Available classes logic
  const availableClasses = useMemo(() => {
    let filtered = classes.filter(c => c.schoolId === schoolId || c.schoolId === undefined || c.schoolId === '');

    if (classSearchTerm) {
      const q = classSearchTerm.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
    }

    if (isClassFiltered) {
       filtered = filtered.filter(c => {
         const cSection = normalizeClassSection(c);
         const cCycle = normalizeClassCycle(c);
         return cSection === currentClassSection && cCycle === currentClassCycle;
       });
    }

    // Sort classes by dynamically populating section and cycle if missing
    const mappedForSort: SortableClass[] = filtered.map(c => ({
      ...c,
      section: normalizeClassSection(c),
      cycle: normalizeClassCycle(c)
    }));
    
    const sorted = sortClassesPedagogically(mappedForSort, currentClassSection);

    return sorted as ClassSection[];
  }, [classes, schoolId, classSearchTerm, isClassFiltered, currentClassSection, currentClassCycle]);

  // Handlers for classes
  const handleToggleClass = (id: string) => {
    const next = new Set(selectedClassIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedClassIds(next);
  };
  const handleSelectAllClasses = () => setSelectedClassIds(new Set(availableClasses.map(c => c.id)));
  const handleClearClasses = () => setSelectedClassIds(new Set());

  // Handlers for subjects
  const handleToggleSubject = (id: string) => {
    const next = new Set(selectedSubjectIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSubjectIds(next);
  };
  const handleSelectAllSubjects = () => setSelectedSubjectIds(new Set(availableSubjects.map(s => s.id)));
  const handleClearSubjects = () => setSelectedSubjectIds(new Set());

  const handleSubmit = () => {
    if (isSubmitting) return; // Verrou anti-double clic
    if (selectedClassIds.size > 0 && selectedSubjectIds.size > 0) {
      setIsSubmitting(true);
      onBulkSelect(Array.from(selectedClassIds), Array.from(selectedSubjectIds));
    }
  };

  const isSubmitDisabled = selectedClassIds.size === 0 || selectedSubjectIds.size === 0 || isSubmitting;

  return (
    <div className="class-program-picker-overlay flex items-center justify-center fixed inset-0 bg-black/50 z-50">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-picker-title"
        className="class-program-picker-dialog bg-white dark:bg-gray-900 rounded-xl shadow-2xl"
        style={{ 
          width: 'min(92vw, 760px)', 
          height: 'min(90vh, 760px)',
          maxHeight: 'min(90vh, 760px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        data-testid="bulk-picker-dialog"
      >
        <header data-testid="picker-header" className="shrink-0 p-4 border-b border-gray-200 dark:border-gray-800 flex items-start justify-between">
          <div>
            <h2 id="subject-picker-title" className="text-base font-bold text-gray-950 dark:text-white">
              Ajouter des matières au programme
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Sélectionnez les classes cibles et les matières à ajouter.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="shrink-0 rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            style={{
              width: 36,
              height: 36,
              background: 'transparent'
            }}
          >
            ×
          </button>
        </header>

        <nav data-testid="picker-navigation" role="tablist" className="shrink-0 flex gap-2 border-b border-gray-200 dark:border-gray-800 px-4 pt-4 bg-gray-50 dark:bg-gray-900/50">
          <button 
            type="button"
            role="tab"
            aria-selected={activeStep === 'classes'}
            onClick={() => setActiveStep('classes')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-t-lg border-t border-x ${activeStep === 'classes' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}`}
          >
            1. Classes
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeStep === 'subjects'}
            onClick={() => setActiveStep('subjects')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-t-lg border-t border-x ${activeStep === 'subjects' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700'}`}
          >
            2. Matières
          </button>
        </nav>

        <main data-testid="picker-main" className="min-h-0 flex-1 overflow-hidden">
          {activeStep === 'classes' ? (
            <section key="classes" data-testid="classes-step" className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="p-4 shrink-0">
                <input
                  type="text"
                  placeholder="Rechercher une classe..."
                  value={classSearchTerm}
                  onChange={(e) => setClassSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-xs mb-2"
                />

                <label className="flex items-center gap-2 mb-2 cursor-pointer text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    id="filter-classes-cb"
                    checked={!isClassFiltered}
                    onChange={(e) => setIsClassFiltered(!e.target.checked)}
                    style={{
                      width: 16,
                      height: 16,
                      minWidth: 16,
                      maxWidth: 16,
                      margin: 0,
                      flex: '0 0 16px'
                    }}
                  />
                  <span>Afficher aussi les classes des autres sections et cycles</span>
                </label>

                <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                   <div className="text-[10px] text-gray-500 font-medium">
                     {getClassCountLabel(selectedClassIds.size)}
                   </div>
                   <div className="flex gap-3">
                     <button type="button" onClick={handleSelectAllClasses} className="text-[10px] font-semibold text-blue-600 hover:underline">Tout sélectionner</button>
                     <button type="button" onClick={handleClearClasses} className="text-[10px] font-semibold text-red-600 hover:underline">Effacer</button>
                   </div>
                </div>
              </div>

              <div
                data-testid="classes-scroll-container"
                className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden pr-2 ml-4 mb-4"
                style={{
                  scrollbarGutter: 'stable',
                  overscrollBehavior: 'contain'
                }}
              >
                {availableClasses.map(c => {
                  const cSec = normalizeClassSection(c);
                  const cCyc = normalizeClassCycle(c);
                  const displayName = cleanClassName(c.name, cSec);
                  return (
                    <label key={c.id} className="flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0 grow-0"
                        style={{
                          width: 16,
                          height: 16,
                          minWidth: 16,
                          maxWidth: 16,
                          margin: 0,
                          flex: '0 0 16px'
                        }}
                        checked={selectedClassIds.has(c.id)}
                        onChange={() => handleToggleClass(c.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight text-gray-800 dark:text-gray-200">
                          {displayName}
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          {translateSectionLabel(cSec)} • {translateCycleLabel(cCyc)}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {availableClasses.length === 0 && (
                  <div className="text-xs text-gray-500 text-center mt-4">Aucune classe trouvée.</div>
                )}
                
                <div className="mt-4 flex-shrink-0">
                  <button
                    type="button"
                    className="w-full py-2 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded"
                    onClick={() => setActiveStep('subjects')}
                  >
                    Continuer vers les matières
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section key="subjects" data-testid="subjects-step" className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="p-4 shrink-0">
                <input
                  type="text"
                  placeholder="Rechercher une matière..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-xs mb-2"
                />

                <label className="flex items-center gap-2 mb-2 cursor-pointer text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    id="filter-subjects-cb"
                    checked={!isSubjectFiltered}
                    onChange={(e) => setIsSubjectFiltered(!e.target.checked)}
                    style={{
                      width: 16,
                      height: 16,
                      minWidth: 16,
                      maxWidth: 16,
                      margin: 0,
                      flex: '0 0 16px'
                    }}
                  />
                  <span>Afficher aussi les matières des autres sections et cycles</span>
                </label>

                <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                   <div className="text-[10px] text-gray-500 font-medium">
                     {getSubjectCountLabel(selectedSubjectIds.size)}
                   </div>
                   <div className="flex gap-3">
                     <button type="button" onClick={handleSelectAllSubjects} className="text-[10px] font-semibold text-blue-600 hover:underline">Tout sélectionner</button>
                     <button type="button" onClick={handleClearSubjects} className="text-[10px] font-semibold text-red-600 hover:underline">Effacer</button>
                   </div>
                </div>
              </div>

              <div
                data-testid="subjects-scroll-container"
                className="min-h-0 flex-1 overflow-y-scroll overflow-x-hidden pr-2 ml-4 mb-4"
                style={{
                  scrollbarGutter: 'stable',
                  overscrollBehavior: 'contain'
                }}
              >
                {availableSubjects.map((s) => {
                  const sSec = s.section || 'all';
                  const sCyc = (s.cycles && s.cycles.length > 0) ? s.cycles.map(translateCycleLabel).join(', ') : '';
                  const displayName = cleanClassName(s.name, s.section || '');
                  
                  return (
                    <label key={s.id} className="flex w-full cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0 grow-0"
                        style={{
                          width: 16,
                          height: 16,
                          minWidth: 16,
                          maxWidth: 16,
                          margin: 0,
                          flex: '0 0 16px'
                        }}
                        checked={selectedSubjectIds.has(s.id)}
                        onChange={() => handleToggleSubject(s.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight text-gray-800 dark:text-gray-200">
                          {displayName}
                        </div>
                        {s.code && (
                          <div className="mt-1 text-xs text-gray-500">
                            Code : {s.code}
                          </div>
                        )}
                        <div className="mt-1 text-sm text-gray-500">
                          {translateSectionLabel(sSec)}{sCyc ? ` • ${sCyc}` : ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {availableSubjects.length === 0 && (
                  <div className="text-xs text-gray-500 text-center mt-4">
                    Aucune matière compatible avec les classes sélectionnées.
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        <footer
          data-testid="picker-footer"
          className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex justify-end gap-3"
        >
          {activeStep === 'subjects' && (
            <button
              type="button"
              onClick={() => setActiveStep('classes')}
              className="px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg mr-auto"
            >
              Retour aux classes
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            aria-disabled={isSubmitDisabled}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
          >
            {isSubmitting ? 'Préparation...' : `Ajouter ${selectedSubjectIds.size} matière${selectedSubjectIds.size > 1 ? 's' : ''} à ${selectedClassIds.size} classe${selectedClassIds.size > 1 ? 's' : ''}`}
          </button>
        </footer>
      </section>
    </div>
  );
};
