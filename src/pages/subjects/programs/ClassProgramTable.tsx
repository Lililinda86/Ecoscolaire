import React from 'react';
import type { ClassSubject, Subject } from '../../../types';
import { resolveLegacyClassSubjects } from '../../../hooks/useClassProgram';

interface ClassProgramTableProps {
  subjects: ClassSubject[];
  source: 'published' | 'draft' | 'legacy' | 'none';
  legacySubjectIds?: string[];
  allSchoolSubjects?: Subject[];
  activeSchoolId?: string;
}

export const ClassProgramTable: React.FC<ClassProgramTableProps> = ({
  subjects,
  source,
  legacySubjectIds = [],
  allSchoolSubjects = [],
  activeSchoolId
}) => {
  if (source === 'none') return null;

  // Resolve legacy items if source is legacy
  interface ResolvedLegacyRow {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    isMissing: boolean;
  }

  let legacyRows: ResolvedLegacyRow[] = [];
  if (source === 'legacy') {
    legacyRows = resolveLegacyClassSubjects({
      subjectIds: legacySubjectIds,
      subjects: allSchoolSubjects,
      activeSchoolId
    });
  }

  return (
    <div style={{
      overflowX: 'auto',
      backgroundColor: 'var(--card-bg)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'left',
        fontSize: '0.9rem'
      }}>
        <thead>
          <tr style={{
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: '#f8fafc',
            color: 'var(--text-muted)',
            fontWeight: 600
          }}>
            <th style={{ padding: '0.75rem 1rem' }}>Ordre</th>
            <th style={{ padding: '0.75rem 1rem' }}>Code</th>
            <th style={{ padding: '0.75rem 1rem' }}>Matière</th>
            {source !== 'legacy' && (
              <>
                <th style={{ padding: '0.75rem 1rem' }}>Coefficient</th>
                <th style={{ padding: '0.75rem 1rem' }}>Heures/semaine</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
              </>
            )}
            <th style={{ padding: '0.75rem 1rem' }}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {source === 'legacy' ? (
            legacyRows.map((row, index) => (
              <tr
                key={row.id + '-' + index}
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  color: row.isMissing ? 'var(--text-muted)' : 'var(--text-main)',
                  backgroundColor: row.isMissing ? '#fef2f2' : 'transparent'
                }}
              >
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {index + 1}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {row.code || '—'}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                  {row.name}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {row.isMissing ? (
                    <span style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--danger)',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      Indisponible
                    </span>
                  ) : row.isActive ? (
                    <span style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#047857',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      Active
                    </span>
                  ) : (
                    <span style={{
                      backgroundColor: 'rgba(100, 116, 139, 0.1)',
                      color: '#475569',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700
                    }}>
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            subjects.map((sub, index) => {
              const isSubActive = sub.isActive !== false;
              return (
                <tr
                  key={sub.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    color: isSubActive ? 'var(--text-main)' : 'var(--text-muted)',
                    backgroundColor: isSubActive ? 'transparent' : '#f8fafc'
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                    {typeof sub.displayOrder === 'number' ? sub.displayOrder : index + 1}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {sub.subjectCodeSnapshot || '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                    {sub.subjectNameSnapshot}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {typeof sub.coefficient === 'number' ? sub.coefficient : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                    {typeof sub.weeklyHours === 'number' ? `${sub.weeklyHours}h` : '—'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {sub.isRequired ? (
                      <span style={{
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        color: 'var(--primary-color)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        Obligatoire
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        color: '#d97706',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        Facultative
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    {isSubActive ? (
                      <span style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        color: '#047857',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        Active
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: 'rgba(100, 116, 139, 0.1)',
                        color: '#475569',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700
                      }}>
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
