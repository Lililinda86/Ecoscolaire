import React, { useRef, useState } from 'react';
import { Download, Printer, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ReceiptPDFTemplate from './ReceiptPDFTemplate';
import type { School, Student, ReceiptLike } from '../types';
import { buildReceiptDisplayModel } from '../utils/paymentReceipt';
import type { ClassLike } from '../utils/paymentReceipt';
import { useAppContext } from '../context/AppContext';

interface ReceiptHistoryProps {
  receipts: ReceiptLike[];
  students: Student[];
  school: School | null;
  classes: ClassLike[];
}

const ReceiptHistory: React.FC<ReceiptHistoryProps> = ({ receipts, students, school, classes }) => {
  const { db } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  
  const printRef = useRef<HTMLDivElement>(null);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptLike | null>(null);
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);

  const filteredReceipts = receipts
    .filter(r => {
      if (!searchTerm) return true;
      const lowerTerm = searchTerm.toLowerCase();
      const student = students.find(s => s.id === r.studentId);
      return (
        r.receiptNumber?.toLowerCase().includes(lowerTerm) ||
        r.id?.toLowerCase().includes(lowerTerm) ||
        (student?.name || '').toLowerCase().includes(lowerTerm)
      );
    })
    .sort((a, b) => {
      const dateAObj = a.createdAt;
      let dateA = 0;
      if (dateAObj) {
        if (typeof dateAObj === 'object' && dateAObj !== null && 'seconds' in dateAObj && typeof dateAObj.seconds === 'number') {
          dateA = dateAObj.seconds;
        } else {
          dateA = new Date(dateAObj as string | number | Date).getTime() / 1000;
        }
      }
      const dateBObj = b.createdAt;
      let dateB = 0;
      if (dateBObj) {
        if (typeof dateBObj === 'object' && dateBObj !== null && 'seconds' in dateBObj && typeof dateBObj.seconds === 'number') {
          dateB = dateBObj.seconds;
        } else {
          dateB = new Date(dateBObj as string | number | Date).getTime() / 1000;
        }
      }
      return dateB - dateA;
    });

  const generatePDF = async (receipt: ReceiptLike, action: 'download' | 'print') => {
    setIsGenerating(receipt.id ?? null);
    setActiveReceipt(receipt);
    
    // Wait for state to update and component to render
    setTimeout(async () => {
      try {
        if (!printRef.current) throw new Error("Template ref not found");
        
        const canvas = await html2canvas(printRef.current, {
          scale: 2,
          useCORS: true,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        
        if (action === 'download') {
          pdf.save(`${receipt.receiptNumber || 'recu'}.pdf`);
        } else {
          pdf.autoPrint();
          window.open(pdf.output('bloburl'), '_blank');
        }
      } catch (error) {
        console.error("Erreur lors de la génération du PDF", error);
        alert("Erreur lors de la génération du reçu PDF.");
      } finally {
        setIsGenerating(null);
        setActiveReceipt(null);
      }
    }, 100);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Hidden template for PDF generation */}
      {activeReceipt && (
        <ReceiptPDFTemplate 
          ref={printRef}
          displayModel={buildReceiptDisplayModel(activeReceipt, students, classes, db.payments)}
          school={school}
        />
      )}

      {/* Toolbar */}
      <div style={{ padding: '1rem', background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem', maxWidth: '400px' }}>
          <Search size={18} color="var(--text-muted)" style={{ marginRight: '0.5rem' }} />
          <input 
            type="text" 
            placeholder="Rechercher (N° reçu, Élève, Transaction ID)..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%' }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left', width: '40px' }}></th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>N° Reçu</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Paiement ID</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Montant</th>
              <th style={{ padding: '1rem', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun reçu trouvé
                </td>
              </tr>
            ) : (
              filteredReceipts.map(receipt => {
                const displayModel = buildReceiptDisplayModel(receipt, students, classes, db.payments);
                const isExpanded = expandedReceiptId === displayModel.id;
                
                return (
                  <React.Fragment key={displayModel.id}>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }} className="hover-row">
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: '0.2rem', display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}
                          onClick={() => setExpandedReceiptId(isExpanded ? null : displayModel.id)}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 'bold', color: '#1e40af' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={16} />
                          {displayModel.receiptNumber}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {displayModel.date}
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{displayModel.studentName}</td>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{displayModel.paymentId}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>{displayModel.formattedAmount}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                          <button
                            className="secondary"
                            style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => generatePDF(receipt, 'download')}
                            disabled={isGenerating === displayModel.id || displayModel.receiptNumber === 'En attente'}
                            title="Télécharger le PDF"
                          >
                            <Download size={14} />
                            {isGenerating === displayModel.id ? '...' : 'PDF'}
                          </button>
                          <button
                            className="secondary"
                            style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => generatePDF(receipt, 'print')}
                            disabled={isGenerating === displayModel.id || displayModel.receiptNumber === 'En attente'}
                            title="Imprimer"
                          >
                            <Printer size={14} />
                            Imprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={7} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nature / Tranche</div>
                              <div style={{ fontWeight: 500 }}>
                                {displayModel.nature}
                                {displayModel.tranche ? ` (${displayModel.tranche})` : ''}
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Méthode d'encaissement</div>
                              <div style={{ fontWeight: 500 }}>{displayModel.method}</div>
                            </div>
                            {displayModel.className && (
                              <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Classe</div>
                                <div style={{ fontWeight: 500 }}>{displayModel.className}</div>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Matricule Élève</div>
                              <div style={{ fontWeight: 500 }}>{displayModel.studentRegistrationNumber}</div>
                            </div>
                          </div>

                          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                            {displayModel.hasSnapshots ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Montant attendu</div>
                                  <div style={{ fontWeight: 'bold' }}>{displayModel.formattedExpectedAmount}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Déjà payé avant</div>
                                  <div style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{displayModel.formattedPreviousPaid}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Versement actuel</div>
                                  <div style={{ fontWeight: 'bold', color: 'var(--success)' }}>+ {displayModel.formattedAmount}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cumul après versement</div>
                                  <div style={{ fontWeight: 'bold', color: '#1e40af' }}>{displayModel.formattedNewPaid}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reste à payer</div>
                                  <div style={{ fontWeight: 'bold', color: displayModel.remainingBalance && displayModel.remainingBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                                    {displayModel.formattedRemainingBalance}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Détail financier historique non disponible pour ce reçu.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReceiptHistory;
