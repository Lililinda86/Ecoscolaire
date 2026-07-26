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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <div className="flex flex-col">
            <h3 className="text-base font-bold text-gray-950 dark:text-white">
              Ajouter des matières au programme
            </h3>
            <span className="text-[10px] text-gray-500 mt-0.5">
              Classe : <span className="font-semibold text-gray-700 dark:text-gray-300">{(selectedClass?.name || classId.split('__').pop() || '').toUpperCase()}</span> ({classSection.toUpperCase()} • {classCycle.toUpperCase()})
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer la liste des matières"
            title="Fermer la liste des matières"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-850/50 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Rechercher une matière par son nom ou son code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />

          <label className="flex flex-col cursor-pointer gap-1 select-none self-start">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!isFiltered}
                onChange={(e) => setIsFiltered(!e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 dark:bg-gray-900 focus:ring-2"
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-350">
                Afficher aussi les matières des autres sections et cycles
              </span>
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 pl-6">
              Utilisez cette option uniquement pour ajouter une matière exceptionnelle.
            </span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
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
            <div className="divide-y divide-gray-150 dark:divide-gray-800/60">
              {availableSubjects.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg transition"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block">
                      {s.name}
                    </span>
                    {s.code && (
                      <div className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                        Code : {s.code}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-medium">
                        {s.section === 'francophone' ? 'Francophone' : s.section === 'anglophone' ? 'Anglophone' : 'Tous'}
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-medium">
                        {(s.cycles || []).map(c => {
                          if (c === 'nursery') return 'Maternelle';
                          if (c === 'primary') return 'Primaire';
                          if (c === 'secondary') return 'Secondaire';
                          return c;
                        }).join(', ') || 'Tous'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelect(s)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
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

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition"
          >
            Fermer la liste des matières
          </button>
        </div>
      </div>
    </div>
  );
};
