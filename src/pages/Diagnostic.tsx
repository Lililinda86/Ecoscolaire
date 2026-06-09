import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Database, Server, Users, Building, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Diagnostic: React.FC = () => {
  const { db, isFirestoreConnected, firestoreError } = useAppContext();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity /> Outil de Diagnostic
          </h1>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <Server /> Statut de Connexion
          </h2>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: isFirestoreConnected ? '#dcfce7' : '#fee2e2', borderRadius: '8px', border: `1px solid ${isFirestoreConnected ? '#86efac' : '#fca5a5'}` }}>
            <Database size={32} color={isFirestoreConnected ? '#16a34a' : '#dc2626'} />
            <div>
              <h3 style={{ margin: 0, color: isFirestoreConnected ? '#166534' : '#991b1b' }}>
                Firebase Firestore : {isFirestoreConnected ? 'Connecté' : 'Erreur ou Indisponible'}
              </h3>
              {firestoreError && (
                <p style={{ margin: '0.25rem 0 0 0', color: '#991b1b', fontSize: '0.875rem' }}>
                  <strong>Détail :</strong> {firestoreError}
                </p>
              )}
            </div>
          </div>
        </div>

        {db && (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Résumé des Données (Local / Sync)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Building size={18} /> Écoles
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{db.schools?.length || 0}</div>
              </div>

              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Users size={18} /> Élèves
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{db.students?.length || 0}</div>
              </div>

              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Users size={18} /> Utilisateurs
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{db.users?.length || 0}</div>
              </div>

              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Database size={18} /> Données de base
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                  <div>Classes: {db.classes?.length || 0}</div>
                  <div>Staff: {db.staff?.length || 0}</div>
                  <div>Paiements: {db.payments?.length || 0}</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Diagnostic;
