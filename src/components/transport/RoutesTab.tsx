import React, { useState, useMemo } from 'react';
import { Map as RouteIcon, Plus, Edit2, Trash2 } from 'lucide-react';
import type { BusRoute, Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface RoutesTabProps {
  routes: BusRoute[];
  buses: Bus[];
  canAct: boolean;
  onAddRoute: () => void;
  onEditRoute: (route: BusRoute) => void;
  onDeactivateRoute: (id: string) => void;
}

const RoutesTab: React.FC<RoutesTabProps> = ({ routes, buses, canAct, onAddRoute, onEditRoute, onDeactivateRoute }) => {
  const [search, setSearch] = useState('');
  const [filterBus, setFilterBus] = useState<string>('all');

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.areas.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filterBus !== 'all') {
        const assignedBus = buses.find(b => b.routeId === r.id);
        if (!assignedBus || assignedBus.id !== filterBus) return false;
      }
      return true;
    });
  }, [routes, buses, search, filterBus]);

  const hasActiveFilters = search !== '' || filterBus !== 'all';
  const resetFilters = () => {
    setSearch('');
    setFilterBus('all');
  };

  if (routes.length === 0) {
    return (
      <TransportEmptyState 
        icon={RouteIcon}
        title="Aucun circuit enregistré"
        description="Créez des circuits pour définir les trajets empruntés par vos véhicules de transport."
        canAct={canAct}
        actionLabel="Ajouter un circuit"
        onAction={onAddRoute}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Circuits"
        description="Gestion des trajets et lignes de transport"
        count={routes.length}
        actionLabel="Ajouter un circuit"
        actionIcon={<Plus size={18} />}
        canAct={canAct}
        onAction={onAddRoute}
        searchPlaceholder="Rechercher par nom ou quartier..."
        searchValue={search}
        onSearchChange={setSearch}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <select value={filterBus} onChange={(e) => setFilterBus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', maxWidth: '200px' }}>
            <option value="all">Tous les bus affectés</option>
            {buses.filter(b => b.routeId).map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        }
      />

      {filteredRoutes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Circuit</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Quartiers Desservis</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Horaires (Aller - Retour)</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Bus Affecté</th>
                {canAct && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.map(r => {
                const assignedBus = buses.find(b => b.routeId === r.id);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}><strong>{r.name}</strong></td>
                    <td style={{ padding: '1rem' }}>{r.areas}</td>
                    <td style={{ padding: '1rem' }}>{r.departureTime} - {r.returnTime}</td>
                    <td style={{ padding: '1rem' }}>
                      {assignedBus ? (
                        <span style={{ padding: '0.25rem 0.5rem', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary)', borderRadius: '4px', fontSize: '0.875rem' }}>
                          {assignedBus.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>Aucun</span>
                      )}
                    </td>
                    {canAct && (
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <button className="secondary" onClick={() => onEditRoute(r)} style={{ marginRight: '0.5rem' }} title="Modifier"><Edit2 size={16} /></button>
                        <button className="danger" onClick={() => onDeactivateRoute(r.id)} title="Désactiver"><Trash2 size={16} /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RoutesTab;
