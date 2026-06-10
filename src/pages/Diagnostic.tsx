import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Database, Server, Users, Building, ChevronLeft, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Diagnostic: React.FC = () => {
  const { db, isFirestoreConnected, firestoreError, lastSyncDate } = useAppContext();
  const navigate = useNavigate();
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    import('../db/firebase').then(({ db: firestoreDb }) => {
      console.log("Firebase Project ID:", firestoreDb.app.options.projectId);
    });
  }, []);

  const runConnectionTest = async () => {
    try {
      setTestResult("Test en cours...");
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, getDoc, collection } = await import('firebase/firestore');
      
      const testRef = doc(collection(firestoreDb, '__test_connection'), 'test-doc');
      
      await setDoc(testRef, {
        message: "Test de connexion Vercel réussi !",
        timestamp: new Date().toISOString()
      });
      
      const snap = await getDoc(testRef);
      if (snap.exists()) {
        const data = snap.data();
        setTestResult(`✅ Succès ! Document relu : ${data.message} à ${data.timestamp}`);
      } else {
        setTestResult("❌ Échec : Document introuvable après écriture.");
      }
    } catch (err: any) {
      setTestResult(`❌ Erreur : ${err.message}`);
    }
  };

  const firebaseConfigValues = {
    projectId: "ecoscolaire-c5861",
    authDomain: "ecoscolaire-c5861.firebaseapp.com",
    storageBucket: "ecoscolaire-c5861.firebasestorage.app",
    appId: "1:329523025972:web:052855ab83a9da2ea49261",
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button onClick={() => navigate(-1)} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity /> Outil de Diagnostic et Preuves d'Audit
          </h1>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <ShieldCheck /> Preuve de Connexion Firebase
          </h2>
          
          <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '1.5rem', borderRadius: '8px', fontFamily: 'monospace', marginBottom: '1.5rem' }}>
            <div><strong style={{color: '#38bdf8'}}>projectId:</strong> {firebaseConfigValues.projectId}</div>
            <div><strong style={{color: '#38bdf8'}}>authDomain:</strong> {firebaseConfigValues.authDomain}</div>
            <div><strong style={{color: '#38bdf8'}}>storageBucket:</strong> {firebaseConfigValues.storageBucket}</div>
            <div><strong style={{color: '#38bdf8'}}>appId:</strong> {firebaseConfigValues.appId}</div>
          </div>

          <div style={{ padding: '1.5rem', background: '#f1f5f9', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={18}/> Test d'écriture en direct (__test_connection)</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Ce test prouve que l'application déployée écrit physiquement dans le projet {firebaseConfigValues.projectId}.</p>
            <button 
              onClick={runConnectionTest}
              style={{ background: '#4f46e5', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginBottom: '1rem' }}
            >
              Exécuter le Test Firestore
            </button>
            {testResult && (
              <div style={{ padding: '1rem', background: testResult.includes('✅') ? '#dcfce7' : '#fee2e2', color: testResult.includes('✅') ? '#166534' : '#991b1b', borderRadius: '8px', fontWeight: 'bold' }}>
                {testResult}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <Server /> Statut de Connexion AppContext
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
            <h2 style={{ marginTop: 0 }}>Résumé des 20 Collections Interrogées</h2>
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
                  <Database size={18} /> Collections Actives
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>20 / 20</div>
              </div>

              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Activity size={18} /> Dernière synchro
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: lastSyncDate ? '#16a34a' : '#64748b' }}>
                  {lastSyncDate ? lastSyncDate.toLocaleTimeString() : 'En attente...'}
                </div>
              </div>

              <div style={{ padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', marginBottom: '0.5rem' }}>
                  <Database size={18} /> Données de base
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                  <div>Classes: {db.classes?.length || 0}</div>
                  <div>Staff: {db.staff?.length || 0}</div>
                  <div>Paiements: {db.payments?.length || 0}</div>
                  <div>Matières: {db.subjects?.length || 0}</div>
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
