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
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900 bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-gray-900 shadow-sm flex flex-col justify-between">
        <div className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Nombre matières</div>
        <strong className="text-2xl font-extrabold text-gray-900 dark:text-white mt-2 block">{count}</strong>
      </div>

      <div className="p-4 rounded-xl border border-indigo-150 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-gray-900 shadow-sm flex flex-col justify-between">
        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Total coefficients</div>
        <strong className="text-2xl font-extrabold text-gray-900 dark:text-white mt-2 block">{totalCoefficients}</strong>
      </div>

      <div className="p-4 rounded-xl border border-emerald-100 dark:border-emerald-950 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-gray-900 shadow-sm flex flex-col justify-between">
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Volume hebdo</div>
        <strong className="text-2xl font-extrabold text-gray-900 dark:text-white mt-2 block">{totalHours} h</strong>
      </div>
    </div>
  );
};
