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
      <div className="flex flex-col justify-center">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Nombre de matières</div>
        <div>
          <strong className="text-xl font-extrabold text-gray-900 dark:text-white block mt-1">{count}</strong>
        </div>
      </div>

      <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-800 pt-3 sm:pt-0 sm:pl-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Total des coefficients</div>
        <div>
          <strong className="text-xl font-extrabold text-gray-900 dark:text-white block mt-1">{totalCoefficients}</strong>
        </div>
      </div>

      <div className="flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-gray-800 pt-3 sm:pt-0 sm:pl-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Volume horaire hebdomadaire</div>
        <div>
          <strong className="text-xl font-extrabold text-gray-900 dark:text-white block mt-1">{totalHours} h</strong>
        </div>
      </div>
    </div>
  );
};
