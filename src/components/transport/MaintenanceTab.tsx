import React, { useState } from 'react';
import { PenTool as Tool, Plus, Edit2, AlertCircle } from 'lucide-react';
import type { Maintenance, Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface MaintenanceTabProps {
  maintenances: Maintenance[];
  buses: Bus[];
  canAct: boolean;
  onAddMaintenance: () => void;
  onEditMaintenance: (maintenance: Maintenance) => void;
}

const MaintenanceTab: React.FC<MaintenanceTabProps> = ({ maintenances, buses, canAct, onAddMaintenance, onEditMaintenance }) => {
  const [filterBus, setFilterBus] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filteredMaintenances = maintenances.filter(m => {
    if (filterBus !== 'all' && m.busId !== filterBus) return false;
    
    const nextDate = new Date(m.nextMaintenanceDate);
    nextDate.setHours(0, 0, 0, 0);
    const isOverdue = nextDate < today;
    const isUpcoming = nextDate >= today;
    
    if (filterStatus === 'overdue' && !isOverdue) return false;
    if (filterStatus === 'upcoming' && !isUpcoming) return false;

    if (filterPeriod !== 'all') {
      const expenseDate = m.date; // assuming YYYY-MM-DD
      const currentMonth = today.toISOString().substring(0, 7);
      const currentYear = today.getFullYear().toString();
      
      if (filterPeriod === 'month' && !expenseDate.startsWith(currentMonth)) return false;
      if (filterPeriod === 'year' && !expenseDate.startsWith(currentYear)) return false;
    }
    
    return true;
  });

  const sortedFilteredMaintenances = [...filteredMaintenances].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const hasActiveFilters = filterBus !== 'all' || filterStatus !== 'all' || filterPeriod !== 'all';
  const resetFilters = () => {
    setFilterBus('all');
    setFilterStatus('all');
    setFilterPeriod('all');
  };

  const totalFilteredCost = sortedFilteredMaintenances.reduce((sum, m) => sum + (m.amount || 0), 0);

  if (maintenances.length === 0) {
    return (
      <TransportEmptyState 
        icon={Tool}
        title="Aucun entretien enregistré"
        description="Gardez un historique des réparations et planifiez les prochains entretiens de vos bus."
        canAct={canAct}
        actionLabel="Enregistrer un entretien"
        onAction={onAddMaintenance}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Entretiens"
        description="Historique des réparations et planification de la maintenance"
        count={maintenances.length}
        actionLabel="Enregistrer un entretien"
        actionIcon={<Plus size={18} />}
        canAct={canAct}
        onAction={onAddMaintenance}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <>
            <select value={filterBus} onChange={(e) => setFilterBus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', maxWidth: '150px' }}>
              <option value="all">Tous les bus</option>
              {buses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Tous les statuts</option>
              <option value="upcoming">À venir / Valide</option>
              <option value="overdue">Échu (En retard)</option>
            </select>
            <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Toutes les périodes</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </>
        }
      />

      {sortedFilteredMaintenances.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>Total des coûts d'entretien (sélection) :</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>{totalFilteredCost} FCFA</span>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead style={{ background: 'var(--bg-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Garage</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Coût</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Prochain Entretien</th>
                  {canAct && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedFilteredMaintenances.map(m => {
                  const nextDate = new Date(m.nextMaintenanceDate);
                  nextDate.setHours(0, 0, 0, 0);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isOverdue = nextDate < today;

                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{new Date(m.date).toLocaleDateString()}</td>
                      <td style={{ padding: '1rem' }}><strong>{buses.find(b => b.id === m.busId)?.name || 'Inconnu'}</strong></td>
                      <td style={{ padding: '1rem' }}>{m.type}</td>
                      <td style={{ padding: '1rem' }}>{m.garage || '-'}</td>
                      <td style={{ padding: '1rem' }}>{m.amount} FCFA</td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isOverdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {new Date(m.nextMaintenanceDate).toLocaleDateString()}
                          {isOverdue && <AlertCircle size={14} />}
                        </div>
                      </td>
                      {canAct && (
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button className="secondary" onClick={() => onEditMaintenance(m)} title="Modifier"><Edit2 size={16} /></button>
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

export default MaintenanceTab;
