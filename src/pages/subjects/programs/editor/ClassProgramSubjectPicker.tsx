import React, { useState } from 'react';
import type { Subject, ClassSubject } from '../../../../types';

interface ClassProgramSubjectPickerProps {
  catalogSubjects: Subject[];
  activeSubjects: ClassSubject[];
  schoolId: string;
  onSelect: (subject: Subject) => void;
  onClose: () => void;
}

export const ClassProgramSubjectPicker: React.FC<ClassProgramSubjectPickerProps> = ({
  catalogSubjects,
  activeSubjects,
  schoolId,
  onSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter catalog subjects:
  // 1. Must belong to the active school (or be a legacy/global subject without schoolId)
  // 2. Must be active (isActive !== false)
  // 3. Must not already be active in the class program
  const availableSubjects = catalogSubjects.filter(s => {
    const isSchoolMatch = s.schoolId === schoolId || !s.schoolId;
    const isActive = s.isActive !== false;
    const isAlreadyAdded = activeSubjects.some(as => as.subjectId === s.id && as.isActive);

    if (!isSchoolMatch || !isActive || isAlreadyAdded) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(term) ||
      (s.code || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-950 dark:text-white">
            Ajouter des matières au programme
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-850/50">
          <input
            type="text"
            placeholder="Rechercher une matière par son nom ou son code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-750 bg-white dark:bg-gray-900 text-gray-950 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {availableSubjects.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-sm">Aucune matière disponible à ajouter.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-150 dark:divide-gray-800/60">
              {availableSubjects.map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded-lg transition"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {s.name}
                    </span>
                    {s.code && (
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                        {s.code}
                      </span>
                    )}
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
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
