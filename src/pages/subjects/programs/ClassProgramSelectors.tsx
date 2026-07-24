import React from 'react';
import type { ClassSection } from '../../../types';

interface ClassProgramSelectorsProps {
  academicYearLabel: string;
  sectionFilter: 'all' | 'francophone' | 'anglophone';
  setSectionFilter: (value: 'all' | 'francophone' | 'anglophone') => void;
  cycleFilter: 'all' | 'maternelle' | 'primaire' | 'secondaire';
  setCycleFilter: (value: 'all' | 'maternelle' | 'primaire' | 'secondaire') => void;
  selectedClassId: string;
  setSelectedClassId: (value: string) => void;
  classes: ClassSection[];
}

export const ClassProgramSelectors: React.FC<ClassProgramSelectorsProps> = ({
  academicYearLabel,
  sectionFilter,
  setSectionFilter,
  cycleFilter,
  setCycleFilter,
  selectedClassId,
  setSelectedClassId,
  classes
}) => {
  function normalizeCycle(cls: ClassSection): 'maternelle' | 'primaire' | 'secondaire' | 'unknown' {
    const cycleVal = cls.cycle || cls.level;
    if (!cycleVal) return 'unknown';
    if (cycleVal === 'preschool' || cycleVal === 'nursery' || cycleVal === 'maternelle') {
      return 'maternelle';
    }
    if (cycleVal === 'primary' || cycleVal === 'primaire') {
      return 'primaire';
    }
    if (cycleVal === 'secondary' || cycleVal === 'secondaire') {
      return 'secondaire';
    }
    return 'unknown';
  }

  // Filter classes based on section & cycle selectors
  const filteredClasses = classes.filter((c) => {
    // Section matching
    const sectionVal = c.type || c.section;
    const matchesSection =
      sectionFilter === 'all' ||
      (sectionFilter === 'francophone' && sectionVal === 'francophone') ||
      (sectionFilter === 'anglophone' && sectionVal === 'anglophone');

    // Cycle matching
    const normalized = normalizeCycle(c);
    const matchesCycle =
      cycleFilter === 'all' ||
      normalized === cycleFilter;

    return matchesSection && matchesCycle;
  });

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '1rem',
      backgroundColor: 'var(--card-bg)',
      padding: '1.25rem',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      marginBottom: '1.5rem'
    }}>
      {/* 1. Academic Year */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Année Scolaire</label>
        <input
          type="text"
          value={academicYearLabel}
          readOnly
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: '#f8fafc',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
            cursor: 'not-allowed',
            fontWeight: 500
          }}
        />
      </div>

      {/* 2. Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label htmlFor="section-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Section</label>
        <select
          id="section-select"
          value={sectionFilter}
          onChange={(e) => {
            const val = e.target.value as 'all' | 'francophone' | 'anglophone';
            setSectionFilter(val);
          }}
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            fontWeight: 500,
            outline: 'none'
          }}
        >
          <option value="all">Toutes les sections</option>
          <option value="francophone">Francophone</option>
          <option value="anglophone">Anglophone</option>
        </select>
      </div>

      {/* 3. Cycle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label htmlFor="cycle-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Cycle</label>
        <select
          id="cycle-select"
          value={cycleFilter}
          onChange={(e) => {
            const val = e.target.value as 'all' | 'maternelle' | 'primaire' | 'secondaire';
            setCycleFilter(val);
          }}
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            fontWeight: 500,
            outline: 'none'
          }}
        >
          <option value="all">Tous les cycles</option>
          <option value="maternelle">Maternelle</option>
          <option value="primaire">Primaire</option>
          <option value="secondaire">Secondaire</option>
        </select>
      </div>

      {/* 4. Class */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label htmlFor="class-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Classe</label>
        <select
          id="class-select"
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          style={{
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-main)',
            fontSize: '0.9rem',
            fontWeight: 500,
            outline: 'none'
          }}
        >
          <option value="">-- Sélectionner une classe --</option>
          {filteredClasses.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
