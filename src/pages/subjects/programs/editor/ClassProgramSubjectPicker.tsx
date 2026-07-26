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
  onSelect: (subject: Subject) => void;
  onClose: () => void;
}

export const ClassProgramSubjectPicker: React.FC<ClassProgramSubjectPickerProps> = ({
  catalogSubjects,
  activeSubjects,
  schoolId,
  classId,
  selectedClass,
  onSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFiltered, setIsFiltered] = useState(true);

  // Extract class details using classClassification helpers
  const classSection = useMemo(() => {
    if (selectedClass) {
      return normalizeClassSection(selectedClass);
    }
    const classIdLower = (classId || '').toLowerCase();
    if (classIdLower.includes('anglophone') || classIdLower.includes('class_') || classIdLower.includes('nursery_')) {
      return 'anglophone';
    }
    return 'francophone';
  }, [selectedClass, classId]);

  const classCycle = useMemo(() => {
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

  const availableSubjects = useMemo(() => {
    return filterAvailableSubjectsForClass({
      catalogSubjects,
      activeSubjects,
      schoolId,
      classSection,
      classCycle,
      isFiltered,
      searchTerm
    });
  }, [catalogSubjects, activeSubjects, schoolId, classSection, classCycle, isFiltered, searchTerm]);

  return (
    <div className="class-program-picker-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="subject-picker-title"
        className="class-program-picker-dialog"
      >
        <header className="class-program-picker-header">
          <div className="flex flex-col">
            <h3 id="subject-picker-title" className="text-base font-bold text-gray-950 dark:text-white">
              Ajouter des matières au programme
            </h3>
            <span className="text-[10px] text-gray-500 mt-0.5">
              Classe : <span className="font-semibold text-gray-700 dark:text-gray-300">{(selectedClass?.name || classId.split('__').pop() || '').toUpperCase()}</span> ({classSection.toUpperCase()} • {classCycle.toUpperCase()})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la liste des matières"
            title="Fermer la liste des matières"
            className="class-program-picker-close"
          >
            ×
          </button>
        </header>

        <div className="class-program-picker-controls">
          <input
            type="text"
            placeholder="Rechercher une matière par son nom ou son code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />

          <div className="class-program-picker-options">
            <input
              type="checkbox"
              id="show-other-subjects-checkbox"
              checked={!isFiltered}
              onChange={(e) => setIsFiltered(!e.target.checked)}
            />

            <div className="class-program-picker-option-text">
              <label htmlFor="show-other-subjects-checkbox">
                Afficher aussi les matières des autres sections et cycles
              </label>

              <p id="show-other-subjects-help">
                Utilisez cette option uniquement pour ajouter une matière exceptionnelle.
              </p>
            </div>
          </div>
        </div>

        <div className="class-program-picker-list">
          {availableSubjects.length === 0 ? (
            <div className="text-center py-8 px-4 text-gray-500 dark:text-gray-400">
              {searchTerm ? (
                <p className="text-sm">Aucune matière ne correspond à votre recherche.</p>
              ) : isFiltered ? (
                <>
                  <p className="text-sm">Aucune matière recommandée pour cette section et ce cycle.</p>
                  <button
                    type="button"
                    onClick={() => setIsFiltered(false)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                  >
                     Afficher aussi les matières des autres sections et cycles
                  </button>
                </>
              ) : (
                <p className="text-sm">Toutes les matières disponibles ont déjà été ajoutées au programme.</p>
              )}
            </div>
          ) : (
            <div>
              {availableSubjects.map((s) => (
                <div
                  key={s.id}
                  className="class-program-picker-item"
                >
                  <div className="class-program-picker-item-content">
                    <span className="class-program-picker-item-name">
                      {s.name}
                    </span>
                    {s.code && (
                      <div className="class-program-picker-item-code">
                        Code : {s.code}
                      </div>
                    )}
                    {((s.section && s.section !== 'all' && s.section !== classSection) ||
                      (s.cycles && s.cycles.length > 0 && !s.cycles.some(c => {
                        const mapped = c === 'nursery' ? 'maternelle' : c === 'primary' ? 'primaire' : c === 'secondary' ? 'secondaire' : c;
                        return mapped === classCycle;
                      }))) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-400 font-medium">
                          {s.section === 'francophone' ? 'Francophone' : s.section === 'anglophone' ? 'Anglophone' : 'Tous'}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-400 font-medium">
                          {(s.cycles || []).map(c => {
                            if (c === 'nursery') return 'Maternelle';
                            if (c === 'primary') return 'Primaire';
                            if (c === 'secondary') return 'Secondaire';
                            return c;
                          }).join(', ') || 'Tous'}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onSelect(s)}
                    className="class-program-picker-add class-program-btn-add"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Ajouter
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
