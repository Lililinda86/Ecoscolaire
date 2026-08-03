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
    <div className="class-program-stats-row">
      <div className="class-program-stat-card">
        <div className="class-program-stat-label">Nombre de matières</div>
        <div className="class-program-stat-value">{count}</div>
      </div>

      <div className="class-program-stat-card">
        <div className="class-program-stat-label">Total coefficients</div>
        <div className="class-program-stat-value">{totalCoefficients}</div>
      </div>

      <div className="class-program-stat-card">
        <div className="class-program-stat-label">Volume hebdo</div>
        <div className="class-program-stat-value">{totalHours} h</div>
      </div>
    </div>
  );
};
