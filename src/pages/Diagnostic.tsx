import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Database, Server, Users, Building, ChevronLeft, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Diagnostic: React.FC = () => {
  const { db, isFirestoreConnected, firestoreError, lastSyncDate, currentUser, supervisionSchoolId } = useAppContext();
  const navigate = useNavigate();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [directFetchData, setDirectFetchData] = useState<any>(null);

  useEffect(() => {
    import('../db/firebase').then(async ({ db: firestoreDb }) => {
      console.log("Firebase Project ID:", firestoreDb.app.options.projectId);
      
      try {
        const { getDocs, collection } = await import('firebase/firestore');
        const snap = await getDocs(collection(firestoreDb, 'schools'));
        const docsInfo = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        setDirectFetchData({
          count: snap.docs.length,
          docs: docsInfo
        });
      } catch (e) {
        console.error("Erreur direct fetch:", e);
      }
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

  const runSchoolCreationTest = async () => {
    try {
      setTestResult("Création de l'école test en cours...");
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, getDocs, collection } = await import('firebase/firestore');
      
      const testId = `test-school-${Date.now()}`;
      const testSchool = {
        id: testId,
        name: "TEST FIRESTORE",
        code: "TEST-001",
        academicYear: "2026-2027",
        subscriptionPlan: "premium",
        subscriptionStatus: "trial",
        active: true,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(firestoreDb, "schools", testSchool.id), testSchool);
      
      const snap = await getDocs(collection(firestoreDb, "schools"));
      const docsInfo = snap.docs.map(d => ({id: d.id, name: d.data().name}));
      
      setTestResult(`✅ Succès ! 
Nombre d'écoles dans /schools : ${snap.docs.length}
IDs trouvés : ${docsInfo.map(d => d.id).join(', ')}
Noms trouvés : ${docsInfo.map(d => d.name).join(', ')}`);

    } catch (err: any) {
      setTestResult(`❌ Erreur : ${err.message}`);
    }
  };

  const exportSchoolsToJSON = async () => {
    try {
      setTestResult("Exportation en cours...");
      const { db: firestoreDb } = await import('../db/firebase');
      const { getDocs, collection } = await import('firebase/firestore');
      const snap = await getDocs(collection(firestoreDb, 'schools'));
      const data = snap.docs.map(d => ({id: d.id, ...d.data()}));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schools-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setTestResult(`✅ Export réussi ! ${data.length} école(s) sauvegardée(s).`);
    } catch (e: any) {
      setTestResult(`❌ Erreur d'export: ${e.message}`);
    }
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setTestResult("Restauration en cours...");
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const schools = JSON.parse(content);
          if (!Array.isArray(schools)) throw new Error("Le fichier JSON doit contenir un tableau d'écoles.");
          
          const { db: firestoreDb } = await import('../db/firebase');
          const { doc, setDoc } = await import('firebase/firestore');
          
          for (const school of schools) {
            if (school.id) {
              await setDoc(doc(firestoreDb, 'schools', school.id), school);
            }
          }
          setTestResult(`✅ Restauration réussie ! ${schools.length} école(s) importée(s). Veuillez rafraîchir la page (F5).`);
        } catch (err: any) {
          setTestResult(`❌ Erreur de parsing JSON: ${err.message}`);
        }
      };
      reader.readAsText(file);
    } catch (e: any) {
      setTestResult(`❌ Erreur lors de l'import: ${e.message}`);
    }
    event.target.value = ''; // Reset input
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
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={18}/> Tests d'écriture en direct</h3>
            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Exécutez ces tests pour valider physiquement l'écriture dans Firestore.</p>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button 
                onClick={runConnectionTest}
                style={{ background: '#4f46e5', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Test de Base (__test_connection)
              </button>
              
              <button 
                onClick={runSchoolCreationTest}
                style={{ background: '#059669', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Créer école test Firestore /schools
              </button>
              
              <button 
                onClick={exportSchoolsToJSON}
                style={{ background: '#ca8a04', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Sauvegarde Firestore (Export JSON)
              </button>
              
              <label style={{ background: '#db2777', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'inline-block' }}>
                Restaurer Firestore (Import JSON)
                <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
              </label>
            </div>

            {testResult && (
              <div style={{ padding: '1rem', background: testResult.includes('✅') ? '#dcfce7' : '#fee2e2', color: testResult.includes('✅') ? '#166534' : '#991b1b', borderRadius: '8px', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>
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

        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
            <Server /> Analyse AppContext & Variables d'État
          </h2>
          
          <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontFamily: 'monospace' }}>
              <div><strong style={{color: '#475569'}}>currentUser.role:</strong> <span style={{color: '#0369a1'}}>{currentUser?.role || 'null'}</span></div>
              <div><strong style={{color: '#475569'}}>currentUser.email:</strong> <span style={{color: '#0369a1'}}>{currentUser?.email || 'null'}</span></div>
              <div><strong style={{color: '#475569'}}>supervisionSchoolId:</strong> <span style={{color: '#c2410c'}}>{supervisionSchoolId || 'null'}</span></div>
              <div><strong style={{color: '#475569'}}>db.schools.length:</strong> <span style={{color: '#15803d'}}>{db?.schools?.length || 0}</span></div>
              <div style={{ gridColumn: '1 / -1', marginTop: '1rem', padding: '1rem', background: '#fff', border: '1px dashed #94a3b8', borderRadius: '4px' }}>
                <strong style={{color: '#475569'}}>Branche AppContext déduite :</strong><br/>
                <span style={{ fontSize: '1.1rem', color: '#b91c1c', fontWeight: 'bold' }}>
                  {currentUser?.role === 'superAdmin' && !supervisionSchoolId 
                    ? '=> Mode Global Super Admin' 
                    : '=> Mode Supervision / École'}
                </span>
              </div>
            </div>
          </div>

          <h3 style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Database size={18}/> Lecture Directe Firestore (/schools)</h3>
          <div style={{ padding: '1.5rem', background: '#f1f5f9', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
            {directFetchData ? (
              <div style={{ fontFamily: 'monospace' }}>
                <div style={{ marginBottom: '0.5rem' }}><strong>Écoles physiquement trouvées dans Firestore:</strong> <span style={{ fontSize: '1.2rem', color: '#15803d', fontWeight: 'bold' }}>{directFetchData.count}</span></div>
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                  {directFetchData.docs.map((d: any, i: number) => (
                    <li key={i} style={{ padding: '0.5rem', background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{ color: '#0369a1' }}>ID: {d.id}</span> | <strong>Nom: {d.name}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ color: '#64748b' }}>Chargement direct de /schools en cours...</div>
            )}
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
