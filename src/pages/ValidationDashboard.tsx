import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { CheckCircle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import type { ValidationRequest } from '../types';

const ValidationDashboard: React.FC = () => {
  const { db, saveDB, currentUser, logAuditAction } = useAppContext();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (!db || !currentUser) return <div style={{padding: '2rem'}}>Chargement (db manquant: {!db}, user manquant: {!currentUser})...</div>;

  // Seuls les approbateurs peuvent voir ce dashboard
  const canApprove = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  if (!canApprove) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <ShieldAlert size={48} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
        <h2>Accès Refusé</h2>
        <p>Vous n'avez pas les permissions pour accéder au centre de validation.</p>
      </div>
    );
  }

  const requests = db.validation_requests || [];
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const historyRequests = requests.filter(r => r.status !== 'pending').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleApprove = async (req: ValidationRequest) => {
    if (!window.confirm("Confirmer l'approbation de cette action ?")) return;
    setLoadingId(req.id);
    
    try {
      // 1. Appliquer l'action
      const newDb = { ...db };
      let targetArray = (newDb as any)[req.targetCollection] || [];
      
      if (req.actionType === 'DELETE_STUDENT') {
        targetArray = targetArray.filter((i: any) => i.id !== req.targetDocumentId);
      } else {
        // UPDATE ou CREATE
        const index = targetArray.findIndex((i: any) => i.id === req.targetDocumentId);
        if (index >= 0) {
          targetArray[index] = { ...targetArray[index], ...req.proposedData };
        } else {
          targetArray.push(req.proposedData);
        }
      }
      
      (newDb as any)[req.targetCollection] = targetArray;

      // 2. Mettre à jour la requête
      const reqIndex = newDb.validation_requests.findIndex(r => r.id === req.id);
      if (reqIndex >= 0) {
        newDb.validation_requests[reqIndex] = { ...newDb.validation_requests[reqIndex], status: 'approved' };
      }

      await saveDB(newDb);
      logAuditAction({
        action: 'APPROVE_VALIDATION_REQUEST',
        targetType: 'VALIDATION_REQUEST',
        targetId: req.id,
        targetName: getActionLabel(req.actionType)
      });
    } catch (err) {
      alert("Erreur lors de l'approbation.");
      console.error(err);
    }
    setLoadingId(null);
  };

  const handleReject = async (req: ValidationRequest) => {
    if (!window.confirm("Rejeter cette demande ?")) return;
    setLoadingId(req.id);
    
    try {
      const newDb = { ...db };
      const reqIndex = newDb.validation_requests.findIndex(r => r.id === req.id);
      if (reqIndex >= 0) {
        newDb.validation_requests[reqIndex] = { ...newDb.validation_requests[reqIndex], status: 'rejected' };
      }
      await saveDB(newDb);
      logAuditAction({
        action: 'REJECT_VALIDATION_REQUEST',
        targetType: 'VALIDATION_REQUEST',
        targetId: req.id,
        targetName: getActionLabel(req.actionType)
      });
    } catch (err) {
      console.error(err);
    }
    setLoadingId(null);
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'UPDATE_GRADE': return 'Modification de Note Publiée';
      case 'DELETE_STUDENT': return 'Suppression d\'Élève';
      case 'HIGH_EXPENSE': return 'Dépense Majeure (> 50k)';
      case 'CHANGE_ROLE': return 'Changement de Rôle Sécurité';
      default: return type;
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '50%', color: '#d97706' }}>
          <ShieldAlert size={32} />
        </div>
        <div>
          <h1 style={{ margin: 0 }}>Centre de Validation</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
            Approuvez ou rejetez les actions sensibles requises par le personnel.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          <Clock size={20} /> Requêtes en attente ({pendingRequests.length})
        </h2>

        {pendingRequests.length === 0 ? (
          <div style={{ background: '#f8fafc', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#64748b' }}>
            Aucune demande en attente.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #f59e0b', borderRadius: '8px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      {getActionLabel(req.actionType)}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      par {req.requesterRole} ({req.requesterId})
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      • {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', fontSize: '0.875rem', marginTop: '1rem' }}>
                    <strong>Détails :</strong>
                    <pre style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155' }}>
                      {JSON.stringify(req.proposedData, null, 2)}
                    </pre>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                  <button 
                    onClick={() => handleApprove(req)}
                    disabled={loadingId === req.id}
                    style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
                  >
                    <CheckCircle size={18} /> Approuver
                  </button>
                  <button 
                    onClick={() => handleReject(req)}
                    disabled={loadingId === req.id}
                    style={{ background: 'white', color: '#ef4444', border: '1px solid #ef4444', padding: '0.75rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
                  >
                    <XCircle size={18} /> Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
          Historique Récent
        </h2>
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '1rem' }}>Date</th>
                <th style={{ padding: '1rem' }}>Action</th>
                <th style={{ padding: '1rem' }}>Demandeur</th>
                <th style={{ padding: '1rem' }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {historyRequests.slice(0, 10).map(req => (
                <tr key={req.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '1rem' }}>{new Date(req.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '1rem' }}>{getActionLabel(req.actionType)}</td>
                  <td style={{ padding: '1rem' }}>{req.requesterRole} ({req.requesterId})</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      color: req.status === 'approved' ? '#16a34a' : '#dc2626',
                      background: req.status === 'approved' ? '#dcfce7' : '#fee2e2',
                      padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 600 
                    }}>
                      {req.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                    </span>
                  </td>
                </tr>
              ))}
              {historyRequests.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Aucun historique.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ValidationDashboard;
