import React, { useState, useMemo } from 'react';
import { Users, ExternalLink } from 'lucide-react';
import type { Staff } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';
import { useNavigate } from 'react-router-dom';

interface DriversTabProps {
  drivers: Staff[];
  canAct: boolean;
}

const DriversTab: React.FC<DriversTabProps> = ({ drivers, canAct }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const navigate = useNavigate();

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      const name = d.name || (d.firstName && (d.firstName + ' ' + (d.lastName || ''))) || '';
      if (search && !name.toLowerCase().includes(search.toLowerCase()) && !(d.phone && d.phone.includes(search))) {
        return false;
      }
      const isActif = d.status === 'active' || d.employmentStatus === 'active' || d.active !== false;
      if (filterStatus === 'active' && !isActif) return false;
      if (filterStatus === 'inactive' && isActif) return false;
      return true;
    });
  }, [drivers, search, filterStatus]);

  const hasActiveFilters = search !== '' || filterStatus !== 'all';
  const resetFilters = () => {
    setSearch('');
    setFilterStatus('all');
  };

  const handleNavigateStaff = () => navigate('/staff');

  if (drivers.length === 0) {
    return (
      <TransportEmptyState 
        icon={Users}
        title="Aucun conducteur trouvé"
        description="Il n'y a actuellement aucun membre du personnel ayant le rôle 'Chauffeur' enregistré pour cette école."
        canAct={canAct}
        actionLabel="Gérer les conducteurs"
        onAction={handleNavigateStaff}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Conducteurs"
        description="Personnel affecté à la conduite des véhicules"
        count={drivers.length}
        actionLabel="Gérer les conducteurs"
        actionIcon={<ExternalLink size={18} />}
        canAct={canAct}
        onAction={handleNavigateStaff}
        searchPlaceholder="Rechercher par nom ou téléphone..."
        searchValue={search}
        onSearchChange={setSearch}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        }
      />

      {filteredDrivers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Nom</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Téléphone</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Permis</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Bus Affecté</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map(d => {
                const isActif = d.status === 'active' || d.employmentStatus === 'active' || d.active !== false;
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}><strong>{d.name || (d.firstName && (d.firstName + ' ' + (d.lastName || '')))}</strong></td>
                    <td style={{ padding: '1rem' }}>{d.phone || '-'}</td>
                    <td style={{ padding: '1rem' }}>{d.licenseNumber || 'Non renseigné'}</td>
                    <td style={{ padding: '1rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>Non affecté</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '99px', 
                        fontSize: '0.875rem',
                        background: isActif ? 'rgba(16, 185, 129, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                        color: isActif ? 'var(--success)' : 'var(--text-secondary)'
                      }}>
                        {isActif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
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

export default DriversTab;
