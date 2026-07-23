import React from 'react';
import type { Subject } from '../../types';
import { Edit2 } from 'lucide-react';

interface SubjectTableProps {
  filteredSubjects: Subject[];
  canWrite: boolean;
  handleOpenEdit: (subject: Subject) => void;
  handleToggleActiveStatus: (subject: Subject) => void;
}

export const SubjectTable: React.FC<SubjectTableProps> = ({
  filteredSubjects,
  canWrite,
  handleOpenEdit,
  handleToggleActiveStatus
}) => {
  return (
    <div className="card" style={{ overflowX: 'auto', padding: 0, borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', background: 'rgba(0,0,0,0.015)' }}>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</th>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matière</th>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Section</th>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cycles</th>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</th>
            <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Statut</th>
            {canWrite && <th style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {filteredSubjects.map((s) => {
            const isActive = s.isActive !== false;
            // Display exactly the stored case as per ÉTAPE 7
            const displayName = s.name;
            
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}>
                <td style={{ padding: '1rem 1.25rem', fontWeight: 'bold' }}>
                  {s.code ? (
                    <span style={{ background: 'rgba(79, 70, 229, 0.08)', color: 'var(--primary-color)', padding: '0.3rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                      {s.code}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.color || '#4f46e5', boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)' }} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{displayName}</div>
                      {s.shortName && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({s.shortName})</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '1rem 1.25rem' }}>
                  {s.section === 'francophone' && (
                    <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                      FR — Francophone
                    </span>
                  )}
                  {s.section === 'anglophone' && (
                    <span style={{ backgroundColor: '#fdf2f8', color: '#be185d', border: '1px solid #fbcfe8', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                      EN — Anglophone
                    </span>
                  )}
                  {(s.section === 'all' || !s.section) && (
                    <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                      FR / EN — Commune
                    </span>
                  )}
                </td>
                <td style={{ padding: '1rem 1.25rem' }}>
                  {s.cycles && s.cycles.length > 0 ? (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {s.cycles.map((cyc) => (
                        <span
                          key={cyc}
                          style={{
                            fontSize: '0.75rem',
                            background: 'rgba(79, 70, 229, 0.08)',
                            color: 'var(--primary-color)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontWeight: 500
                          }}
                        >
                          {cyc === 'nursery' ? 'Maternelle' : cyc === 'primary' ? 'Primaire' : 'Secondaire'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '1rem 1.25rem', color: '#475569', fontSize: '0.9rem' }}>{s.category || '—'}</td>
                <td style={{ padding: '1rem 1.25rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    backgroundColor: isActive ? '#ecfdf5' : '#f8fafc',
                    color: isActive ? '#047857' : '#64748b',
                    border: isActive ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.8rem'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isActive ? '#10b981' : '#64748b' }} />
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {canWrite && (
                  <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      <button
                        className="secondary"
                        style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                        onClick={() => handleOpenEdit(s)}
                        title="Modifier"
                        aria-label="Modifier la matière"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="secondary"
                        style={{
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: isActive ? '#ef4444' : '#10b981',
                          borderColor: isActive ? '#fecaca' : '#a7f3d0',
                          backgroundColor: isActive ? '#fef2f2' : '#f0fdf4'
                        }}
                        onClick={() => handleToggleActiveStatus(s)}
                      >
                        {isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
