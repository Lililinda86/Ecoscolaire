import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import type { Payment, PaymentTransaction } from '../types';

interface ReceiptAuditProps {
  payments: Payment[];
  transactions: PaymentTransaction[];
  receipts: any[];
}

interface Anomaly {
  id: string;
  type: 'PAYMENT_NO_RECEIPT' | 'RECEIPT_NO_PAYMENT' | 'DUPLICATE_RECEIPT_NUMBER' | 'PAYMENT_NO_SCHOOL_ID';
  severity: 'warning' | 'critical';
  description: string;
  referenceId: string;
  date: Date;
}

const ReceiptAudit: React.FC<ReceiptAuditProps> = ({ payments, receipts }) => {

  const anomalies = useMemo(() => {
    const issues: Anomaly[] = [];
    
    // 1. Paiements sans schoolId
    // 2. Paiement sans reçu
    payments.forEach(p => {
      const pDate = new Date(p.date || Date.now());
      if (!p.schoolId) {
        issues.push({
          id: `no-school-${p.id}`,
          type: 'PAYMENT_NO_SCHOOL_ID',
          severity: 'critical',
          description: 'Paiement sans schoolId détecté.',
          referenceId: p.id,
          date: pDate
        });
      }

      const hasReceipt = receipts.some(r => r.paymentId === p.id);
      if (!hasReceipt) {
        issues.push({
          id: `no-receipt-${p.id}`,
          type: 'PAYMENT_NO_RECEIPT',
          severity: 'warning',
          description: 'Aucun reçu généré pour ce paiement.',
          referenceId: p.id,
          date: pDate
        });
      }
    });

    // 3. Reçus sans paiement
    // 4. Doublon de receiptNumber
    const receiptNumberCounts: Record<string, number> = {};
    receipts.forEach(r => {
      const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();
      
      const hasPayment = payments.some(p => p.id === r.paymentId);
      if (!hasPayment) {
        issues.push({
          id: `no-payment-${r.id}`,
          type: 'RECEIPT_NO_PAYMENT',
          severity: 'warning',
          description: 'Reçu existant sans paiement correspondant.',
          referenceId: r.id,
          date: rDate
        });
      }

      if (r.receiptNumber) {
        receiptNumberCounts[r.receiptNumber] = (receiptNumberCounts[r.receiptNumber] || 0) + 1;
      }
    });

    receipts.forEach(r => {
      const rDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();
      if (r.receiptNumber && receiptNumberCounts[r.receiptNumber] > 1) {
        // Pour éviter les doublons dans la liste des anomalies, on peut l'ajouter une seule fois ou pour chaque
        issues.push({
          id: `duplicate-${r.id}`,
          type: 'DUPLICATE_RECEIPT_NUMBER',
          severity: 'critical',
          description: `Numéro de reçu en doublon: ${r.receiptNumber}`,
          referenceId: r.receiptNumber,
          date: rDate
        });
      }
    });

    // Deduplicate duplicate alerts by referenceId
    const uniqueIssues = issues.reduce((acc, current) => {
      if (current.type === 'DUPLICATE_RECEIPT_NUMBER') {
        const exists = acc.find(x => x.type === 'DUPLICATE_RECEIPT_NUMBER' && x.referenceId === current.referenceId);
        if (exists) return acc;
      }
      acc.push(current);
      return acc;
    }, [] as Anomaly[]);

    return uniqueIssues.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [payments, receipts]);

  if (anomalies.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
        <CheckCircle size={20} />
        <span>Aucune anomalie comptable détectée. La base est intègre.</span>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', marginBottom: '1rem' }}>
        <AlertCircle size={20} />
        Anomalies Comptables ({anomalies.length})
      </h3>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Date</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Type</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gravité</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Description</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Référence</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map(anomaly => (
              <tr key={anomaly.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.9rem' }}>
                  {anomaly.date.toLocaleDateString('fr-FR')}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.9rem', fontWeight: 500 }}>
                  {anomaly.type}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  {anomaly.severity === 'critical' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      <XCircle size={12} /> Critique
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      <AlertCircle size={12} /> Avertissement
                    </span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.9rem' }}>
                  {anomaly.description}
                </td>
                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                  {anomaly.referenceId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReceiptAudit;
