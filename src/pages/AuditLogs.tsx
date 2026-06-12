import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { ShieldAlert, Search, Filter } from 'lucide-react';

interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  schoolId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  timestamp: string;
  details: any;
}

const AuditLogs: React.FC = () => {
  const { currentUser, currentSchool, db } = useAppContext();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');

  const canView = currentUser && ['superAdmin', 'owner', 'director'].includes(currentUser.role);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    const fetchLogs = async () => {
      try {
        const { collection, getDocs, query, where, orderBy, limit } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('../db/firebase');
        
        let q;
        if (currentUser.role === 'superAdmin') {
          // SuperAdmin sees everything
          q = query(collection(firestoreDb, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
        } else {
          // Owner/Director see only their school's logs
          q = query(
            collection(firestoreDb, 'audit_logs'), 
            where('schoolId', '==', currentSchool?.id),
            // Firestore might need an index for where + orderBy. To be safe without index, we just fetch and sort locally.
            limit(500)
          );
        }

        const snap = await getDocs(q);
        let fetchedLogs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
        
        if (currentUser.role !== 'superAdmin') {
           // Sort locally if not ordered by Firestore due to missing index
           fetchedLogs = fetchedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }

        setLogs(fetchedLogs);
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
      }
      setLoading(false);
    };

    fetchLogs();
  }, [currentUser, currentSchool, canView]);

  if (!canView) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <ShieldAlert size={48} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
        <h2>Accès Refusé</h2>
        <p>Vous n'avez pas les permissions pour consulter les logs d'audit.</p>
      </div>
    );
  }

  const filteredLogs = logs.filter(l => {
    if (actionFilter && !l.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (userFilter && !l.userEmail.toLowerCase().includes(userFilter.toLowerCase())) return false;
    if (dateFilter && !l.timestamp.startsWith(dateFilter)) return false;
    if (schoolFilter && currentUser.role === 'superAdmin' && l.schoolId !== schoolFilter) return false;
    return true;
  });

  const getActionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('REJECT')) return '#ef4444'; // Red
    if (action.includes('CREATE') || action.includes('APPROVE') || action.includes('LOGIN')) return '#10b981'; // Green
    if (action.includes('UPDATE') || action.includes('UPLOAD')) return '#f59e0b'; // Yellow
    if (action.includes('EXPORT') || action.includes('GENERATE')) return '#3b82f6'; // Blue
    return '#6b7280'; // Gray
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '50%', color: '#991b1b' }}>
          <ShieldAlert size={32} />
        </div>
        <div>
          <h1 style={{ margin: 0 }}>Journaux d'Audit (Audit Logs)</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
            Traçabilité immuable de toutes les actions sensibles du système.
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="card" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', background: '#f8fafc' }}>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label><Search size={14} style={{ marginRight: '0.25rem' }}/> Filtrer par Action</label>
          <input type="text" placeholder="Ex: DELETE_STUDENT" value={actionFilter} onChange={e => setActionFilter(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label><Search size={14} style={{ marginRight: '0.25rem' }}/> Utilisateur (Email)</label>
          <input type="text" placeholder="Ex: admin@..." value={userFilter} onChange={e => setUserFilter(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label><Filter size={14} style={{ marginRight: '0.25rem' }}/> Date exacte</label>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
        
        {currentUser.role === 'superAdmin' && (
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label><Filter size={14} style={{ marginRight: '0.25rem' }}/> École</label>
            <select value={schoolFilter} onChange={e => setSchoolFilter(e.target.value)}>
              <option value="">Toutes les écoles</option>
              {db?.schools?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>Chargement des logs...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Date & Heure</th>
                <th style={{ padding: '1rem' }}>Action</th>
                <th style={{ padding: '1rem' }}>Cible</th>
                <th style={{ padding: '1rem' }}>Utilisateur</th>
                {currentUser.role === 'superAdmin' && <th style={{ padding: '1rem' }}>École</th>}
                <th style={{ padding: '1rem' }}>Détails</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleString('fr-FR')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      background: `${getActionColor(log.action)}20`, 
                      color: getActionColor(log.action),
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                      fontSize: '0.75rem'
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <strong>{log.targetType}</strong><br/>
                    <span style={{ color: 'var(--text-muted)' }}>{log.targetName}</span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {log.userEmail}<br/>
                    <small style={{ color: '#64748b' }}>({log.userRole})</small>
                  </td>
                  {currentUser.role === 'superAdmin' && (
                    <td style={{ padding: '1rem' }}>
                      {db?.schools?.find(s => s.id === log.schoolId)?.name || 'N/A'}
                    </td>
                  )}
                  <td style={{ padding: '1rem' }}>
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <pre style={{ margin: 0, fontSize: '0.75rem', color: '#475569', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>Aucun</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={currentUser.role === 'superAdmin' ? 6 : 5} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    Aucun log d'audit ne correspond à votre recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
