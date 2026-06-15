import React, { useRef, useState } from 'react';
import { Download, Printer, Search, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ReceiptPDFTemplate from './ReceiptPDFTemplate';
import type { School, Student } from '../types';

interface ReceiptHistoryProps {
  receipts: any[];
  students: Student[];
  school: School | null;
}

const ReceiptHistory: React.FC<ReceiptHistoryProps> = ({ receipts, students, school }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);

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
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });

  const generatePDF = async (receipt: any, action: 'download' | 'print') => {
    setIsGenerating(receipt.id);
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
          receipt={{
            ...activeReceipt,
            date: new Date(activeReceipt.date?.seconds ? activeReceipt.date.seconds * 1000 : Date.now())
          }}
          school={school}
          student={students.find(s => s.id === activeReceipt.studentId) || null}
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
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun reçu trouvé
                </td>
              </tr>
            ) : (
              filteredReceipts.map(receipt => {
                const student = students.find(s => s.id === receipt.studentId);
                const date = new Date(receipt.createdAt?.seconds ? receipt.createdAt.seconds * 1000 : Date.now());
                
                return (
                  <tr key={receipt.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="hover-row">
                    <td style={{ padding: '1rem', fontWeight: 'bold', color: '#1e40af' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={16} />
                        {receipt.receiptNumber || 'En attente'}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {date.toLocaleDateString('fr-FR')} {date.toLocaleTimeString('fr-FR')}
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{student?.name || 'Inconnu'}</td>
                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{receipt.paymentId}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>{receipt.amount?.toLocaleString('fr-FR')} FCFA</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button 
                          className="secondary"
                          style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          onClick={() => generatePDF(receipt, 'download')}
                          disabled={isGenerating === receipt.id || !receipt.receiptNumber}
                          title="Télécharger le PDF"
                        >
                          <Download size={14} />
                          {isGenerating === receipt.id ? '...' : 'PDF'}
                        </button>
                        <button 
                          className="secondary"
                          style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          onClick={() => generatePDF(receipt, 'print')}
                          disabled={isGenerating === receipt.id || !receipt.receiptNumber}
                          title="Imprimer"
                        >
                          <Printer size={14} />
                          Imprimer
                        </button>
                      </div>
                    </td>
                  </tr>
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
