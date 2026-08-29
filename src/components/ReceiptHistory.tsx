import React, { useRef, useState } from 'react';
import { Download, Printer, Search, FileText, ChevronDown, ChevronUp, Send } from 'lucide-react';
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
  const [selectedContactPhone, setSelectedContactPhone] = useState<string>('');
  const [isPopupBlocked, setIsPopupBlocked] = useState<boolean>(false);

  const [preparedWhatsAppShare, setPreparedWhatsAppShare] = useState<{
    receipt: ReceiptLike;
    receiptFile: File;
    pdf: jsPDF;
    filename: string;
    messageText: string;
    mode: 'native' | 'fallback';
    options: { label: string; phone: string }[];
  } | null>(null);

  const normalizePhone = (phone: string | undefined): string | null => {
    if (!phone) return null;
    const trimmed = phone.trim();
    const plusCount = (trimmed.match(/\+/g) || []).length;
    if (plusCount > 1) return null;
    if (plusCount === 1 && !trimmed.startsWith('+')) return null;

    const cleaned = trimmed.replace(/[\s\-()]/g, '');
    let digits = cleaned;

    if (digits.startsWith('+')) {
      if (digits.startsWith('+237')) {
        digits = digits.slice(4);
      } else {
        return null;
      }
    } else if (digits.startsWith('00237')) {
      digits = digits.slice(5);
    } else if (digits.startsWith('237')) {
      if (digits.length === 12) {
        digits = digits.slice(3);
      }
    }

    if (/^\d{9}$/.test(digits)) {
      return `237${digits}`;
    }
    return null;
  };

  const handleCancelShare = () => {
    setPreparedWhatsAppShare(null);
    setSelectedContactPhone('');
    setIsPopupBlocked(false);
    setIsGenerating(null);
    setActiveReceipt(null);
  };

  const handleNativeShareClick = async () => {
    if (!preparedWhatsAppShare) return;
    try {
      await navigator.share({
        files: [preparedWhatsAppShare.receiptFile],
        title: `Reçu ${preparedWhatsAppShare.receipt.receiptNumber || ''}`,
        text: preparedWhatsAppShare.messageText
      });
      handleCancelShare();
    } catch (shareErr) {
      const isAbort = shareErr instanceof Error && shareErr.name === 'AbortError';
      if (isAbort) {
        console.log("Partage natif annulé.");
        handleCancelShare();
        return;
      }
      console.error("Erreur partage natif", shareErr);
      alert("Erreur lors de l'ouverture du partage.");
    }
  };

  const handleFallbackShareClick = () => {
    if (!preparedWhatsAppShare) return;
    const phoneToUse = selectedContactPhone || (preparedWhatsAppShare.options[0] ? preparedWhatsAppShare.options[0].phone : '');
    if (!phoneToUse) return;

    preparedWhatsAppShare.pdf.save(preparedWhatsAppShare.filename);
    const encodedMessage = encodeURIComponent(preparedWhatsAppShare.messageText);
    const waUrl = `https://wa.me/${phoneToUse}?text=${encodedMessage}`;
    const opened = window.open(waUrl, '_blank');

    if (!opened || opened.closed || typeof opened.closed === 'undefined') {
      setIsPopupBlocked(true);
    } else {
      alert(
        "Le reçu a été téléchargé. Dans WhatsApp, joignez manuellement le fichier PDF téléchargé avant l’envoi."
      );
      handleCancelShare();
    }
  };

  const handleOpenWhatsAppInCurrentTab = () => {
    if (!preparedWhatsAppShare) return;
    const phoneToUse = selectedContactPhone || (preparedWhatsAppShare.options[0] ? preparedWhatsAppShare.options[0].phone : '');
    if (!phoneToUse) return;
    const encodedMessage = encodeURIComponent(preparedWhatsAppShare.messageText);
    const waUrl = `https://wa.me/${phoneToUse}?text=${encodedMessage}`;
    window.location.assign(waUrl);
  };

  const handleWhatsAppClick = async (receipt: ReceiptLike) => {
    setIsGenerating(receipt.id ?? null);
    setActiveReceipt(receipt);

    try {
      // Wait for React rendering using double requestAnimationFrame
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

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

      const pdfBlob = pdf.output('blob');
      const displayModel = buildReceiptDisplayModel(receipt, students, classes, db.payments);

      const dateStr = displayModel.date.replace(/\//g, '').replace(/[\s:]/g, '_');
      const cleanName = displayModel.studentName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s]+/g, '_')
        .replace(/[\\/:*?"<>|]/g, '');
      const filename = `recu-${displayModel.receiptNumber}-${cleanName}-${dateStr}.pdf`.toLowerCase();

      const receiptFile = new File([pdfBlob], filename, { type: 'application/pdf' });
      const messageText = `Bonjour,\n\nVeuillez trouver le reçu de paiement n° ${displayModel.receiptNumber} concernant ${displayModel.studentName}, d’un montant de ${displayModel.amount.toLocaleString('fr-FR')} FCFA.\n\nCordialement,\n${school?.name || 'EcoScolaire'}`;

      const canNativeShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [receiptFile] });

      const student = students.find(s => s.id === receipt.studentId);
      const options: { label: string; phone: string }[] = [];
      if (student) {
        const seen = new Set<string>();
        const addOpt = (label: string, rawPhone: string | undefined) => {
          const norm = normalizePhone(rawPhone);
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            options.push({ label, phone: norm });
          }
        };

        addOpt('Parent', student.parentPhone);
        addOpt('Mère', student.motherPhone);
        addOpt('Père', student.fatherPhone);
        addOpt('Tuteur', student.guardianPhone);
      }

      if (canNativeShare) {
        setPreparedWhatsAppShare({
          receipt,
          receiptFile,
          pdf,
          filename,
          messageText,
          mode: 'native',
          options
        });
      } else {
        if (options.length > 0) {
          setSelectedContactPhone(options[0].phone);
        }
        setPreparedWhatsAppShare({
          receipt,
          receiptFile,
          pdf,
          filename,
          messageText,
          mode: 'fallback',
          options
        });
      }
    } catch (err) {
      console.error("Erreur lors de la génération du partage", err);
      alert("Erreur lors de la préparation du partage du reçu.");
      setIsGenerating(null);
    }
  };

  const filteredReceipts = receipts
    .filter(r => {
      if (!searchTerm) return true;
      const lowerTerm = searchTerm.toLowerCase();
      const student = students.find(s => s.id === r.studentId);
      return (
        r.receiptNumber?.toLowerCase().includes(lowerTerm) ||
        r.id?.toLowerCase().includes(lowerTerm) ||
        (student?.name || '').toLowerCase().includes(lowerTerm) ||
        (student?.matricule || '').toLowerCase().includes(lowerTerm) ||
        String(r.type || r.paymentType || '').toLowerCase().includes(lowerTerm) ||
        String(r.installment || '').toLowerCase().includes(lowerTerm) ||
        String(r.period || r.month || '').toLowerCase().includes(lowerTerm) ||
        String(r.date || '').toLowerCase().includes(lowerTerm) ||
        String(r.collectedByName || '').toLowerCase().includes(lowerTerm)
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
            placeholder="Rechercher reçu, élève, matricule, date, type, tranche, mois ou opérateur…"
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
                          {displayModel.isCorrection && (
                            <span style={{ fontSize: '.7rem', color: '#b91c1c', background: '#fee2e2', borderRadius: 4, padding: '.15rem .35rem' }}>
                              CORRECTIF
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {displayModel.date}
                      </td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{displayModel.studentName}</td>
                      <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{displayModel.paymentId}</td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: displayModel.isCorrection ? 'var(--danger)' : undefined }}>{displayModel.formattedAmount}</td>
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
                          <button
                            className="secondary"
                            id={`wa-btn-${displayModel.id}`}
                            style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            onClick={() => handleWhatsAppClick(receipt)}
                            disabled={isGenerating === displayModel.id || displayModel.receiptNumber === 'En attente'}
                            title="Envoyer par WhatsApp"
                          >
                            <Send size={14} />
                            {isGenerating === displayModel.id ? 'Préparation...' : 'Envoyer par WhatsApp'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={7} style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            {displayModel.isCorrection && (
                              <div style={{ gridColumn: '1 / -1', padding: '.75rem', background: '#fee2e2', color: '#991b1b', borderRadius: 4 }}>
                                <strong>Contre-opération immuable</strong><br />
                                Motif : {displayModel.correctionReason || 'Non renseigné'}<br />
                                Paiement original : {displayModel.originalPaymentId || 'Non renseigné'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nature / Tranche</div>
                              <div style={{ fontWeight: 500 }}>
                                {displayModel.nature}
                                {displayModel.tranche ? ` (${displayModel.tranche})` : ''}
                                {displayModel.period ? ` — ${displayModel.period}` : ''}
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
                            {displayModel.collectedByName && (
                              <div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Opérateur</div>
                                <div style={{ fontWeight: 500 }}>{displayModel.collectedByName}</div>
                              </div>
                            )}
                          </div>

                          {displayModel.paymentType === 'transport' && (
                            <div
                              data-testid={`transport-receipt-allocation-${displayModel.id}`}
                              style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #bfdbfe', borderRadius: 4, background: '#eff6ff' }}
                            >
                              <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '.75rem' }}>
                                Ventilation du versement Transport
                              </div>
                              {displayModel.allocations.length > 0 ? displayModel.allocations.map((allocation, index) => (
                                <div
                                  key={`${allocation.kind}-${allocation.period || 'credit'}-${index}`}
                                  style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.35rem 0', borderBottom: '1px solid #dbeafe' }}
                                >
                                  <span>{allocation.kind === 'CREDIT' ? 'Crédit Transport' : `Période ${allocation.period || 'non renseignée'}`}</span>
                                  <strong>{allocation.amount.toLocaleString('fr-FR')} FCFA</strong>
                                </div>
                              )) : (
                                <div style={{ color: 'var(--text-muted)' }}>Ventilation historique non disponible.</div>
                              )}
                              <div style={{ marginTop: '.75rem', textAlign: 'right' }}>
                                <strong>Crédit disponible : {displayModel.formattedTransportCredit || '0 FCFA'}</strong>
                              </div>
                            </div>
                          )}

                          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                            {displayModel.hasSnapshots ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Montant brut</div>
                                  <div style={{ fontWeight: 'bold' }}>{displayModel.formattedGrossExpectedAmount || displayModel.formattedExpectedAmount}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bourse / réduction</div>
                                  <div style={{ fontWeight: 'bold' }}>- {displayModel.formattedDiscountAmount || '0 FCFA'}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Montant net dû</div>
                                  <div style={{ fontWeight: 'bold' }}>{displayModel.formattedNetExpectedAmount || displayModel.formattedExpectedAmount}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Déjà payé avant</div>
                                  <div style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{displayModel.formattedPreviousPaid}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{displayModel.isCorrection ? 'Contre-opération' : 'Versement actuel'}</div>
                                  <div style={{ fontWeight: 'bold', color: displayModel.isCorrection ? 'var(--danger)' : 'var(--success)' }}>{displayModel.isCorrection ? '' : '+ '}{displayModel.formattedAmount}</div>
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

      {preparedWhatsAppShare && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: '450px', padding: '1.5rem', margin: '1rem', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Partager le reçu</h3>

            {preparedWhatsAppShare.mode === 'native' ? (
              <>
                <p style={{ fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  Le menu de partage de votre téléphone va s’ouvrir. Choisissez WhatsApp, puis sélectionnez le parent destinataire.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleCancelShare}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={handleNativeShareClick}
                  >
                    Ouvrir le partage
                  </button>
                </div>
              </>
            ) : (
              <>
                {preparedWhatsAppShare.options.length === 0 ? (
                  <>
                    <p style={{ fontSize: '0.95rem', color: 'var(--danger)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                      Aucun numéro WhatsApp valide n’est enregistré pour cet élève.
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleCancelShare}
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {isPopupBlocked ? (
                      <>
                        <p style={{ fontSize: '0.95rem', color: 'var(--danger)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                          Le reçu a été téléchargé, mais WhatsApp a été bloqué par le navigateur.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="secondary"
                            onClick={handleCancelShare}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={handleOpenWhatsAppInCurrentTab}
                          >
                            Ouvrir WhatsApp dans cet onglet
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {preparedWhatsAppShare.options.length === 1 ? (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ fontSize: '0.95rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                              Le reçu va être partagé avec le parent.
                            </p>
                            <div style={{ padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#f8fafc', fontWeight: 'bold' }}>
                              {preparedWhatsAppShare.options[0].label} ({preparedWhatsAppShare.options[0].phone})
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ fontSize: '0.95rem', marginBottom: '1rem', lineHeight: '1.5' }}>
                              Plusieurs numéros WhatsApp valides ont été trouvés pour cet élève. Veuillez en choisir un :
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {preparedWhatsAppShare.options.map((opt, i) => (
                                <label
                                  key={`${opt.label}-${i}`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    background: '#f8fafc'
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name="selectedContact"
                                    checked={selectedContactPhone === opt.phone}
                                    value={opt.phone}
                                    onChange={() => setSelectedContactPhone(opt.phone)}
                                    id={`contact-opt-${i}`}
                                  />
                                  <div>
                                    <span style={{ fontWeight: 'bold' }}>{opt.label}</span>
                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({opt.phone})</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="secondary"
                            onClick={handleCancelShare}
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={handleFallbackShareClick}
                          >
                            Télécharger et ouvrir WhatsApp
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptHistory;
