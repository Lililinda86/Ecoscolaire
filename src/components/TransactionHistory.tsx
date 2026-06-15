import React, { useState, useMemo } from 'react';
import { Search, Filter, Eye, CheckCircle, Clock, XCircle } from 'lucide-react';
import Modal from './Modal';
import type { User, Student } from '../types';

interface TransactionHistoryProps {
  transactions: any[];
  students: Student[];
  currentUser: User;
  onMockConfirm: (txId: string) => void;
  isConfirmingTx: string | null;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ 
  transactions, 
  students, 
  onMockConfirm,
  isConfirmingTx 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('ALL');
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Trier par date décroissante
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

    // Filtre Statut
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(tx => tx.status === statusFilter);
    }

    // Filtre Date
    if (dateFilter !== 'ALL') {
      const now = new Date();
      const txDate = (tx: any) => new Date(tx.createdAt?.seconds ? tx.createdAt.seconds * 1000 : Date.now());
      
      if (dateFilter === 'TODAY') {
        filtered = filtered.filter(tx => txDate(tx).toDateString() === now.toDateString());
      } else if (dateFilter === '7DAYS') {
        const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
        filtered = filtered.filter(tx => txDate(tx) >= sevenDaysAgo);
      } else if (dateFilter === '30DAYS') {
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        filtered = filtered.filter(tx => txDate(tx) >= thirtyDaysAgo);
      }
    }

    // Recherche
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(tx => {
        const student = students.find(s => s.id === tx.studentId);
        const studentName = student?.name?.toLowerCase() || '';
        const phone = tx.phoneNumber?.toLowerCase() || '';
        const id = tx.id?.toLowerCase() || '';
        return studentName.includes(lowerTerm) || phone.includes(lowerTerm) || id.includes(lowerTerm);
      });
    }

    return filtered;
  }, [transactions, students, searchTerm, statusFilter, dateFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <span style={{ padding: '0.25rem 0.5rem', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}><CheckCircle size={12} /> SUCCESS</span>;
      case 'PENDING':
        return <span style={{ padding: '0.25rem 0.5rem', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}><Clock size={12} /> PENDING</span>;
      case 'FAILED':
        return <span style={{ padding: '0.25rem 0.5rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}><XCircle size={12} /> FAILED</span>;
      default:
        return <span>{status}</span>;
    }
  };

  const isDevOrStaging = import.meta.env.MODE === 'development' || import.meta.env.VITE_FIREBASE_PROJECT_ID === 'ecoscolaire-staging';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Barre d'outils */}
      <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem', flex: '1', minWidth: '200px' }}>
          <Search size={18} color="var(--text-muted)" style={{ marginRight: '0.5rem' }} />
          <input 
            type="text" 
            placeholder="Rechercher (Nom, ID, Téléphone)..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={18} color="var(--text-muted)" />
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
          >
            <option value="ALL">Tous les statuts</option>
            <option value="SUCCESS">Success</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
          </select>

          <select 
            value={dateFilter} 
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
          >
            <option value="ALL">Toutes les dates</option>
            <option value="TODAY">Aujourd'hui</option>
            <option value="7DAYS">7 derniers jours</option>
            <option value="30DAYS">30 derniers jours</option>
          </select>
        </div>
      </div>

      {/* Tableau */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Transaction ID</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Téléphone</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Montant</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Statut</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucune transaction trouvée
                </td>
              </tr>
            ) : (
              filteredTransactions.map(tx => {
                const student = students.find(s => s.id === tx.studentId);
                const date = new Date(tx.createdAt?.seconds ? tx.createdAt.seconds * 1000 : Date.now());
                
                return (
                  <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="hover-row">
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '500' }}>{date.toLocaleDateString('fr-FR')}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{date.toLocaleTimeString('fr-FR')}</div>
                    </td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{tx.id}</td>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{student?.name || 'Inconnu'}</td>
                    <td style={{ padding: '1rem' }}>{tx.phoneNumber || '-'}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>{tx.amount?.toLocaleString('fr-FR')} FCFA</td>
                    <td style={{ padding: '1rem', display: 'flex', justifyContent: 'center' }}>{getStatusBadge(tx.status)}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button 
                          className="secondary" 
                          style={{ padding: '0.25rem 0.5rem' }} 
                          onClick={() => setSelectedTx(tx)}
                          title="Voir les détails"
                        >
                          <Eye size={16} />
                        </button>
                        
                        {tx.status === 'PENDING' && isDevOrStaging && (
                          <button 
                            style={{ background: '#f59e0b', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} 
                            onClick={() => onMockConfirm(tx.id)}
                            disabled={isConfirmingTx === tx.id}
                            title="Simuler succès"
                          >
                            {isConfirmingTx === tx.id ? '...' : 'Mock'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de détails */}
      <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="Détails de la transaction">
        {selectedTx && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID Transaction</span>
                <div style={{ fontWeight: '500', fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedTx.id}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Statut</span>
                <div style={{ marginTop: '0.25rem' }}>{getStatusBadge(selectedTx.status)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Montant</span>
                <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{selectedTx.amount?.toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mode / Provider</span>
                <div>{selectedTx.mode || 'N/A'} - {selectedTx.provider || 'campay'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Élève ID</span>
                <div style={{ fontFamily: 'monospace' }}>{selectedTx.studentId || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Téléphone</span>
                <div>{selectedTx.phoneNumber || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Créé le</span>
                <div>{new Date(selectedTx.createdAt?.seconds ? selectedTx.createdAt.seconds * 1000 : Date.now()).toLocaleString('fr-FR')}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mis à jour le</span>
                <div>{selectedTx.updatedAt ? new Date(selectedTx.updatedAt.seconds * 1000).toLocaleString('fr-FR') : '-'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Référence Provider</span>
                <div style={{ fontFamily: 'monospace' }}>{selectedTx.providerTransactionId || 'Non défini'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Utilisateur créateur (ID)</span>
                <div style={{ fontFamily: 'monospace' }}>{selectedTx.userId || 'Inconnu'}</div>
              </div>
            </div>
            {selectedTx.failureReason && (
              <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginTop: '0.5rem' }}>
                <span style={{ fontWeight: 'bold' }}>Raison de l'échec :</span> {selectedTx.failureReason}
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
};

export default TransactionHistory;
