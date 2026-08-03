import React from 'react';
import type { ClassSubject } from '../../../types';

interface ClassProgramSummaryProps {
  subjects: ClassSubject[];
  legacyCount?: number;
  source: 'published' | 'draft' | 'legacy' | 'none';
}

export const ClassProgramSummary: React.FC<ClassProgramSummaryProps> = ({
  subjects,
  legacyCount,
  source
}) => {
  if (source === 'none') return null;

  if (source === 'legacy') {
    return (
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1,
          minWidth: '200px',
          background: 'rgba(79, 70, 229, 0.05)',
          border: '1px solid rgba(79, 70, 229, 0.2)',
          padding: '0.65rem 1.25rem',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          height: '92px',
          boxSizing: 'border-box'
        }}>
          <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Matières Historiques
          </span>
          <strong style={{ fontSize: '1.85rem', color: '#1e1b4b', fontWeight: 800, marginTop: '0.15rem' }}>
            {legacyCount ?? 0}
          </strong>
        </div>
      </div>
    );
  }

  // Filter active subjects for calculations
  const activeSubjects = subjects.filter((s) => s.isActive !== false);

  const totalActive = activeSubjects.length;
  const obligatoryCount = activeSubjects.filter((s) => s.isRequired).length;
  const optionalCount = activeSubjects.filter((s) => !s.isRequired).length;

  // Coefficient totals
  const activeWithCoeff = activeSubjects.filter((s) => typeof s.coefficient === 'number');
  const hasCoefficients = activeWithCoeff.length > 0;
  const totalCoefficient = activeWithCoeff.reduce((sum, s) => sum + (s.coefficient || 0), 0);

  // Weekly hours totals
  const activeWithHours = activeSubjects.filter((s) => typeof s.weeklyHours === 'number');
  const hasWeeklyHours = activeWithHours.length > 0;
  const totalWeeklyHours = activeWithHours.reduce((sum, s) => sum + (s.weeklyHours || 0), 0);

  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
      {/* 1. Active Subjects Count */}
      <div style={{
        flex: 1,
        minWidth: '160px',
        background: 'rgba(16, 185, 129, 0.05)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        padding: '0.65rem 1.25rem',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '92px',
        boxSizing: 'border-box'
      }}>
        <span style={{ color: '#047857', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matières actives</span>
        <strong style={{ fontSize: '1.85rem', color: '#065f46', fontWeight: 800, marginTop: '0.15rem' }}>{totalActive}</strong>
      </div>

      {/* 2. Obligatory/Optional split */}
      <div style={{
        flex: 1,
        minWidth: '200px',
        background: 'rgba(100, 116, 139, 0.05)',
        border: '1px solid rgba(100, 116, 139, 0.2)',
        padding: '0.65rem 1.25rem',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: '92px',
        boxSizing: 'border-box'
      }}>
        <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Structure</span>
        <span style={{ fontSize: '1.1rem', color: '#1e293b', fontWeight: 700, marginTop: '0.15rem' }}>
          {obligatoryCount} Obl. / {optionalCount} Fac.
        </span>
      </div>

      {/* 3. Total Coefficients */}
      {hasCoefficients && (
        <div style={{
          flex: 1,
          minWidth: '160px',
          background: 'rgba(79, 70, 229, 0.05)',
          border: '1px solid rgba(79, 70, 229, 0.2)',
          padding: '0.65rem 1.25rem',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          height: '92px',
          boxSizing: 'border-box'
        }}>
          <span style={{ color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Coefficients</span>
          <strong style={{ fontSize: '1.85rem', color: '#1e1b4b', fontWeight: 800, marginTop: '0.15rem' }}>{totalCoefficient}</strong>
        </div>
      )}

      {/* 4. Total Weekly Hours */}
      {hasWeeklyHours && (
        <div style={{
          flex: 1,
          minWidth: '160px',
          background: 'rgba(245, 158, 11, 0.05)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          padding: '0.65rem 1.25rem',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          height: '92px',
          boxSizing: 'border-box'
        }}>
          <span style={{ color: '#d97706', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Heures / Semaine</span>
          <strong style={{ fontSize: '1.85rem', color: '#78350f', fontWeight: 800, marginTop: '0.15rem' }}>{totalWeeklyHours}h</strong>
        </div>
      )}
    </div>
  );
};
