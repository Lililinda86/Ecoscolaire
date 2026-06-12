import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  UserPlus, GraduationCap, DollarSign, AlertCircle, 
  CheckCircle2, XCircle, FileText, MessageSquare, Briefcase, PlusCircle
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { db, isFirestoreConnected } = useAppContext();
  const navigate = useNavigate();

  // Mock data for KPIs - In a real scenario these would be calculated from db
  const todayStats = {
    presentStudents: Math.floor(db.students.length * 0.9),
    absentStudents: Math.floor(db.students.length * 0.1),
    presentStaff: db.staff.length,
    todayPayments: 150000, // FCFA
    pendingNotifications: 3
  };

  const monthStats = {
    revenues: 2500000, // FCFA
    expenses: 800000, // FCFA
    balance: 1700000, // FCFA
    newStudents: 12
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }} data-testid="dashboard-page">
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-color)', margin: 0 }}>
            {db.school?.name || 'Tableau de bord'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
            Année Académique {db.school?.academicYear || '2023-2024'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isFirestoreConnected ? 'var(--secondary-color)' : '#fee2e2', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600, color: isFirestoreConnected ? 'var(--text-color)' : '#991b1b' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isFirestoreConnected ? 'var(--success)' : 'var(--danger)' }} />
            {isFirestoreConnected ? 'Système en ligne' : 'Mode hors-ligne'}
          </div>
        </div>
      </div>

      {/* Actions Rapides */}
      <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(to right, #4f46e5, #3b82f6)', color: 'white', border: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlusCircle size={20} /> Actions Rapides
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/students')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <UserPlus size={18} /> Ajouter un élève
          </button>
          <button onClick={() => navigate('/staff')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Briefcase size={18} /> Ajouter un enseignant
          </button>
          <button onClick={() => navigate('/payments')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <DollarSign size={18} /> Enregistrer un paiement
          </button>
          <button onClick={() => navigate('/grades')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <FileText size={18} /> Générer un bulletin
          </button>
          <button onClick={() => navigate('/classes')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <GraduationCap size={18} /> Créer une classe
          </button>
          <button onClick={() => navigate('/communication')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <MessageSquare size={18} /> Envoyer WhatsApp
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* SECTION AUJOURD'HUI */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="var(--primary-color)" /> Aujourd'hui
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={16} color="var(--success)" /> Élèves présents
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.presentStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <XCircle size={16} color="var(--danger)" /> Élèves absents
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.absentStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <Briefcase size={16} color="var(--primary-color)" /> Personnel présent
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.presentStaff}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <DollarSign size={16} color="var(--success)" /> Recettes du jour
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{todayStats.todayPayments.toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* SECTION CE MOIS */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DollarSign size={18} color="var(--success)" /> Ce Mois
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Revenus</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{monthStats.revenues.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Dépenses</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--danger)' }}>{monthStats.expenses.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Solde Net</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary-color)' }}>{monthStats.balance.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <UserPlus size={16} color="var(--accent-color)" /> Nouveaux inscrits
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>+{monthStats.newStudents}</span>
            </div>
          </div>
        </div>

        {/* SECTION ALERTES */}
        <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} color="var(--warning)" /> Alertes & Tâches
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fffbeb', padding: '0.75rem', borderRadius: '8px' }}>
              <DollarSign size={16} color="#d97706" style={{ marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#92400e', fontSize: '0.875rem' }}>12 retards de paiement</div>
                <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Tranche 2 non soldée</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fef2f2', padding: '0.75rem', borderRadius: '8px' }}>
              <UserCircle2 size={16} color="#dc2626" style={{ marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#991b1b', fontSize: '0.875rem' }}>3 élèves absents {'>'} 3 jours</div>
                <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Nécessite appel aux parents</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#eff6ff', padding: '0.75rem', borderRadius: '8px' }}>
              <FileText size={16} color="#2563eb" style={{ marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.875rem' }}>Bulletins T2 à générer</div>
                <div style={{ fontSize: '0.75rem', color: '#1d4ed8' }}>Classe de CM2 incomplète</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

// Mock icon missing from import above
const Calendar: React.FC<any> = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const UserCircle2: React.FC<any> = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0"></path><circle cx="12" cy="10" r="4"></circle><circle cx="12" cy="12" r="10"></circle></svg>;

export default Dashboard;
