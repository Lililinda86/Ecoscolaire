import React from 'react';
import type { ClassSubject } from '../../../../types';

interface ClassProgramDraftSummaryProps {
  subjects: ClassSubject[];
}

export const ClassProgramDraftSummary: React.FC<ClassProgramDraftSummaryProps> = ({ subjects }) => {
  const activeSubjects = subjects.filter(s => s.isActive);
  const count = activeSubjects.length;

  const totalCoefficients = activeSubjects.reduce((sum, s) => sum + (s.coefficient || 0), 0);
  const totalHours = activeSubjects.reduce((sum, s) => sum + (s.weeklyHours || 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
      <div className="flex flex-col">
        <span className="text-xs text-gray-500 dark:text-gray-400">Nombre de matières</span>
        <span className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">
          {count} {count > 1 ? 'matières' : 'matière'}
        </span>
      </div>

      <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-800 pt-3 sm:pt-0 sm:pl-4">
        <span className="text-xs text-gray-500 dark:text-gray-400">Total des coefficients</span>
        <span className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">
          {totalCoefficients}
        </span>
      </div>

      <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-800 pt-3 sm:pt-0 sm:pl-4">
        <span className="text-xs text-gray-500 dark:text-gray-400">Total volume horaire hebd.</span>
        <span className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">
          {totalHours}h
        </span>
      </div>
    </div>
  );
};
