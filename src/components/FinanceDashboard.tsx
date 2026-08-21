import React, { useState, useMemo } from 'react';
import { Download, TrendingUp, AlertTriangle, FileText, CheckCircle, Clock } from 'lucide-react';
import type { Payment, Student, School } from '../types';
import ReceiptAudit from './ReceiptAudit';
import { calculateCollectedPaymentTotal } from '../utils/expenseLedger';

type DateLike =
  | string
  | number
  | Date
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | null
  | undefined;

type ReceiptLike = {
  id?: string;
  amount?: number;
  status?: string;
  method?: string;
  date?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
  receiptNumber?: string;
  paymentId?: string;
  studentId?: string;
  studentName?: string;
  parentName?: string;
  [key: string]: unknown;
};

type TransactionLike = {
  id?: string;
  amount?: number;
  status?: string;
  method?: string;
  type?: string;
  date?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
  reference?: string;
  receiptNumber?: string;
  paymentId?: string;
  studentId?: string;
  schoolId?: string;
  userId?: string;
  [key: string]: unknown;
};

interface FinanceDashboardProps {
  payments: Payment[];
  transactions: TransactionLike[];
  receipts: ReceiptLike[];
  students: Student[];
  school: School | null;
}

type Period = 'today' | '7_days' | '30_days';

const FinanceDashboard: React.FC<FinanceDashboardProps> = ({ payments, transactions, receipts, students }) => {
  const [period, setPeriod] = useState<Period>('today');

  const { filteredPayments, filteredTransactions, filteredReceipts } = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (period === '7_days') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === '30_days') {
      startDate.setDate(startDate.getDate() - 30);
    }

    const filterByDate = (dateVal: DateLike) => {
      if (!dateVal) return false;
      let d: Date;
      if (typeof dateVal === 'object' && dateVal !== null) {
        if ('toDate' in dateVal && typeof dateVal.toDate === 'function') {
          d = dateVal.toDate();
        } else if ('seconds' in dateVal && typeof dateVal.seconds === 'number') {
          d = new Date(dateVal.seconds * 1000);
        } else {
          d = new Date(dateVal as string | number | Date);
        }
      } else {
        d = new Date(dateVal as string | number | Date);
      }
      return d >= startDate && d <= now;
    };

    return {
      filteredPayments: payments.filter(p => filterByDate(p.date)),
      filteredTransactions: transactions.filter(t => filterByDate(t.createdAt)),
      filteredReceipts: receipts.filter(r => filterByDate(r.createdAt))
    };
  }, [payments, transactions, receipts, period]);

  const kpis = useMemo(() => {
    const totalCash = calculateCollectedPaymentTotal(filteredPayments, 'cash');
    const totalMomo = calculateCollectedPaymentTotal(filteredPayments, 'mobile_money');

    const txSuccess = filteredTransactions.filter(t => t.status === 'SUCCESS').length;
    const txPending = filteredTransactions.filter(t => t.status === 'PENDING').length;
    const txFailed = filteredTransactions.filter(t => t.status === 'FAILED').length;

    const receiptsGenerated = filteredReceipts.length;

    return { totalCash, totalMomo, txSuccess, txPending, txFailed, receiptsGenerated };
  }, [filteredPayments, filteredTransactions, filteredReceipts]);

  const exportCSV = () => {
    // CSV Columns: date, élève, classe, montant, méthode, transactionId, receiptNumber, statut
    const rows = [
      ['Date', 'Élève', 'Classe', 'Montant', 'Méthode', 'Transaction ID', 'Numéro Reçu', 'Statut']
    ];

    filteredPayments.forEach(p => {
      const student = students.find(s => s.id === p.studentId);
      const studentName = student?.name || 'Inconnu';
      const className = student?.classId || student?.rawClassName || 'Inconnue';
      const dateStr = p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '';
      
      const receipt = receipts.find(r => r.paymentId === p.id);
      const receiptNum = receipt?.receiptNumber ?? '';
      
      const tx = transactions.find(t => t.id === p.transactionId);
      const txId = p.transactionId ?? '';
      const status = tx?.status ?? 'SUCCESS'; // Cash payments without tx are success

      rows.push([
        dateStr,
        `"${studentName}"`,
        `"${className}"`,
        p.amount.toString(),
        p.method === 'mobile_money' ? 'MoMo' : 'Cash',
        txId,
        receiptNum,
        status
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finance_export_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={24} color="var(--primary-color)" />
          Tableau de Bord Financier
        </h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select 
            value={period} 
            onChange={(e) => setPeriod(e.target.value as Period)}
            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
          >
            <option value="today">Aujourd'hui</option>
            <option value="7_days">7 derniers jours</option>
            <option value="30_days">30 derniers jours</option>
          </select>
          <button onClick={exportCSV} className="primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={18} />
            Exporter CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {/* KPI Cards */}
        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Encaissé CASH</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{kpis.totalCash.toLocaleString('fr-FR')} FCFA</div>
        </div>
        
        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Total Encaissé MoMo</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e40af' }}>{kpis.totalMomo.toLocaleString('fr-FR')} FCFA</div>
        </div>

        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} /> Reçus Générés
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{kpis.receiptsGenerated}</div>
        </div>

        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} color="#10b981" /> Tx SUCCESS
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{kpis.txSuccess}</div>
        </div>

        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} color="#f59e0b" /> Tx PENDING
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{kpis.txPending}</div>
        </div>

        <div className="card" style={{ background: '#f8fafc', padding: '1.5rem', borderLeft: '4px solid #ef4444' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} color="#ef4444" /> Tx FAILED
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{kpis.txFailed}</div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '2rem 0' }} />

      <ReceiptAudit 
        payments={payments}
        transactions={transactions}
        receipts={receipts}
      />
    </div>
  );
};

export default FinanceDashboard;
