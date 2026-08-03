import React, { useState, useMemo } from 'react';
import { AlertTriangle, Plus, Edit2 } from 'lucide-react';
import type { Breakdown, Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface BreakdownsTabProps {
  breakdowns: Breakdown[];
  buses: Bus[];
  canAct: boolean;
  canEdit: boolean;
  onAddBreakdown: () => void;
  onEditBreakdown: (breakdown: Breakdown) => void;
}

const BreakdownsTab: React.FC<BreakdownsTabProps> = ({ breakdowns, buses, canAct, canEdit, onAddBreakdown, onEditBreakdown }) => {
  const [filterBus, setFilterBus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');

  const filteredBreakdowns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = breakdowns.filter(b => {
        if (filterBus !== 'all' && b.busId !== filterBus) return false;
        if (filterSeverity !== 'all' && b.severity !== filterSeverity) return false;
        if (filterStatus !== 'all' && b.status !== filterStatus) return false;
        
        if (filterPeriod !== 'all') {
          const expenseDate = b.date; // assuming YYYY-MM-DD
          const currentMonth = today.toISOString().substring(0, 7);
          const currentYear = today.getFullYear().toString();
          
          if (filterPeriod === 'month' && !expenseDate.startsWith(currentMonth)) return false;
          if (filterPeriod === 'year' && !expenseDate.startsWith(currentYear)) return false;
        }
        
        return true;
      });
      
    return [...filtered].sort((a, b) => {
        // Sort unresolved first, then by date desc
        if (a.status !== 'réparée' && b.status === 'réparée') return -1;
        if (a.status === 'réparée' && b.status !== 'réparée') return 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [breakdowns, filterBus, filterSeverity, filterStatus, filterPeriod]);

  const hasActiveFilters = filterBus !== 'all' || filterSeverity !== 'all' || filterStatus !== 'all' || filterPeriod !== 'all';
  const resetFilters = () => {
    setFilterBus('all');
    setFilterSeverity('all');
    setFilterStatus('all');
    setFilterPeriod('all');
  };

  const totalFilteredRepairCost = filteredBreakdowns.reduce((sum, b) => sum + (b.actualCost || 0), 0);

  if (breakdowns.length === 0) {
    return (
      <TransportEmptyState 
        icon={AlertTriangle}
        title="Aucune panne signalée"
        description="L'historique des pannes et réparations est vide. Signalez une panne pour initier un suivi de réparation."
        canAct={canAct}
        actionLabel="Signaler une panne"
        onAction={onAddBreakdown}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Pannes"
        description="Signalement des incidents et suivi des réparations"
        count={breakdowns.length}
        actionLabel="Signaler une panne"
        actionIcon={<Plus size={18} />}
        canAct={canAct}
        onAction={onAddBreakdown}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={filterBus} onChange={(e) => setFilterBus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', maxWidth: '150px' }}>
              <option value="all">Tous les bus</option>
              {buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Toutes gravités</option>
              <option value="légère">Légère</option>
              <option value="moyenne">Moyenne</option>
              <option value="urgente">Urgente</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Tous statuts</option>
              <option value="signalée">Signalée</option>
              <option value="en_réparation">En réparation</option>
              <option value="réparée">Réparée</option>
            </select>
            <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Toutes périodes</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </div>
        }
      />

      {filteredBreakdowns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>Coûts de réparation (sélection) :</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--danger)' }}>{totalFilteredRepairCost} FCFA</span>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead style={{ background: 'var(--bg-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Gravité</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Coût de réparation</th>
                  {canEdit && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredBreakdowns.map(b => {
                  const getSeverityColor = (sev: string) => {
                    if (sev === 'urgente') return { bg: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' };
                    if (sev === 'moyenne') return { bg: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' };
                    return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' };
                  };
                  const getStatusColor = (stat: string) => {
                    if (stat === 'réparée') return { bg: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' };
                    if (stat === 'en_réparation') return { bg: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' };
                    return { bg: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' };
                  };

                  const sevStyle = getSeverityColor(b.severity);
                  const statStyle = getStatusColor(b.status);

                  return (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: b.status === 'réparée' ? 0.7 : 1 }}>
                      <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{new Date(b.date).toLocaleDateString()}</td>
                      <td style={{ padding: '1rem' }}><strong>{buses.find(x => x.id === b.busId)?.name || 'Inconnu'}</strong></td>
                      <td style={{ padding: '1rem', maxWidth: '250px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={b.description}>{b.description}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: sevStyle.bg, color: sevStyle.color }}>
                          {b.severity}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: statStyle.bg, color: statStyle.color }}>
                          {b.status === 'en_réparation' ? 'En réparation' : b.status}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {b.status === 'réparée' ? (b.actualCost !== undefined ? `${b.actualCost} FCFA` : 'Non précisé') : (b.estimatedCost ? `~${b.estimatedCost} FCFA` : '-')}
                      </td>
                      {canEdit && (
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button className="secondary" onClick={() => onEditBreakdown(b)} title="Mettre à jour"><Edit2 size={16} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default BreakdownsTab;
