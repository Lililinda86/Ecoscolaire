import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Bus, BusRoute, FuelExpense, Maintenance, Breakdown } from '../types';
import Modal from '../components/Modal';
import { Bus as BusIcon, Map as RouteIcon, Fuel, PenTool as Tool, AlertTriangle, Users, LayoutDashboard } from 'lucide-react';
import TransportOverview from '../components/transport/TransportOverview';
import FleetTab from '../components/transport/FleetTab';
import DriversTab from '../components/transport/DriversTab';
import RoutesTab from '../components/transport/RoutesTab';
import FuelTab from '../components/transport/FuelTab';
import MaintenanceTab from '../components/transport/MaintenanceTab';
import BreakdownsTab from '../components/transport/BreakdownsTab';
import { calculateTransportMetrics } from '../utils/transportMetrics';

const Buses: React.FC = () => {
  const { db, safeMergeDB, currentUser, currentSchool } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'fleet' | 'drivers' | 'routes' | 'fuel' | 'maintenance' | 'breakdowns'>('dashboard');

  // Modal states
  const [isBusModalOpen, setBusModalOpen] = useState(false);
  const [currentBus, setCurrentBus] = useState<Partial<Bus>>({});

  const [isRouteModalOpen, setRouteModalOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<Partial<BusRoute>>({});

  const [isFuelModalOpen, setFuelModalOpen] = useState(false);
  const [currentFuel, setCurrentFuel] = useState<Partial<FuelExpense>>({});

  const [isMaintModalOpen, setMaintModalOpen] = useState(false);
  const [currentMaint, setCurrentMaint] = useState<Partial<Maintenance>>({});

  const [isBreakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [currentBreakdown, setCurrentBreakdown] = useState<Partial<Breakdown>>({});

  const isDriver = currentUser?.role === 'driver';

  // If driver, force active tab to breakdowns if it was dashboard
  React.useEffect(() => {
    if (isDriver && activeTab === 'dashboard') {
      setActiveTab('breakdowns');
    }
  }, [isDriver, activeTab]);

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary', 'driver'].includes(currentUser.role)) return null;

  // Ensure arrays exist
  const buses = (db.buses || []).filter(b => b.isActive !== false);
  const drivers = (db.staff || []).filter(s =>
    s.staffType === 'driver' &&
    s.schoolId === currentSchool?.id &&
    s.employmentStatus !== 'inactive' &&
    s.employmentStatus !== 'departed' &&
    s.isActive !== false &&
    s.active !== false
  );
  const routes = (db.busRoutes || []).filter(r => r.isActive !== false);
  const fuelExpenses = db.fuelExpenses || [];
  const maintenances = db.maintenances || [];
  const breakdowns = db.breakdowns || [];

  // --- Helpers for Saves ---
  const saveEntity = async <T extends { id: string, schoolId?: string }>(collectionName: keyof typeof db, entity: Partial<T>) => {
    if (!currentSchool?.id) {
      window.alert('Aucune école active sélectionnée.');
      return false;
    }

    try {
      const newDb = { ...db };
      const collection = (newDb[collectionName] as T[]) || [];
      let finalEntity: T;

      if (entity.id) {
        const existing = collection.find(item => item.id === entity.id);
        if (!existing) {
          window.alert('Document introuvable.');
          return false;
        }
        if (existing.schoolId && existing.schoolId !== currentSchool.id) {
          window.alert('Erreur: Ce document appartient à une autre école.');
          return false;
        }
        finalEntity = {
          ...existing,
          ...entity,
          id: existing.id,
          schoolId: existing.schoolId || currentSchool.id
        } as T;
      } else {
        finalEntity = {
          ...entity,
          id: crypto.randomUUID(),
          schoolId: currentSchool.id
        } as T;

        if (collectionName === 'buses' || collectionName === 'busRoutes') {
          (finalEntity as unknown as { isActive: boolean }).isActive = true;
        }
      }

      Object.keys(finalEntity).forEach(key => {
        if (finalEntity[key as keyof T] === undefined) {
          delete finalEntity[key as keyof T];
        }
      });

      if (entity.id) {
        newDb[collectionName] = collection.map(item => item.id === entity.id ? finalEntity : item) as never;
      } else {
        newDb[collectionName] = [...collection, finalEntity] as never;
      }

      await safeMergeDB(newDb);
      return true;
    } catch (err: unknown) {
      console.error(err);
      if ((err as { code?: string })?.code === 'permission-denied') {
        window.alert("Permission refusée : Vous n'avez pas les droits pour cette opération.");
      } else {
        window.alert("Une erreur est survenue lors de la sauvegarde.");
      }
      return false;
    }
  };

  const deactivateEntity = async <T extends { id: string, isActive?: boolean }>(collectionName: 'buses' | 'busRoutes', id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir désactiver cet élément ?')) {
      try {
        const newDb = { ...db };
        const collection = (newDb[collectionName] as unknown as T[]) || [];
        const existing = collection.find(item => item.id === id);
        if (!existing) return;

        const finalEntity = { ...existing, isActive: false };
        newDb[collectionName] = collection.map(item => item.id === id ? finalEntity : item) as never;

        await safeMergeDB(newDb);
      } catch (err: unknown) {
        console.error(err);
        if ((err as { code?: string })?.code === 'permission-denied') {
          window.alert("Permission refusée.");
        } else {
          window.alert("Une erreur est survenue lors de la désactivation.");
        }
      }
    }
  };

  // --- Metrics ---
  const metrics = calculateTransportMetrics(
    buses,
    breakdowns,
    fuelExpenses,
    maintenances,
    db.payments || [],
    db.students || []
  );

  // --- Permissions UI ---
  const secretaryCanManageAllTransport = currentUser?.role === 'secretary' && currentSchool?.transportPolicy?.secretaryManageAll === true;
  const canViewDashboard = !isDriver;
  const canViewFleet = !isDriver;
  const canViewDrivers = !isDriver;
  const canActAdministrative = ['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role) || secretaryCanManageAllTransport;
  const canActFinancial = ['superAdmin', 'owner', 'director', 'accountant'].includes(currentUser.role) || secretaryCanManageAllTransport;
  const canViewBreakdowns = ['superAdmin', 'owner', 'director', 'driver'].includes(currentUser.role) || secretaryCanManageAllTransport;
  const canActBreakdown = ['superAdmin', 'owner', 'director', 'driver'].includes(currentUser.role) || secretaryCanManageAllTransport;
  const canEditBreakdown = ['superAdmin', 'owner', 'director'].includes(currentUser.role) || secretaryCanManageAllTransport;

  // --- Handling Loading State ---
  if (!currentSchool) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Aucune école sélectionnée.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Transport Scolaire</h1>
      </div>

      <div role="tablist" aria-label="Onglets de Transport" style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        {canViewDashboard && <button role="tab" aria-selected={activeTab === 'dashboard'} aria-controls="panel-dashboard" id="tab-dashboard" className={activeTab === 'dashboard' ? 'primary' : 'secondary'} onClick={() => setActiveTab('dashboard')}><LayoutDashboard size={18} /> Vue d'ensemble</button>}
        {canViewFleet && <button role="tab" aria-selected={activeTab === 'fleet'} aria-controls="panel-fleet" id="tab-fleet" className={activeTab === 'fleet' ? 'primary' : 'secondary'} onClick={() => setActiveTab('fleet')}><BusIcon size={18} /> Flotte</button>}
        {canViewDrivers && <button role="tab" aria-selected={activeTab === 'drivers'} aria-controls="panel-drivers" id="tab-drivers" className={activeTab === 'drivers' ? 'primary' : 'secondary'} onClick={() => setActiveTab('drivers')}><Users size={18} /> Conducteurs</button>}
        {canActAdministrative && <button role="tab" aria-selected={activeTab === 'routes'} aria-controls="panel-routes" id="tab-routes" className={activeTab === 'routes' ? 'primary' : 'secondary'} onClick={() => setActiveTab('routes')}><RouteIcon size={18} /> Circuits</button>}
        {canActFinancial && <button role="tab" aria-selected={activeTab === 'fuel'} aria-controls="panel-fuel" id="tab-fuel" className={activeTab === 'fuel' ? 'primary' : 'secondary'} onClick={() => setActiveTab('fuel')}><Fuel size={18} /> Carburant</button>}
        {canActFinancial && <button role="tab" aria-selected={activeTab === 'maintenance'} aria-controls="panel-maintenance" id="tab-maintenance" className={activeTab === 'maintenance' ? 'primary' : 'secondary'} onClick={() => setActiveTab('maintenance')}><Tool size={18} /> Entretiens</button>}
        {canViewBreakdowns && <button role="tab" aria-selected={activeTab === 'breakdowns'} aria-controls="panel-breakdowns" id="tab-breakdowns" className={activeTab === 'breakdowns' ? 'primary' : 'secondary'} onClick={() => setActiveTab('breakdowns')}><AlertTriangle size={18} /> Pannes</button>}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'dashboard' && canViewDashboard && (
        <TransportOverview
          metrics={metrics}
          buses={buses}
          breakdowns={breakdowns}
          maintenances={maintenances}
        />
      )}

      {activeTab === 'fleet' && canViewFleet && (
        <FleetTab
          buses={buses}
          canAct={canActAdministrative}
          onAddBus={() => { setCurrentBus({}); setBusModalOpen(true); }}
          onEditBus={(b) => { setCurrentBus(b); setBusModalOpen(true); }}
          onDeactivateBus={(id) => deactivateEntity('buses', id)}
        />
      )}

      {activeTab === 'drivers' && canViewDrivers && (
        <DriversTab
          drivers={drivers}
          canAct={canActAdministrative}
        />
      )}

      {activeTab === 'routes' && canActAdministrative && (
        <RoutesTab
          routes={routes}
          buses={buses}
          canAct={canActAdministrative}
          onAddRoute={() => { setCurrentRoute({}); setRouteModalOpen(true); }}
          onEditRoute={(r) => { setCurrentRoute(r); setRouteModalOpen(true); }}
          onDeactivateRoute={(id) => deactivateEntity('busRoutes', id)}
        />
      )}

      {activeTab === 'fuel' && canActFinancial && (
        <FuelTab
          fuelExpenses={fuelExpenses}
          buses={buses}
          canAct={canActFinancial}
          onAddFuel={() => { setCurrentFuel({}); setFuelModalOpen(true); }}
          onEditFuel={(f) => { setCurrentFuel(f); setFuelModalOpen(true); }}
        />
      )}

      {activeTab === 'maintenance' && canActFinancial && (
        <MaintenanceTab
          maintenances={maintenances}
          buses={buses}
          canAct={canActFinancial}
          onAddMaintenance={() => { setCurrentMaint({}); setMaintModalOpen(true); }}
          onEditMaintenance={(m) => { setCurrentMaint(m); setMaintModalOpen(true); }}
        />
      )}

      {activeTab === 'breakdowns' && canViewBreakdowns && (
        <BreakdownsTab
          breakdowns={breakdowns}
          buses={buses}
          canAct={canActBreakdown}
          canEdit={canEditBreakdown}
          onAddBreakdown={() => { setCurrentBreakdown({}); setBreakdownModalOpen(true); }}
          onEditBreakdown={(b) => { setCurrentBreakdown(b); setBreakdownModalOpen(true); }}
        />
      )}
      </div>


      {/* MODALS */}
      {/* Bus Modal */}
      <Modal isOpen={isBusModalOpen} onClose={() => setBusModalOpen(false)} title="Flotte - Bus">
        <form onSubmit={async e => {
          e.preventDefault();
          const success = await saveEntity('buses', currentBus);
          if (success) setBusModalOpen(false);
        }}>
          <div className="form-group"><label>Nom/Numéro</label><input required value={currentBus.name || ''} onChange={e => setCurrentBus({...currentBus, name: e.target.value})} /></div>
          <div className="form-group"><label>Immatriculation</label><input required value={currentBus.plate || ''} onChange={e => setCurrentBus({...currentBus, plate: e.target.value})} /></div>
          <div className="form-group"><label>Places</label><input type="number" required value={currentBus.capacity || ''} onChange={e => setCurrentBus({...currentBus, capacity: parseInt(e.target.value)})} /></div>
          <div className="form-group"><label>Statut</label>
            <select required value={currentBus.status || 'actif'} onChange={e => setCurrentBus({...currentBus, status: e.target.value as Bus['status']})}>
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



      {/* Route Modal */}
      <Modal isOpen={isRouteModalOpen} onClose={() => setRouteModalOpen(false)} title="Ligne / Trajet">
        <form onSubmit={async e => {
          e.preventDefault();
          const success = await saveEntity('busRoutes', currentRoute);
          if (success) setRouteModalOpen(false);
        }}>
          <div className="form-group"><label>Nom Ligne</label><input required value={currentRoute.name || ''} onChange={e => setCurrentRoute({...currentRoute, name: e.target.value})} /></div>
          <div className="form-group"><label>Quartiers Desservis</label><input required value={currentRoute.areas || ''} onChange={e => setCurrentRoute({...currentRoute, areas: e.target.value})} /></div>
          <div className="form-group"><label>Heure Départ Matin</label><input type="time" required value={currentRoute.departureTime || ''} onChange={e => setCurrentRoute({...currentRoute, departureTime: e.target.value})} /></div>
          <div className="form-group"><label>Heure Retour Soir</label><input type="time" required value={currentRoute.returnTime || ''} onChange={e => setCurrentRoute({...currentRoute, returnTime: e.target.value})} /></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setRouteModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

      {/* Fuel Modal */}
      <Modal isOpen={isFuelModalOpen} onClose={() => setFuelModalOpen(false)} title="Dépense Carburant">
        <form onSubmit={async e => {
          e.preventDefault();
          const success = await saveEntity('fuelExpenses', currentFuel);
          if (success) setFuelModalOpen(false);
        }}>
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
        <form onSubmit={async e => {
          e.preventDefault();
          const success = await saveEntity('maintenances', currentMaint);
          if (success) setMaintModalOpen(false);
        }}>
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
        <form onSubmit={async e => {
          e.preventDefault();
          const dataToSave = { ...currentBreakdown };
          if (isDriver) {
            dataToSave.status = 'signalée';
            delete dataToSave.estimatedCost;
            delete dataToSave.actualCost;
          }
          const success = await saveEntity('breakdowns', dataToSave);
          if (success) setBreakdownModalOpen(false);
        }}>
          <div className="form-group"><label>Date</label><input type="date" required value={currentBreakdown.date || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, date: e.target.value})} /></div>
          <div className="form-group"><label>Bus</label>
            <select required value={currentBreakdown.busId || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, busId: e.target.value})}>
              <option value="">Sélectionner</option>{buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Description</label><input required value={currentBreakdown.description || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, description: e.target.value})} /></div>
          <div className="form-group"><label>Gravité</label>
            <select required value={currentBreakdown.severity || 'légère'} onChange={e => setCurrentBreakdown({...currentBreakdown, severity: e.target.value as Breakdown['severity']})}>
              <option value="légère">Légère</option><option value="moyenne">Moyenne</option><option value="urgente">Urgente</option>
            </select>
          </div>

          {!isDriver && (
            <>
              <div className="form-group"><label>Statut</label>
                <select required value={currentBreakdown.status || 'signalée'} onChange={e => setCurrentBreakdown({...currentBreakdown, status: e.target.value as Breakdown['status']})}>
                  <option value="signalée">Signalée</option><option value="en_réparation">En réparation</option><option value="réparée">Réparée</option>
                </select>
              </div>
              <div className="form-group"><label>Coût Estimé</label><input type="number" required value={currentBreakdown.estimatedCost || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, estimatedCost: parseInt(e.target.value)})} /></div>
              <div className="form-group"><label>Coût Réel (Optionnel)</label><input type="number" value={currentBreakdown.actualCost || ''} onChange={e => setCurrentBreakdown({...currentBreakdown, actualCost: parseInt(e.target.value)})} /></div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}><button type="button" className="secondary" onClick={() => setBreakdownModalOpen(false)}>Annuler</button><button type="submit">Sauvegarder</button></div>
        </form>
      </Modal>

    </div>
  );
};

export default Buses;
