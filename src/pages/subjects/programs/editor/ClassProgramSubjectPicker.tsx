import React, { useState, useMemo } from 'react';
import type { Subject, ClassSubject, ClassSection } from '../../../../types';
import { normalizeClassSection, normalizeClassCycle } from '../../../../utils/classClassification';
import { filterAvailableSubjectsForClass } from './classProgramSubjectFilters';

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
  const [activeTab, setActiveTab] = useState<'classes' | 'subjects'>('classes');

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

    return filtered;
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

  return (
    <div className="class-program-picker-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-picker-title"
        className="class-program-picker-dialog"
        style={{ maxWidth: '800px', width: '90vw', maxHeight: 'min(90vh, 760px)', display: 'flex', flexDirection: 'column' }}
      >
        <header className="class-program-picker-header flex-shrink-0">
          <div className="flex flex-col">
            <h3 id="subject-picker-title" className="text-base font-bold text-gray-950 dark:text-white">
              Ajouter des matières au programme
            </h3>
            <span className="text-[10px] text-gray-500 mt-0.5">
              Sélectionnez les classes cibles et les matières à ajouter.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="class-program-picker-close"
          >
            ×
          </button>
        </header>

        {/* MOBILE TABS */}
        <div className="md:hidden flex border-b border-gray-200 dark:border-gray-800 px-4 pt-2 flex-shrink-0">
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-bold ${activeTab === 'classes' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('classes')}
          >
            1. Classes
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-xs font-bold ${activeTab === 'subjects' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            onClick={() => setActiveTab('subjects')}
          >
            2. Matières
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0 overflow-hidden flex-1">

          {/* CLASSES COLUMN */}
          <div className={`flex-col min-h-0 overflow-hidden md:border-r border-gray-200 dark:border-gray-800 md:pr-4 ${activeTab === 'classes' ? 'flex' : 'hidden'} md:flex`}>
            <h4 className="hidden md:block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">1. Classes concernées</h4>

            <input
              type="text"
              placeholder="Rechercher une classe..."
              value={classSearchTerm}
              onChange={(e) => setClassSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-xs mb-2"
            />

            <div className="flex items-center mb-2 gap-2 text-xs">
              <input
                type="checkbox"
                id="filter-classes-cb"
                checked={!isClassFiltered}
                onChange={(e) => setIsClassFiltered(!e.target.checked)}
              />
              <label htmlFor="filter-classes-cb" className="text-gray-600 dark:text-gray-400">Afficher autres sections/cycles</label>
            </div>

            <div className="flex justify-between items-center mb-2">
               <div className="text-[10px] text-gray-500 font-medium">
                 {selectedClassIds.size} classe(s) sélectionnée(s)
               </div>
               <div className="flex gap-3">
                 <button onClick={handleSelectAllClasses} className="text-[10px] font-semibold text-blue-600 hover:underline">Tout sélectionner</button>
                 <button onClick={handleClearClasses} className="text-[10px] font-semibold text-red-600 hover:underline">Effacer</button>
               </div>
            </div>

            <div className="overflow-y-auto flex-1 space-y-1">
              {availableClasses.map(c => {
                const cSec = normalizeClassSection(c);
                const cCyc = normalizeClassCycle(c);
                return (
                  <label key={c.id} className="flex items-start gap-3 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedClassIds.has(c.id)}
                      onChange={() => handleToggleClass(c.id)}
                    />
                    <span className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                      <span className="text-[10px] text-gray-500">{cSec} • {cCyc}</span>
                    </span>
                  </label>
                );
              })}
              {availableClasses.length === 0 && (
                <div className="text-xs text-gray-500 text-center mt-4">Aucune classe trouvée.</div>
              )}
            </div>

            <div className="md:hidden mt-3 flex-shrink-0">
              <button
                type="button"
                className="w-full py-2 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded"
                onClick={() => setActiveTab('subjects')}
              >
                Continuer vers les matières
              </button>
            </div>
          </div>

          {/* SUBJECTS COLUMN */}
          <div className={`flex-col min-h-0 overflow-hidden md:pl-2 ${activeTab === 'subjects' ? 'flex' : 'hidden'} md:flex`}>
            <h4 className="hidden md:block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">2. Matières à ajouter</h4>

            <input
              type="text"
              placeholder="Rechercher une matière..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-xs mb-2"
            />

            <div className="flex items-center mb-2 gap-2 text-xs">
              <input
                type="checkbox"
                id="filter-subjects-cb"
                checked={!isSubjectFiltered}
                onChange={(e) => setIsSubjectFiltered(!e.target.checked)}
              />
              <label htmlFor="filter-subjects-cb" className="text-gray-600 dark:text-gray-400">Afficher autres sections/cycles</label>
            </div>

            <div className="flex justify-between items-center mb-2">
               <div className="text-[10px] text-gray-500 font-medium">
                 {selectedSubjectIds.size} matière(s) sélectionnée(s)
               </div>
               <div className="flex gap-3">
                 <button onClick={handleSelectAllSubjects} className="text-[10px] font-semibold text-blue-600 hover:underline">Tout sélectionner</button>
                 <button onClick={handleClearSubjects} className="text-[10px] font-semibold text-red-600 hover:underline">Effacer</button>
               </div>
            </div>

            <div className="overflow-y-auto flex-1 space-y-1">
              {availableSubjects.map((s) => (
                <label key={s.id} className="flex items-start gap-3 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedSubjectIds.has(s.id)}
                    onChange={() => handleToggleSubject(s.id)}
                  />
                  <span className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{s.name} {s.code ? `(${s.code})` : ''}</span>
                    <span className="text-[10px] text-gray-500">
                      {s.section === 'all' ? 'Toutes sections' : s.section}
                      {(s.cycles && s.cycles.length > 0) ? ` • ${s.cycles.join(',')}` : ''}
                    </span>
                  </span>
                </label>
              ))}
              {availableSubjects.length === 0 && (
                <div className="text-xs text-gray-500 text-center mt-4">
                  Aucune matière compatible avec les classes sélectionnées.
                </div>
              )}
            </div>
          </div>
        </div>

        {(() => {
          const isDisabled = selectedClassIds.size === 0 || selectedSubjectIds.size === 0 || isSubmitting;
          return (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 bg-gray-50 dark:bg-gray-900 rounded-b-lg flex-shrink-0">
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
                disabled={isDisabled}
                aria-disabled={isDisabled}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              >
                {isSubmitting ? 'Préparation...' : `Ajouter ${selectedSubjectIds.size} matière(s) à ${selectedClassIds.size} classe(s)`}
              </button>
            </div>
          );
        })()}
      </section>
    </div>
  );
};
