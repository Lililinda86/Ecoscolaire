import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { CheckCircle, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { auth } from '../db/firebase';
import type { ValidationRequest, Expense } from '../types';

const ValidationDashboard: React.FC = () => {
  type ValidationEntity = { id: string; [key: string]: unknown };
  const { db, safeMergeDB, updateLocalState, currentUser, logAuditAction } = useAppContext();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (!db || !currentUser) return <div style={{padding: '2rem'}}>Chargement (db manquant: {!db}, user manquant: {!currentUser})...</div>;

  // Seuls les approbateurs et le boardViewer peuvent voir ce dashboard
  const canApprove = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  const canView = canApprove || currentUser.role === 'boardViewer';

  if (!canView) {
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
    if (String(req.actionType) === 'HIGH_EXPENSE') {
      alert("Ce circuit historique est désactivé. Les dépenses sont publiées exclusivement par le backend canonique.");
      return;
    }
    if (!window.confirm("Confirmer l'approbation de cette action ?")) return;
    const approverUid = auth.currentUser?.uid;
    if (!approverUid) {
      alert("Erreur : Aucun utilisateur connecté dans Firebase Auth.");
      return;
    }
    setLoadingId(req.id);
    
    try {
      if (req.actionType === 'HIGH_EXPENSE') {
        const { doc, runTransaction, serverTimestamp, getDoc } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('../db/firebase');

        const { requestId, expenseId } = await runTransaction(firestoreDb, async (transaction) => {
          const reqRef = doc(firestoreDb, 'validation_requests', req.id);
          const reqSnap = await transaction.get(reqRef);

          if (!reqSnap.exists()) {
            throw new Error("La demande n'existe pas.");
          }
          const reqData = reqSnap.data() as ValidationRequest;
          if (reqData.status !== 'pending') {
            throw new Error("La demande n'est plus en attente.");
          }
          if (reqData.actionType !== 'HIGH_EXPENSE') {
            throw new Error("Type de demande invalide.");
          }
          if (currentUser.role !== 'superAdmin' && reqData.schoolId !== currentUser.schoolId) {
            throw new Error("Vous n'avez pas accès à cette école.");
          }

          const proposed = reqData.proposedData as Record<string, unknown>;
          if (!proposed) {
            throw new Error("Données proposées manquantes.");
          }

          const proposedKeys = Object.keys(proposed).sort();
          const expectedKeys = ['id', 'schoolId', 'amount', 'date', 'person', 'reason'].sort();
          const hasExactKeys = proposedKeys.length === expectedKeys.length && proposedKeys.every((k, i) => k === expectedKeys[i]);
          if (!hasExactKeys) {
            throw new Error("Les champs de la dépense sont invalides ou incomplets.");
          }

          if (proposed.schoolId !== reqData.schoolId) {
            throw new Error("Incohérence du schoolId.");
          }

          if (typeof proposed.id !== 'string' || !proposed.id) {
            throw new Error("Identifiant de dépense invalide.");
          }

          const expenseRef = doc(firestoreDb, 'expenses', proposed.id);
          const expenseSnap = await transaction.get(expenseRef);

          if (expenseSnap.exists()) {
            const existingData = expenseSnap.data();
            const isSame = existingData.id === proposed.id &&
                           existingData.schoolId === proposed.schoolId &&
                           existingData.amount === proposed.amount &&
                           existingData.date === proposed.date &&
                           existingData.person === proposed.person &&
                           existingData.reason === proposed.reason;
            if (!isSame) {
              throw new Error("Une dépense existante avec cet identifiant possède des données différentes.");
            }
          } else {
            throw new Error("La création directe d'une dépense est définitivement désactivée.");
          }

          transaction.update(reqRef, {
            status: 'approved',
            approvedBy: approverUid,
            approvedAt: serverTimestamp()
          });

          return { requestId: req.id, expenseId: proposed.id };
        });

        // Relire après commit
        const reqRef = doc(firestoreDb, 'validation_requests', requestId);
        const expenseRef = doc(firestoreDb, 'expenses', expenseId);

        const [reqSnapAfter, expenseSnapAfter] = await Promise.all([
          getDoc(reqRef),
          getDoc(expenseRef)
        ]);

        if (!reqSnapAfter.exists() || !expenseSnapAfter.exists()) {
          throw new Error("Erreur de synchronisation : Les documents n'ont pas pu être relus après écriture.");
        }

        const freshRequest = { id: reqSnapAfter.id, ...reqSnapAfter.data() } as ValidationRequest;
        const freshExpense = { id: expenseSnapAfter.id, ...expenseSnapAfter.data() } as Expense;

        if (freshRequest.status !== 'approved') {
          throw new Error("La demande relue n'est pas approuvée.");
        }
        if (freshExpense.id !== expenseId) {
          throw new Error("L'identifiant de la dépense relue ne correspond pas.");
        }
        if (freshExpense.schoolId !== freshRequest.schoolId) {
          throw new Error("Incohérence d'école sur les documents relus.");
        }

        // Update local React state using fresh data from firestore
        const updatedRequests = db.validation_requests.map(r => r.id === req.id ? freshRequest : r);
        const updatedExpenses = [...(db.expenses || [])];
        if (!updatedExpenses.some(e => e.id === freshExpense.id)) {
          updatedExpenses.push(freshExpense);
        }

        updateLocalState({
          validation_requests: updatedRequests,
          expenses: updatedExpenses
        });

        alert("Dépense approuvée et enregistrée avec succès.");
      } else {
        // Fallback for other action types
        const newDb = { ...db };
        const targetArray = ((newDb as Record<string, unknown>)[req.targetCollection] as ValidationEntity[]) || [];

        if (req.actionType === 'DELETE_STUDENT') {
          const index = targetArray.findIndex((i: ValidationEntity) => i.id === req.targetDocumentId);
          if (index >= 0) {
            targetArray[index] = {
              ...targetArray[index],
              ...(req.proposedData as Record<string, unknown>),
              schoolingStatus: 'inactive',
              departureReason: 'withdrawn',
              departureDate: new Date().toISOString().split('T')[0],
              departureNote: 'Retiré des élèves actifs (Demande approuvée)'
            };
          }
        } else {
          const index = targetArray.findIndex((i: ValidationEntity) => i.id === req.targetDocumentId);
          if (index >= 0) {
            targetArray[index] = { ...targetArray[index], ...(req.proposedData as Record<string, unknown>) };
          } else {
            targetArray.push(req.proposedData as ValidationEntity);
          }
        }

        (newDb as Record<string, unknown>)[req.targetCollection] = targetArray;

        const reqIndex = newDb.validation_requests.findIndex(r => r.id === req.id);
        if (reqIndex >= 0) {
          newDb.validation_requests[reqIndex] = { ...newDb.validation_requests[reqIndex], status: 'approved' };
        }

        await safeMergeDB(newDb);
        alert("Action approuvée avec succès.");
      }

      logAuditAction({
        action: 'APPROVE_VALIDATION_REQUEST',
        targetType: 'VALIDATION_REQUEST',
        targetId: req.id,
        targetName: getActionLabel(req.actionType)
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert("Erreur lors de l'approbation : " + errorMsg);
      console.error(err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (req: ValidationRequest) => {
    if (!window.confirm("Rejeter cette demande ?")) return;
    const approverUid = auth.currentUser?.uid;
    if (!approverUid) {
      alert("Erreur : Aucun utilisateur connecté dans Firebase Auth.");
      return;
    }
    setLoadingId(req.id);

    try {
      const { doc, runTransaction, serverTimestamp, getDoc } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('../db/firebase');

      const { requestId } = await runTransaction(firestoreDb, async (transaction) => {
        const reqRef = doc(firestoreDb, 'validation_requests', req.id);
        const reqSnap = await transaction.get(reqRef);

        if (!reqSnap.exists()) {
          throw new Error("La demande n'existe pas.");
        }
        const reqData = reqSnap.data() as ValidationRequest;
        if (reqData.status !== 'pending') {
          throw new Error("La demande n'est plus en attente.");
        }
        if (currentUser.role !== 'superAdmin' && reqData.schoolId !== currentUser.schoolId) {
          throw new Error("Vous n'avez pas accès à cette école.");
        }

        transaction.update(reqRef, {
          status: 'rejected',
          rejectedBy: approverUid,
          rejectedAt: serverTimestamp()
        });

        return { requestId: req.id };
      });

      // Relire après commit
      const reqRef = doc(firestoreDb, 'validation_requests', requestId);
      const reqSnapAfter = await getDoc(reqRef);

      if (!reqSnapAfter.exists()) {
        throw new Error("Erreur de synchronisation : La demande n'a pas pu être relue après écriture.");
      }

      const freshRequest = { id: reqSnapAfter.id, ...reqSnapAfter.data() } as ValidationRequest;
      if (freshRequest.status !== 'rejected') {
        throw new Error("La demande relue n'est pas rejetée.");
      }

      // Update local React state using fresh data from firestore
      const updatedRequests = db.validation_requests.map(r => r.id === req.id ? freshRequest : r);

      updateLocalState({
        validation_requests: updatedRequests
      });

      alert("Demande rejetée avec succès.");

      logAuditAction({
        action: 'REJECT_VALIDATION_REQUEST',
        targetType: 'VALIDATION_REQUEST',
        targetId: req.id,
        targetName: getActionLabel(req.actionType)
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert("Erreur lors du rejet : " + errorMsg);
      console.error(err);
    } finally {
      setLoadingId(null);
    }
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

                {canApprove && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                    <button 
                      onClick={() => handleApprove(req)}
                      disabled={loadingId !== null}
                      style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
                    >
                      <CheckCircle size={18} /> Approuver
                    </button>
                    <button 
                      onClick={() => handleReject(req)}
                      disabled={loadingId !== null}
                      style={{ background: 'white', color: '#ef4444', border: '1px solid #ef4444', padding: '0.75rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
                    >
                      <XCircle size={18} /> Rejeter
                    </button>
                  </div>
                )}
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
