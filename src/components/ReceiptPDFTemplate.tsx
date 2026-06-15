import React from 'react';
import type { School, Student } from '../types';

interface ReceiptData {
  receiptNumber: string;
  date: Date;
  amount: number;
  type: string;
  method: string;
  studentId: string | null;
  paymentId: string;
}

interface ReceiptPDFTemplateProps {
  receipt: ReceiptData;
  school: School | null;
  student: Student | null;
}

const ReceiptPDFTemplate = React.forwardRef<HTMLDivElement, ReceiptPDFTemplateProps>(({ receipt, school, student }, ref) => {
  return (
    <div 
      ref={ref} 
      style={{ 
        width: '210mm', 
        minHeight: '297mm', 
        padding: '20mm', 
        background: '#ffffff', 
        color: '#000000',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
        position: 'absolute',
        top: '-9999px',
        left: '-9999px',
        zIndex: -1
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #2563eb', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, color: '#1e40af', fontSize: '24pt' }}>{school?.name || 'EcoScolaire'}</h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#4b5563', fontSize: '10pt' }}>
            {school?.address || 'Adresse non renseignée'}<br />
            {school?.phone || 'Téléphone non renseigné'}<br />
            {school?.email || ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ margin: 0, color: '#374151', fontSize: '20pt', textTransform: 'uppercase' }}>REÇU DE PAIEMENT</h2>
          <p style={{ margin: '0.5rem 0 0 0', fontWeight: 'bold', fontSize: '12pt', color: '#dc2626' }}>
            N° {receipt.receiptNumber}
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '10pt' }}>
            Date : {receipt.date.toLocaleDateString('fr-FR')}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '4px', width: '45%' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '11pt', color: '#6b7280', textTransform: 'uppercase' }}>Reçu de :</h3>
          <p style={{ margin: 0, fontWeight: 'bold', fontSize: '12pt' }}>
            {student?.name || 'Élève inconnu'}
          </p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '10pt' }}>
            Matricule : {student?.matricule || student?.id || '-'}<br />
            Classe : {student?.classId || '-'}
          </p>
        </div>
      </div>

      {/* Details Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Description</th>
            <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Méthode</th>
            <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt' }}>
              Paiement - {receipt.type}
            </td>
            <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt', textTransform: 'capitalize' }}>
              {receipt.method.replace('_', ' ')}
            </td>
            <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt', textAlign: 'right', fontWeight: 'bold' }}>
              {receipt.amount.toLocaleString('fr-FR')} FCFA
            </td>
          </tr>
        </tbody>
      </table>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
        <div style={{ width: '300px', background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12pt', fontWeight: 'bold' }}>TOTAL PAYÉ :</span>
            <span style={{ fontSize: '14pt', fontWeight: 'bold', color: '#16a34a' }}>{receipt.amount.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#6b7280', fontSize: '9pt' }}>
        <p style={{ margin: '0 0 0.5rem 0' }}>Ce reçu est généré automatiquement et sert de preuve de paiement.</p>
        <p style={{ margin: 0 }}>Référence transaction : {receipt.paymentId}</p>
      </div>
      
      {/* Signature Area */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
        <div style={{ textAlign: 'center', width: '200px' }}>
          <p style={{ margin: '0 0 3rem 0', fontWeight: 'bold' }}>Cachet / Signature</p>
          <div style={{ borderBottom: '1px solid #000' }}></div>
        </div>
      </div>
    </div>
  );
});

ReceiptPDFTemplate.displayName = 'ReceiptPDFTemplate';

export default ReceiptPDFTemplate;
