import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import Modal from '../components/Modal';
import { Building2, Plus, Edit2, Play, AlertCircle, CreditCard, LogOut } from 'lucide-react';
import type { School, SubscriptionPlan, SubscriptionStatus } from '../types';

const SuperAdmin: React.FC = () => {
  const { db, saveDB, currentUser, logout } = useAppContext();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentSchool, setCurrentSchool] = useState<Partial<School>>({});

  if (!currentUser || currentUser.role !== 'superAdmin') {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Accès refusé. Réservé au Super Admin.</div>;
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newDb = { ...db };
    
    if (currentSchool.id) {
      newDb.schools = newDb.schools.map(s => s.id === currentSchool.id ? { ...s, ...currentSchool } as School : s);
    } else {
      newDb.schools.push({ ...currentSchool, id: crypto.randomUUID(), createdAt: new Date().toISOString() } as School);
    }
    
    saveDB(newDb);
    setModalOpen(false);
  };

  const schools = db.schools || [];
  
  // Stats
  const activeSchools = schools.filter(s => s.subscriptionStatus === 'active').length;
  const trialSchools = schools.filter(s => s.subscriptionStatus === 'trial').length;
  const suspendedSchools = schools.filter(s => s.subscriptionStatus === 'suspended' || s.subscriptionStatus === 'expired').length;
  const totalRevenus = schools.reduce((sum, s) => sum + (s.amountPaid || 0), 0);

  return (
    <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Building2 /> Espace Super Admin SaaS</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestion globale des écoles clientes</p>
        </div>
        <button className="danger" onClick={logout}><LogOut size={18} /> Déconnexion</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--primary)' }}><Building2 size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Total Écoles</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{schools.length}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><Play size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Actives / Essai</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{activeSchools} / {trialSchools}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--danger)' }}><AlertCircle size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Suspendues</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{suspendedSchools}</p></div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--warning)' }}><CreditCard size={32} /></div>
          <div><h3 style={{ margin: 0, fontSize: '0.875rem' }}>Revenus Totaux</h3><p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>{totalRevenus.toLocaleString()} FCFA</p></div>
        </div>
      </div>

      {/* Liste des Écoles */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Liste des Clients</h2>
          <button onClick={() => { setCurrentSchool({ subscriptionStatus: 'trial', subscriptionPlan: 'starter' }); setModalOpen(true); }}><Plus size={18} /> Nouvelle École</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Code / Nom</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Abonnement</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Expiration</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schools.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem' }}><strong>{s.schoolCode}</strong><br/><small style={{ color: 'var(--text-muted)' }}>{s.name}</small></td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                    {s.subscriptionPlan?.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{ 
                    padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                    color: s.subscriptionStatus === 'active' ? '#10b981' : s.subscriptionStatus === 'trial' ? '#3b82f6' : '#ef4444',
                    background: s.subscriptionStatus === 'active' ? 'rgba(16, 185, 129, 0.1)' : s.subscriptionStatus === 'trial' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                  }}>
                    {s.subscriptionStatus?.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '1rem' }}>{s.subscriptionEndDate || 'Non défini'}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <button className="secondary" onClick={() => { setCurrentSchool(s); setModalOpen(true); }}><Edit2 size={16} /> Gérer</button>
                </td>
              </tr>
            ))}
            {schools.length === 0 && <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center' }}>Aucune école cliente.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Modal Création/Édition École */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Gestion École (Client)">
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Nom de l'école</label><input required value={currentSchool.name || ''} onChange={e => setCurrentSchool({...currentSchool, name: e.target.value})} /></div>
            <div className="form-group"><label>Code École (Unique)</label><input required value={currentSchool.schoolCode || ''} onChange={e => setCurrentSchool({...currentSchool, schoolCode: e.target.value})} /></div>
          </div>
          <div className="form-group"><label>Année Académique</label><input required value={currentSchool.academicYear || ''} onChange={e => setCurrentSchool({...currentSchool, academicYear: e.target.value})} placeholder="Ex: 2023-2024" /></div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Formule d'abonnement</label>
              <select required value={currentSchool.subscriptionPlan || 'starter'} onChange={e => setCurrentSchool({...currentSchool, subscriptionPlan: e.target.value as SubscriptionPlan})}>
                <option value="starter">Starter (Max 200 élèves)</option>
                <option value="standard">Standard (Max 1000 élèves + Parents)</option>
                <option value="premium">Premium (Illimité + Automatisations)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Statut Abonnement</label>
              <select required value={currentSchool.subscriptionStatus || 'trial'} onChange={e => setCurrentSchool({...currentSchool, subscriptionStatus: e.target.value as SubscriptionStatus})}>
                <option value="trial">Essai (Trial)</option>
                <option value="active">Actif</option>
                <option value="suspended">Suspendu</option>
                <option value="expired">Expiré</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Date de Début</label><input type="date" value={currentSchool.subscriptionStartDate || ''} onChange={e => setCurrentSchool({...currentSchool, subscriptionStartDate: e.target.value})} /></div>
            <div className="form-group"><label>Date d'Expiration</label><input type="date" value={currentSchool.subscriptionEndDate || ''} onChange={e => setCurrentSchool({...currentSchool, subscriptionEndDate: e.target.value})} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group"><label>Montant Payé (Revenus)</label><input type="number" value={currentSchool.amountPaid || ''} onChange={e => setCurrentSchool({...currentSchool, amountPaid: parseInt(e.target.value)})} /></div>
            <div className="form-group"><label>Prochain Paiement</label><input type="date" value={currentSchool.nextPaymentDate || ''} onChange={e => setCurrentSchool({...currentSchool, nextPaymentDate: e.target.value})} /></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Annuler</button>
            <button type="submit">Sauvegarder Client</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default SuperAdmin;
