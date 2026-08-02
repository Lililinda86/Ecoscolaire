import React, { useState, useMemo } from 'react';
import { Fuel, Plus, Edit2 } from 'lucide-react';
import type { FuelExpense, Bus } from '../../types';
import TransportEmptyState from './TransportEmptyState';
import TransportTabHeader from './TransportTabHeader';

interface FuelTabProps {
  fuelExpenses: FuelExpense[];
  buses: Bus[];
  canAct: boolean;
  onAddFuel: () => void;
  onEditFuel: (expense: FuelExpense) => void;
}

const FuelTab: React.FC<FuelTabProps> = ({ fuelExpenses, buses, canAct, onAddFuel, onEditFuel }) => {
  const [filterBus, setFilterBus] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');

  const filteredExpenses = useMemo(() => {
    const filtered = fuelExpenses
      .filter(f => {
        if (filterBus !== 'all' && f.busId !== filterBus) return false;
        
        if (filterPeriod !== 'all') {
          const expenseDate = f.date; // assuming YYYY-MM-DD
          const today = new Date();
          const currentMonth = today.toISOString().substring(0, 7);
          const currentYear = today.getFullYear().toString();
          
          if (filterPeriod === 'month' && !expenseDate.startsWith(currentMonth)) return false;
          if (filterPeriod === 'year' && !expenseDate.startsWith(currentYear)) return false;
        }
        
        return true;
      });
      
    return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [fuelExpenses, filterBus, filterPeriod]);

  const hasActiveFilters = filterBus !== 'all' || filterPeriod !== 'all';
  const resetFilters = () => {
    setFilterBus('all');
    setFilterPeriod('all');
  };

  const totalFilteredCost = filteredExpenses.reduce((sum, f) => sum + (f.amount || 0), 0);

  if (fuelExpenses.length === 0) {
    return (
      <TransportEmptyState 
        icon={Fuel}
        title="Aucune dépense de carburant"
        description="Enregistrez vos achats de carburant pour suivre la consommation de votre flotte."
        canAct={canAct}
        actionLabel="Enregistrer un plein"
        onAction={onAddFuel}
      />
    );
  }

  return (
    <div>
      <TransportTabHeader
        title="Carburant"
        description="Suivi des pleins et dépenses en carburant"
        count={fuelExpenses.length}
        actionLabel="Enregistrer un plein"
        actionIcon={<Plus size={18} />}
        canAct={canAct}
        onAction={onAddFuel}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={resetFilters}
        filters={
          <>
            <select value={filterBus} onChange={(e) => setFilterBus(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', maxWidth: '200px' }}>
              <option value="all">Tous les bus</option>
              {buses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <option value="all">Toutes les périodes</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </>
        }
      />

      {filteredExpenses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
          Aucun résultat ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>Total des dépenses (sélection) :</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>{totalFilteredCost} FCFA</span>
          </div>

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead style={{ background: 'var(--bg-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Litres / Montant</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Prix/Litre</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Kilométrage</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Commentaire</th>
                  {canAct && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(f => {
                  const pricePerLiter = (f.amount > 0 && f.liters > 0) ? Math.round(f.amount / f.liters) : null;
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{new Date(f.date).toLocaleDateString()}</td>
                      <td style={{ padding: '1rem' }}><strong>{buses.find(b => b.id === f.busId)?.name || 'Inconnu'}</strong></td>
                      <td style={{ padding: '1rem' }}>{f.liters} L <br/><span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{f.amount} FCFA</span></td>
                      <td style={{ padding: '1rem' }}>{pricePerLiter ? `${pricePerLiter} FCFA` : '-'}</td>
                      <td style={{ padding: '1rem' }}>{f.mileage ? `${f.mileage} km` : '-'}</td>
                      <td style={{ padding: '1rem', maxWidth: '200px' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.comment}>{f.comment || '-'}</div>
                      </td>
                      {canAct && (
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button className="secondary" onClick={() => onEditFuel(f)} title="Modifier"><Edit2 size={16} /></button>
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

export default FuelTab;
