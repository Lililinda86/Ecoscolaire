import React from 'react';
import type { School } from '../types';
import type { ReceiptDisplayModel } from '../utils/paymentReceipt';

interface ReceiptPDFTemplateProps {
  displayModel: ReceiptDisplayModel;
  school: School | null;
}

const ReceiptPDFTemplate = React.forwardRef<HTMLDivElement, ReceiptPDFTemplateProps>(
  ({ displayModel, school }, ref) => {
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
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {school?.logoUrl && (
              <img
                src={school.logoUrl}
                alt={`Logo ${school.name}`}
                style={{ width: '80px', height: '80px', objectFit: 'contain' }}
              />
            )}
            <div>
              <h1 style={{ margin: 0, color: '#1e40af', fontSize: '24pt' }}>{displayModel.schoolName}</h1>
              <p style={{ margin: '0.5rem 0 0 0', color: '#4b5563', fontSize: '10pt' }}>
                {school?.address || 'Adresse non renseignée'}<br />
                {school?.phone || 'Téléphone non renseigné'}<br />
                {school?.email || ''}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: 0, color: '#374151', fontSize: '20pt', textTransform: 'uppercase' }}>REÇU DE PAIEMENT</h2>
            <p style={{ margin: '0.5rem 0 0 0', fontWeight: 'bold', fontSize: '12pt', color: '#dc2626' }}>
              N° {displayModel.receiptNumber}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '10pt' }}>
              Date : {displayModel.date}
            </p>
            {displayModel.academicYear && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '10pt', color: '#4b5563' }}>
                Année scolaire : {displayModel.academicYear}
              </p>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div style={{ border: '1px solid #e5e7eb', padding: '1rem', borderRadius: '4px', width: '100%' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '11pt', color: '#6b7280', textTransform: 'uppercase' }}>Informations Élève</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '11pt' }}>
                <strong>Nom :</strong> {displayModel.studentName}
              </p>
              <p style={{ margin: 0, fontSize: '11pt' }}>
                <strong>Matricule :</strong> {displayModel.studentRegistrationNumber}
              </p>
              {displayModel.className && (
                <p style={{ margin: 0, fontSize: '11pt' }}>
                  <strong>Classe :</strong> {displayModel.className}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Details Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Nature du Paiement</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Méthode</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #d1d5db', fontSize: '11pt' }}>Versement actuel</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt' }}>
                <div>{displayModel.nature}</div>
                {displayModel.tranche && (
                  <div style={{ marginTop: '0.25rem', fontSize: '10pt', color: '#4b5563' }}>
                    Tranche : {displayModel.tranche}
                  </div>
                )}
                {displayModel.period && (
                  <div style={{ marginTop: '0.25rem', fontSize: '10pt', color: '#4b5563' }}>
                    Période : {displayModel.period}
                  </div>
                )}
              </td>
              <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt' }}>
                {displayModel.method}
              </td>
              <td style={{ padding: '1rem 0.75rem', borderBottom: '1px solid #e5e7eb', fontSize: '11pt', textAlign: 'right', fontWeight: 'bold' }}>
                {displayModel.formattedAmount}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Financial snapshots */}
        <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
          {displayModel.hasSnapshots ? (
            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '11pt', color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                {displayModel.paymentType === 'registration_fee' ? "Situation financière des frais d’inscription" : "Situation financière de la tranche"}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '11pt' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Montant brut :</span>{' '}
                  <strong style={{ color: '#0f172a' }}>{displayModel.formattedGrossExpectedAmount || displayModel.formattedExpectedAmount}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Bourse / réduction :</span>{' '}
                  <strong style={{ color: '#7c3aed' }}>{displayModel.formattedDiscountAmount || '0 FCFA'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Montant net dû :</span>{' '}
                  <strong style={{ color: '#0f172a' }}>{displayModel.formattedNetExpectedAmount || displayModel.formattedExpectedAmount}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Cumul après versement :</span>{' '}
                  <strong style={{ color: '#1e40af' }}>{displayModel.formattedNewPaid}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Déjà payé avant :</span>{' '}
                  <strong style={{ color: '#64748b' }}>{displayModel.formattedPreviousPaid}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Reste à payer :</span>{' '}
                  <strong style={{ color: displayModel.remainingBalance && displayModel.remainingBalance > 0 ? '#b91c1c' : '#15803d' }}>
                    {displayModel.formattedRemainingBalance}
                  </strong>
                </div>
              </div>
              {displayModel.benefits.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px solid #e2e8f0', fontSize: '10pt' }}>
                  {displayModel.benefits.map((benefit, index) => (
                    <div key={`${benefit.reference || benefit.benefitType}-${index}`}>
                      {benefit.benefitType || 'Avantage'}{benefit.reference ? ` (${benefit.reference})` : ''}
                      {' : '}{(benefit.discountAmount || 0).toLocaleString('fr-FR')} FCFA
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontStyle: 'italic', color: '#64748b', fontSize: '10pt', background: '#f8fafc', padding: '1rem', borderRadius: '4px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              Détail financier historique non disponible pour ce reçu.
            </div>
          )}
        </div>

        {/* Total Banner */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
          <div style={{ width: '300px', background: '#f0fdf4', padding: '1rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12pt', fontWeight: 'bold', color: '#166534', whiteSpace: 'nowrap' }}>VERSEMENT REÇU :</span>
              <span style={{ fontSize: '14pt', fontWeight: 'bold', color: '#15803d', whiteSpace: 'nowrap' }}>{displayModel.formattedAmount}</span>
            </div>
          </div>
        </div>

        {/* Signature Area */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <div style={{ textAlign: 'center', width: '200px' }}>
            <p style={{ margin: '0 0 .5rem 0', fontWeight: 'bold', fontSize: '10pt' }}>Encaissement effectué par</p>
            <p style={{ margin: '0 0 3rem 0', fontSize: '10pt' }}>{displayModel.collectedByName || 'Opérateur autorisé'}</p>
            <div style={{ borderBottom: '1px solid #000' }}></div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#94a3b8', fontSize: '9pt' }}>
          <p style={{ margin: '0 0 0.5rem 0' }}>Ce reçu est généré automatiquement et sert de preuve de paiement.</p>
          <p style={{ margin: 0 }}>Référence transaction : {displayModel.paymentId}</p>
        </div>
      </div>
    );
  }
);

ReceiptPDFTemplate.displayName = 'ReceiptPDFTemplate';

export default ReceiptPDFTemplate;
