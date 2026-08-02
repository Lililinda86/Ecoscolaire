import React, { useState, useMemo } from 'react';
import { BusIcon, Plus, Edit2, Trash2 } from 'lucide-react';
import type { Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface FleetTabProps {
  buses: Bus[];
  canAct: boolean;
  onAddBus: () => void;
  onEditBus: (bus: Bus) => void;
  onDeactivateBus: (id: string) => void;
}

const FleetTab: React.FC<FleetTabProps> = ({ buses, canAct, onAddBus, onEditBus, onDeactivateBus }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filteredBuses = useMemo(() => {
    return buses.filter(b => {
      if (search && !b.name.toLowerCase().includes(search.toLowerCase()) && !(b.plate && b.plate.toLowerCase().includes(search.toLowerCase()))) {
        return false;
      }
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      return true;
    });
  }, [buses, search, filterStatus]);

  const hasActiveFilters = search !== '' || filterStatus !== 'all';
  const resetFilters = () => {
    setSearch('');
    setFilterStatus('all');
  };

  if (buses.length === 0) {
    return (
      <TransportEmptyState 
        icon={BusIcon}
        title="Flotte de bus vide"
        description="Il n'y a actuellement aucun bus enregistré dans votre flotte."
        canAct={canAct}
        actionLabel="Ajouter un bus"
        onAction={onAddBus}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Flotte"
        description="Gestion des véhicules de transport"
        count={buses.length}
        actionLabel="Ajouter un bus"
        actionIcon={<Plus size={18} />}
        canAct={canAct}
        onAction={onAddBus}
        searchPlaceholder="Rechercher par nom ou plaque..."
        searchValue={search}
        onSearchChange={setSearch}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <option value="all">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="en_panne">En panne</option>
            <option value="en_entretien">En entretien</option>
          </select>
        }
      />

      {filteredBuses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Nom/Numéro</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Immatriculation</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Capacité</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
                {canAct && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredBuses.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}><strong>{b.name}</strong></td>
                  <td style={{ padding: '1rem' }}>{b.plate || '-'}</td>
                  <td style={{ padding: '1rem' }}>{b.capacity || 'Non définie'}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '99px', 
                      fontSize: '0.875rem',
                      background: b.status === 'actif' ? 'rgba(16, 185, 129, 0.1)' : b.status === 'en_panne' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: b.status === 'actif' ? 'var(--success)' : b.status === 'en_panne' ? 'var(--danger)' : 'var(--warning)'
                    }}>
                      {b.status === 'actif' ? 'Actif' : b.status === 'en_panne' ? 'En panne' : 'En entretien'}
                    </span>
                  </td>
                  {canAct && (
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button className="secondary" onClick={() => onEditBus(b)} style={{ marginRight: '0.5rem' }} title="Modifier"><Edit2 size={16} /></button>
                      <button className="danger" onClick={() => onDeactivateBus(b.id)} title="Désactiver"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default FleetTab;
