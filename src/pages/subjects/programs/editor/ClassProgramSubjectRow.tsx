import React from 'react';
import type { ClassSubject } from '../../../../types';

interface ClassProgramSubjectRowProps {
  subject: ClassSubject;
  index: number;
  totalCount: number;
  onUpdate: (fields: Partial<ClassSubject>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export const ClassProgramSubjectRow: React.FC<ClassProgramSubjectRowProps> = ({
  subject,
  index,
  totalCount,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown
}) => {
  return (
    <tr className="hover:bg-gray-50/40 dark:hover:bg-gray-800/10 transition border-b border-gray-150 dark:border-gray-800/80">
      {/* Drag/Reorder Controls */}
      <td className="p-3 text-center w-12">
        <div className="flex flex-col gap-1 items-center">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Déplacer vers le haut"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalCount - 1}
            className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Déplacer vers le bas"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </td>

      {/* Subject Name and Code */}
      <td className="p-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {subject.subjectNameSnapshot}
          </span>
          {subject.subjectCodeSnapshot && (
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">
              {subject.subjectCodeSnapshot}
            </span>
          )}
        </div>
      </td>

      {/* Coefficient */}
      <td className="p-3 w-32">
        <input
          type="number"
          min="0"
          step="any"
          value={subject.coefficient !== undefined && subject.coefficient !== null ? subject.coefficient : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseFloat(e.target.value);
            onUpdate({ coefficient: val === null ? undefined : val });
          }}
          className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-transparent text-center font-semibold"
          placeholder="Non défini"
        />
      </td>

      {/* Weekly Hours */}
      <td className="p-3 w-32">
        <input
          type="number"
          min="0"
          step="any"
          value={subject.weeklyHours !== undefined && subject.weeklyHours !== null ? subject.weeklyHours : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseFloat(e.target.value);
            onUpdate({ weeklyHours: val === null ? undefined : val });
          }}
          className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-transparent text-center font-semibold"
          placeholder="Non défini"
        />
      </td>

      {/* Is Required (Obligatoire / Facultative) */}
      <td className="p-3 w-36 text-center">
        <label className="inline-flex items-center cursor-pointer gap-2 select-none">
          <input
            type="checkbox"
            checked={subject.isRequired}
            onChange={(e) => onUpdate({ isRequired: e.target.checked })}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 dark:bg-gray-900 focus:ring-2"
          />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-350">
            {subject.isRequired ? 'Obligatoire' : 'Facultative'}
          </span>
        </label>
      </td>

      {/* Actions */}
      <td className="p-3 w-20 text-center">
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition"
          title="Retirer la matière"
        >
          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  );
};
