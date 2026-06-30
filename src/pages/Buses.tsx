import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Bus, Staff, BusRoute, FuelExpense, Maintenance, Breakdown } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Trash2, Bus as BusIcon, Map as RouteIcon, Fuel, PenTool as Tool, AlertTriangle, Users, LayoutDashboard } from 'lucide-react';

const Buses: React.FC = () => {
  const { db, saveDB, currentUser } = useAppContext();
  
  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary', 'driver'].includes(currentUser.role)) return null;

  const [activeTab, setActiveTab] = useState<'dashboard' | 'fleet' | 'drivers' | 'routes' | 'fuel' | 'maintenance' | 'breakdowns'>('dashboard');

  // Modal states
  const [isBusModalOpen, setBusModalOpen] = useState(false);
  const [currentBus, setCurrentBus] = useState<Partial<Bus>>({});

  const [isDriverModalOpen, setDriverModalOpen] = useState(false);
  const [currentDriver, setCurrentDriver] = useState<Partial<Staff>>({});

  const [isRouteModalOpen, setRouteModalOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<Partial<BusRoute>>({});

  const [isFuelModalOpen, setFuelModalOpen] = useState(false);
  const [currentFuel, setCurrentFuel] = useState<Partial<FuelExpense>>({});

  const [isMaintModalOpen, setMaintModalOpen] = useState(false);
  const [currentMaint, setCurrentMaint] = useState<Partial<Maintenance>>({});

  const [isBreakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [currentBreakdown, setCurrentBreakdown] = useState<Partial<Breakdown>>({});

  // Ensure arrays exist
  const buses = db.buses || [];
  const drivers = (db.staff || []).filter(s => s.role === 'driver');
  const routes = db.busRoutes || [];
  const fuelExpenses = db.fuelExpenses || [];
  const maintenances = db.maintenances || [];
  const breakdowns = db.breakdowns || [];

  // --- Helpers for Saves ---
  const saveEntity = <T extends { id: string }>(collectionName: keyof typeof db, entity: Partial<T>) => {
    const newDb = { ...db };
    const collection = (newDb[collectionName] as T[]) || [];
    if (entity.id) {
      newDb[collectionName] = collection.map(item => item.id === entity.id ? entity : item) as any;
    } else {
      newDb[collectionName] = [...collection, { ...entity, id: crypto.randomUUID() }] as any;
    }
    saveDB(newDb);
  };

  const deleteEntity = <T extends { id: string }>(collectionName: keyof typeof db, id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      const newDb = { ...db };
      newDb[collectionName] = ((newDb[collectionName] as T[]) || []).filter(item => item.id !== id) as any;
      saveDB(newDb);
    }
  };

  // --- Stats Dashboard ---
  const activeBuses = buses.filter(b => b.status === 'actif').length;
  const brokenBuses = buses.filter(b => b.status === 'en_panne').length;
  
  const currentMonth = new Date().toISOString().substring(0, 7);
  const monthlyFuelCost = fuelExpenses
    .filter(f => f.date.startsWith(currentMonth))
    .reduce((sum, f) => sum + (f.amount || 0), 0);
  const monthlyMaintCost = maintenances
    .filter(m => m.date.startsWith(currentMonth))
    .reduce((sum, m) => sum + (m.amount || 0), 0);
  
  const totalTransportCost = monthlyFuelCost + monthlyMaintCost;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Transport Scolaire</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button className={activeTab === 'dashboard' ? 'primary' : 'secondary'} onClick={() => setActiveTab('dashboard')}><LayoutDashboard size={18} /> Dashboard</button>
        <button className={activeTab === 'fleet' ? 'primary' : 'secondary'} onClick={() => setActiveTab('fleet')}><BusIcon size={18} /> Flotte</button>
        <button className={activeTab === 'drivers' ? 'primary' : 'secondary'} onClick={() => setActiveTab('drivers')}><Users size={18} /> Conducteurs</button>
        <button className={activeTab === 'routes' ? 'primary' : 'secondary'} onClick={() => setActiveTab('routes')}><RouteIcon size={18} /> Lignes</button>
        <button className={activeTab === 'fuel' ? 'primary' : 'secondary'} onClick={() => setActiveTab('fuel')}><Fuel size={18} /> Carburant</button>
        <button className={activeTab === 'maintenance' ? 'primary' : 'secondary'} onClick={() => setActiveTab('maintenance')}><Tool size={18} /> Entretien</button>
        <button className={activeTab === 'breakdowns' ? 'primary' : 'secondary'} onClick={() => setActiveTab('breakdowns')}><AlertTriangle size={18} /> Pannes</button>
      </div>

      {/* --- DASHBOARD --- */}
      {activeTab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}><BusIcon size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Total Bus</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{buses.length}</p></div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><BusIcon size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Bus Actifs</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{activeBuses}</p></div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)' }}><AlertTriangle size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>En Panne</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{brokenBuses}</p></div>
            </div>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--warning)' }}><Fuel size={32} /></div>
              <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Dépenses (Mois)</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{totalTransportCost} FCFA</p></div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div className="card">
              <h3>Dernières Pannes Signalées</h3>
              <ul>
                {breakdowns.filter(b => b.status !== 'réparée').map(b => (
                  <li key={b.id}>{b.date} - {buses.find(x => x.id === b.busId)?.name} : {b.description} ({b.severity})</li>
                ))}
                {breakdowns.filter(b => b.status !== 'réparée').length === 0 && <li>Aucune panne en cours.</li>}
              </ul>
            </div>
            <div className="card">
              <h3>Entretiens à prévoir</h3>
              <ul>
                {maintenances.filter(m => new Date(m.nextMaintenanceDate) >= new Date()).slice(0, 5).map(m => (
                  <li key={m.id}>{buses.find(x => x.id === m.busId)?.name} : {m.type} le {m.nextMaintenanceDate}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* --- FLOTTE --- */}
      {activeTab === 'fleet' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentBus({}); setBusModalOpen(true); }}><Plus size={18} /> Ajouter Bus</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Nom/Numéro</th><th style={{ padding: '1rem', textAlign: 'left' }}>Immatriculation</th><th style={{ padding: '1rem', textAlign: 'left' }}>Places</th><th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {buses.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{b.name}</td>
                  <td style={{ padding: '1rem' }}>{b.plate}</td>
                  <td style={{ padding: '1rem' }}>{b.capacity}</td>
                  <td style={{ padding: '1rem' }}>{b.status}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => { setCurrentBus(b); setBusModalOpen(true); }} style={{ marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                    <button className="danger" onClick={() => deleteEntity('buses', b.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- CONDUCTEURS --- */}
      {activeTab === 'drivers' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentDriver({ role: 'driver' }); setDriverModalOpen(true); }}><Plus size={18} /> Ajouter Conducteur</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Nom</th><th style={{ padding: '1rem', textAlign: 'left' }}>Téléphone</th><th style={{ padding: '1rem', textAlign: 'left' }}>Permis</th><th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {drivers.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{d.name}</td>
                  <td style={{ padding: '1rem' }}>{d.phone}</td>
                  <td style={{ padding: '1rem' }}>{d.licenseNumber}</td>
                  <td style={{ padding: '1rem' }}>{d.status}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => { setCurrentDriver(d); setDriverModalOpen(true); }} style={{ marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                    <button className="danger" onClick={() => deleteEntity('staff', d.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- LIGNES --- */}
      {activeTab === 'routes' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentRoute({}); setRouteModalOpen(true); }}><Plus size={18} /> Ajouter Ligne</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Ligne</th><th style={{ padding: '1rem', textAlign: 'left' }}>Quartiers</th><th style={{ padding: '1rem', textAlign: 'left' }}>Horaires</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {routes.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{r.name}</td>
                  <td style={{ padding: '1rem' }}>{r.areas}</td>
                  <td style={{ padding: '1rem' }}>{r.departureTime} - {r.returnTime}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => { setCurrentRoute(r); setRouteModalOpen(true); }} style={{ marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                    <button className="danger" onClick={() => deleteEntity('busRoutes', r.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- CARBURANT --- */}
      {activeTab === 'fuel' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentFuel({}); setFuelModalOpen(true); }}><Plus size={18} /> Saisir Plein</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Date</th><th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th><th style={{ padding: '1rem', textAlign: 'left' }}>Litres / Montant</th><th style={{ padding: '1rem', textAlign: 'left' }}>Kilométrage</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {fuelExpenses.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{f.date}</td>
                  <td style={{ padding: '1rem' }}>{buses.find(b => b.id === f.busId)?.name || 'Inconnu'}</td>
                  <td style={{ padding: '1rem' }}>{f.liters} L / {f.amount} FCFA</td>
                  <td style={{ padding: '1rem' }}>{f.mileage} km</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="danger" onClick={() => deleteEntity('fuelExpenses', f.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ENTRETIEN --- */}
      {activeTab === 'maintenance' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentMaint({}); setMaintModalOpen(true); }}><Plus size={18} /> Nouvel Entretien</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Date</th><th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th><th style={{ padding: '1rem', textAlign: 'left' }}>Type</th><th style={{ padding: '1rem', textAlign: 'left' }}>Coût</th><th style={{ padding: '1rem', textAlign: 'left' }}>Prochain</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {maintenances.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{m.date}</td>
                  <td style={{ padding: '1rem' }}>{buses.find(b => b.id === m.busId)?.name || 'Inconnu'}</td>
                  <td style={{ padding: '1rem' }}>{m.type}</td>
                  <td style={{ padding: '1rem' }}>{m.amount} FCFA</td>
                  <td style={{ padding: '1rem' }}>{m.nextMaintenanceDate}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="danger" onClick={() => deleteEntity('maintenances', m.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- PANNES --- */}
      {activeTab === 'breakdowns' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--border-color)' }}>
            <button onClick={() => { setCurrentBreakdown({}); setBreakdownModalOpen(true); }}><Plus size={18} /> Signaler Panne</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)' }}>
              <tr><th style={{ padding: '1rem', textAlign: 'left' }}>Date</th><th style={{ padding: '1rem', textAlign: 'left' }}>Bus</th><th style={{ padding: '1rem', textAlign: 'left' }}>Gravité</th><th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th><th style={{ padding: '1rem', textAlign: 'left' }}>Coût R.</th><th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {breakdowns.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{b.date}</td>
                  <td style={{ padding: '1rem' }}>{buses.find(x => x.id === b.busId)?.name || 'Inconnu'}</td>
                  <td style={{ padding: '1rem' }}>{b.severity}</td>
                  <td style={{ padding: '1rem' }}>{b.status}</td>
                  <td style={{ padding: '1rem' }}>{b.actualCost || 0} FCFA</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => { setCurrentBreakdown(b); setBreakdownModalOpen(true); }} style={{ marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                    <button className="danger" onClick={() => deleteEntity('breakdowns', b.id)}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      {/* MODALS */}
      {/* Bus Modal */}
      <Modal isOpen={isBusModalOpen} onClose={() => setBusModalOpen(false)} title="Flotte - Bus">
        <form onSubmit={e => { e.preventDefault(); saveEntity('buses', currentBus); setBusModalOpen(false); }}>
          <div className="form-group"><label>Nom/Numéro</label><input required value={currentBus.name || ''} onChange={e => setCurrentBus({...currentBus, name: e.target.value})} /></div>
          <div className="form-group"><label>Immatriculation</label><input required value={currentBus.plate || ''} onChange={e => setCurrentBus({...currentBus, plate: e.target.value})} /></div>
          <div className="form-group"><label>Places</label><input type="number" required value={currentBus.capacity || ''} onChange={e => setCurrentBus({...currentBus, capacity: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Statut</label>
            <select required value={currentBus.status || 'actif'} onChange={e => setCurrentBus({...currentBus, status: e.target.value as any})}>
              <option value="actif">Actif</option><option value="en_panne">En panne</option><option value="en_entretien">En entretien</option>
            </select>
          </div>
          <div className="form-group"><label>Ligne affectée</label>
            <select value={currentBus.routeId || ''} onChange={e => setCurrentBus({...currentBus, routeId: e.target.value})}>
              <option value="">-- Aucune --</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setBusModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Driver Modal */}
      <Modal isOpen={isDriverModalOpen} onClose={() => setDriverModalOpen(false)} title="Conducteur">
        <form onSubmit={e => { e.preventDefault(); saveEntity('staff', currentDriver); setDriverModalOpen(false); }}>
          <div className="form-group"><label>Nom & Prénom</label><input required value={currentDriver.name || ''} onChange={e => setCurrentDriver({...currentDriver, name: e.target.value})} /></div>
          <div className="form-group"><label>Téléphone</label><input required value={currentDriver.phone || ''} onChange={e => setCurrentDriver({...currentDriver, phone: e.target.value})} /></div>
          <div className="form-group"><label>Permis</label><input required value={currentDriver.licenseNumber || ''} onChange={e => setCurrentDriver({...currentDriver, licenseNumber: e.target.value})} /></div>
          <div className="form-group"><label>Statut</label>
            <select required value={currentDriver.status || 'actif'} onChange={e => setCurrentDriver({...currentDriver, status: e.target.value as any})}>
              <option value="actif">Actif</option><option value="absent">Absent</option><option value="remplacé">Remplacé</option>
            </select>
          </div>
          <div className="form-group"><label>Bus affecté</label>
            <select value={currentDriver.assignedBusId || ''} onChange={e => setCurrentDriver({...currentDriver, assignedBusId: e.target.value})}>
              <option value="">-- Aucun --</option>
              {buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setDriverModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Route Modal */}
      <Modal isOpen={isRouteModalOpen} onClose={() => setRouteModalOpen(false)} title="Ligne / Trajet">
        <form onSubmit={e => { e.preventDefault(); saveEntity('busRoutes', currentRoute); setRouteModalOpen(false); }}>
          <div className="form-group"><label>Nom Ligne</label><input required value={currentRoute.name || ''} onChange={e => setCurrentRoute({...currentRoute, name: e.target.value})} /></div>
          <div className="form-group"><label>Quartiers Desservis</label><input required value={currentRoute.areas || ''} onChange={e => setCurrentRoute({...currentRoute, areas: e.target.value})} /></div>
          <div className="form-group"><label>Heure Départ Matin</label><input type="time" required value={currentRoute.departureTime || ''} onChange={e => setCurrentRoute({...currentRoute, departureTime: e.target.value})} /></div>
          <div className="form-group"><label>Heure Retour Soir</label><input type="time" required value={currentRoute.returnTime || ''} onChange={e => setCurrentRoute({...currentRoute, returnTime: e.target.value})} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setRouteModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Fuel Modal */}
      <Modal isOpen={isFuelModalOpen} onClose={() => setFuelModalOpen(false)} title="Dépense Carburant">
        <form onSubmit={e => { e.preventDefault(); saveEntity('fuelExpenses', currentFuel); setFuelModalOpen(false); }}>
          <div className="form-group"><label>Date</label><input type="date" required value={currentFuel.date || ''} onChange={e => setCurrentFuel({...currentFuel, date: e.target.value})} /></div>
          <div className="form-group"><label>Bus</label>
            <select required value={currentFuel.busId || ''} onChange={e => setCurrentFuel({...currentFuel, busId: e.target.value})}>
              <option value="">Sélectionner</option>{buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Montant (FCFA)</label><input type="number" required value={currentFuel.amount || ''} onChange={e => setCurrentFuel({...currentFuel, amount: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Litres</label><input type="number" required value={currentFuel.liters || ''} onChange={e => setCurrentFuel({...currentFuel, liters: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Kilométrage</label><input type="number" required value={currentFuel.mileage || ''} onChange={e => setCurrentFuel({...currentFuel, mileage: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Commentaire</label><input value={currentFuel.comment || ''} onChange={e => setCurrentFuel({...currentFuel, comment: e.target.value})} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setFuelModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Maintenance Modal */}
      <Modal isOpen={isMaintModalOpen} onClose={() => setMaintModalOpen(false)} title="Fiche d'Entretien">
        <form onSubmit={e => { e.preventDefault(); saveEntity('maintenances', currentMaint); setMaintModalOpen(false); }}>
          <div className="form-group"><label>Date</label><input type="date" required value={currentMaint.date || ''} onChange={e => setCurrentMaint({...currentMaint, date: e.target.value})} /></div>
          <div className="form-group"><label>Bus</label>
            <select required value={currentMaint.busId || ''} onChange={e => setCurrentMaint({...currentMaint, busId: e.target.value})}>
              <option value="">Sélectionner</option>{buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Type d'entretien (Vidange, Freins...)</label><input required value={currentMaint.type || ''} onChange={e => setCurrentMaint({...currentMaint, type: e.target.value})} /></div>
          <div className="form-group"><label>Montant (FCFA)</label><input type="number" required value={currentMaint.amount || ''} onChange={e => setCurrentMaint({...currentMaint, amount: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Garage</label><input required value={currentMaint.garage || ''} onChange={e => setCurrentMaint({...currentMaint, garage: e.target.value})} /></div>
          <div className="form-group"><label>Date Prochain Entretien</label><input type="date" required value={currentMaint.nextMaintenanceDate || ''} onChange={e => setCurrentMaint({...currentMaint, nextMaintenanceDate: e.target.value})} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setMaintModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Breakdown Modal */}
      <Modal isOpen={isBreakdownModalOpen} onClose={() => setBreakdownModalOpen(false)} title="Signalement Panne">
        <form onSubmit={e => { e.preventDefault(); saveEntity('breakdowns', currentBreakdown); setBreakdownModalOpen(false); }}>
          <div className="form-group"><label>Date</label><input type="date" required value={currentBreakdown.date || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, date: e.target.value})} /></div>
          <div className="form-group"><label>Bus</label>
            <select required value={currentBreakdown.busId || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, busId: e.target.value})}>
              <option value="">Sélectionner</option>{buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Description</label><input required value={currentBreakdown.description || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, description: e.target.value})} /></div>
          <div className="form-group"><label>Gravité</label>
            <select required value={currentBreakdown.severity || 'légère'} onChange={e => setCurrentBreakdown({...currentBreakdown, severity: e.target.value as any})}>
              <option value="légère">Légère</option><option value="moyenne">Moyenne</option><option value="urgente">Urgente</option>
            </select>
          </div>
          <div className="form-group"><label>Statut</label>
            <select required value={currentBreakdown.status || 'signalée'} onChange={e => setCurrentBreakdown({...currentBreakdown, status: e.target.value as any})}>
              <option value="signalée">Signalée</option><option value="en_réparation">En réparation</option><option value="réparée">Réparée</option>
            </select>
          </div>
          <div className="form-group"><label>Coût Estimé</label><input type="number" required value={currentBreakdown.estimatedCost || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, estimatedCost: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Coût Réel (Optionnel)</label><input type="number" value={currentBreakdown.actualCost || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, actualCost: parseInt(e.target.value)})} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setBreakdownModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

    </div>
  );
};

export default Buses;
