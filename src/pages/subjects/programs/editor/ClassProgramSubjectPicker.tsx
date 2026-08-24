import React, { useState, useMemo } from 'react';
import type { Subject, ClassSubject, ClassSection } from '../../../../types';
import { normalizeClassSection, normalizeClassCycle } from '../../../../utils/classClassification';
import { filterAvailableSubjectsForClass } from './classProgramSubjectFilters';
import { sortClassesPedagogically, cleanClassName } from '../../../../utils/pedagogicalSort';
import styles from './ClassProgramSubjectPicker.module.css';

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
    if (id !== classId) return;
    const next = new Set(selectedClassIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedClassIds(next);
  };
  const handleSelectAllClasses = () => setSelectedClassIds(new Set([classId]));
  const handleClearClasses = () => setSelectedClassIds(new Set([classId]));

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
        className={styles.dialog}
        data-testid="bulk-picker-dialog"
      >
        <header data-testid="picker-header" className={styles.header + " p-4 border-b border-gray-200 bg-white"}>
          <div>
            <h2 id="subject-picker-title" className="text-base font-bold text-gray-950">
              Ajouter des matières au programme
            </h2>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Sélectionnez les matières à ajouter au brouillon de cette classe.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className={styles.closeButton}
          >
            ×
          </button>
        </header>

        <nav data-testid="picker-navigation" role="tablist" className={styles.navigation + " flex gap-2 border-b border-gray-200 px-4 pt-4 bg-gray-50"}>
          <button 
            type="button"
            role="tab"
            aria-selected={activeStep === 'classes'}
            onClick={() => setActiveStep('classes')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-t-lg ${activeStep === 'classes' ? styles.activeTab : styles.inactiveTab}`}
          >
            1. Classes
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={activeStep === 'subjects'}
            onClick={() => setActiveStep('subjects')}
            className={`flex-1 py-2 px-4 text-xs font-bold rounded-t-lg ${activeStep === 'subjects' ? styles.activeTab : styles.inactiveTab}`}
          >
            2. Matières
          </button>
        </nav>

        <main data-testid="picker-main" className={styles.main}>
          {activeStep === 'classes' ? (
            <section key="classes" data-testid="classes-step" className={styles.step}>
              <div className={styles.stepControls + " p-4"}>
                <input
                  type="text"
                  placeholder="Rechercher une classe..."
                  value={classSearchTerm}
                  onChange={(e) => setClassSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs mb-2"
                />

                <label className={styles.inlineCheckbox + " mb-2 text-xs text-gray-600"}>
                  <input
                    type="checkbox"
                    id="filter-classes-cb"
                    checked={!isClassFiltered}
                    onChange={(e) => setIsClassFiltered(!e.target.checked)}
                    className={styles.checkbox}
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
                className={styles.scrollList + " ml-4 mb-4"}
              >
                {availableClasses.map(c => {
                  const cSec = normalizeClassSection(c);
                  const cCyc = normalizeClassCycle(c);
                  const displayName = cleanClassName(c.name, cSec);
                  return (
                    <label key={c.id} className={styles.optionRow}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedClassIds.has(c.id)}
                        onChange={() => handleToggleClass(c.id)}
                        disabled={c.id !== classId}
                      />
                      <div className={styles.optionText}>
                        <div className={styles.optionName}>
                          {displayName}
                        </div>
                        <div className={styles.optionMeta}>
                          {translateSectionLabel(cSec)} • {translateCycleLabel(cCyc)}
                        </div>
                      </div>
                    </label>
                  );
                })}
                {availableClasses.length === 0 && (
                  <div className="text-xs text-gray-500 text-center mt-4">Aucune classe trouvée.</div>
                )}
              </div>
            </section>
          ) : (
            <section key="subjects" data-testid="subjects-step" className={styles.step}>
              <div className={styles.stepControls + " p-4"}>
                <input
                  type="text"
                  placeholder="Rechercher une matière..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs mb-2"
                />

                <label className={styles.inlineCheckbox + " mb-2 text-xs text-gray-600"}>
                  <input
                    type="checkbox"
                    id="filter-subjects-cb"
                    checked={!isSubjectFiltered}
                    onChange={(e) => setIsSubjectFiltered(!e.target.checked)}
                    className={styles.checkbox}
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
                className={styles.scrollList + " ml-4 mb-4"}
              >
                {availableSubjects.map((s) => {
                  const sSec = s.section || 'all';
                  const sCyc = (s.cycles && s.cycles.length > 0) ? s.cycles.map(translateCycleLabel).join(', ') : '';
                  const displayName = cleanClassName(s.name, s.section || '');
                  
                  return (
                    <label key={s.id} className={styles.optionRow}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedSubjectIds.has(s.id)}
                        onChange={() => handleToggleSubject(s.id)}
                      />
                      <div className={styles.optionText}>
                        <div className={styles.optionName}>
                          {displayName}
                        </div>
                        {s.code && (
                          <div className={styles.optionMeta}>
                            Code : {s.code}
                          </div>
                        )}
                        <div className={styles.optionMeta}>
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

        <footer data-testid="picker-footer" className={styles.footer}>
          {activeStep === 'classes' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg mr-auto"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => setActiveStep('subjects')}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Continuer vers les matières
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveStep('classes')}
                className="px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg mr-auto"
              >
                Retour aux classes
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200 rounded-lg"
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
            </>
          )}
        </footer>
      </section>
    </div>
  );
};
