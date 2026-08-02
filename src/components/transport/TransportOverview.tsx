import React from 'react';
import { Bus as BusIcon, AlertTriangle, Fuel, PenTool as Tool, Users, Banknote } from 'lucide-react';
import type { Breakdown, Maintenance, Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface TransportOverviewProps {
  metrics: {
    activeBuses: number;
    brokenBuses: number;
    monthlyFuelCost: number;
    monthlyMaintCost: number;
    monthlyRepairCost: number;
    totalExpenses: number;
    monthlyTransportRevenue: number;
    netBalance: number;
    totalCapacity: number;
    studentsUsingTransport: number;
    theoreticalGlobalLoad: number;
  };
  buses: Bus[];
  breakdowns: Breakdown[];
  maintenances: Maintenance[];
}

const TransportOverview: React.FC<TransportOverviewProps> = ({ metrics, buses, breakdowns, maintenances }) => {
  const ongoingBreakdowns = breakdowns.filter(b => b.status !== 'réparée');
  const upcomingMaintenances = maintenances
    .filter(m => new Date(m.nextMaintenanceDate) >= new Date())
    .sort((a, b) => new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime())
    .slice(0, 5);
    
  const hasNoData = buses.length === 0;

  return (
    <div>
      <TransportTabHeader
        title="Vue d'ensemble"
        description="Tableau de bord et indicateurs clés de la flotte"
      />

      {hasNoData ? (
        <TransportEmptyState 
          icon={BusIcon}
          title="Aucune donnée de transport"
          description="Votre flotte est actuellement vide. Ajoutez des bus pour commencer à suivre les indicateurs."
        />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}><BusIcon size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Total Flotte</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{buses.length} / {metrics.activeBuses} actifs</p></div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)' }}><AlertTriangle size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>En Panne</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.brokenBuses}</p></div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><Users size={32} /></div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.875rem' }} title="Charge globale théorique">Charge globale théorique</h3>
                <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.theoreticalGlobalLoad.toFixed(1)}%</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cet indicateur est global. L’affectation des élèves à chaque bus n’est pas encore renseignée.</p>
              </div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--warning)' }}><Fuel size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Dépenses (Mois)</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.totalExpenses} FCFA</p></div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}><Banknote size={20} /> Bilan indicatif des saisies Transport</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}><span>Recettes Transport</span> <strong style={{ color: 'var(--success)' }}>{metrics.monthlyTransportRevenue} FCFA</strong></li>
                <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}><span>Carburant</span> <strong>- {metrics.monthlyFuelCost} FCFA</strong></li>
                <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}><span>Entretiens</span> <strong>- {metrics.monthlyMaintCost} FCFA</strong></li>
                <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}><span>Réparations Pannes</span> <strong>- {metrics.monthlyRepairCost} FCFA</strong></li>
                <li style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0 0', marginTop: '0.5rem', borderTop: '2px solid var(--border-color)', fontWeight: 'bold' }}>
                  <span>Solde Net (Estimé)</span> <span style={{ color: metrics.netBalance >= 0 ? 'var(--success)' : 'var(--danger)' }}>{metrics.netBalance >= 0 ? '+' : ''}{metrics.netBalance} FCFA</span>
                </li>
              </ul>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '1rem', fontStyle: 'italic' }}>* Les doubles saisies de carburant/maintenance dans les dépenses globales peuvent fausser ce résultat. Basé uniquement sur les onglets Transport.</p>
            </div>

            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--danger)' }}><AlertTriangle size={20} /> Alertes & Pannes</h3>
              {ongoingBreakdowns.length > 0 ? (
                <ul style={{ paddingLeft: '1.5rem', margin: 0 }}>
                  {ongoingBreakdowns.map(b => (
                    <li key={b.id} style={{ marginBottom: '0.5rem' }}>
                      <strong>{buses.find(x => x.id === b.busId)?.name || 'Bus Inconnu'}</strong> : {b.description} 
                      <span style={{ fontSize: '0.75rem', marginLeft: '0.5rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: b.severity === 'urgente' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: b.severity === 'urgente' ? 'var(--danger)' : 'var(--warning)' }}>{b.severity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Aucune panne en cours signalée.</p>
              )}
            </div>

            <div className="card">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}><Tool size={20} /> Prochains Entretiens</h3>
              {upcomingMaintenances.length > 0 ? (
                <ul style={{ paddingLeft: '1.5rem', margin: 0 }}>
                  {upcomingMaintenances.map(m => (
                    <li key={m.id} style={{ marginBottom: '0.5rem' }}>
                      <strong>{buses.find(x => x.id === m.busId)?.name || 'Bus Inconnu'}</strong> : {m.type} le {new Date(m.nextMaintenanceDate).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Aucun entretien planifié à venir.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TransportOverview;
