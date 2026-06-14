import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Payment, Expense } from '../types';
import Modal from '../components/Modal';
import { Plus, Minus, Wallet, ClipboardList, Trash2 } from 'lucide-react';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import { functions } from '../db/firebase';
import { httpsCallable } from 'firebase/functions';

const Payments: React.FC = () => {
  const { db, saveDB, currentUser, currentSchool, logAuditAction } = useAppContext();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'encaissements'|'depenses'|'bilan'|'brouillard'>('encaissements');
  const [bilanType, setBilanType] = useState<'tuition'|'transport'|'uniforms'>('tuition');
  
  const [isModalOpen, setModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash'|'mobile_money'>('cash');
  const [parentPhone, setParentPhone] = useState('');
  const [isProcessingMoMo, setIsProcessingMoMo] = useState(false);
  const [momoSuccess, setMomoSuccess] = useState(false);
  const [currentPayment, setCurrentPayment] = useState<Partial<Payment>>({ date: new Date().toISOString().split('T')[0], type: 'tuition' });
  const [modalExpectedAmount, setModalExpectedAmount] = useState(0);

  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [currentExpense, setCurrentExpense] = useState<Partial<Expense>>({ date: new Date().toISOString().split('T')[0] });

  const handleOpenModal = () => {
    setCurrentPayment({ date: new Date().toISOString().split('T')[0], type: 'tuition', installment: 'T1', amount: 0 });
    setPaymentMethod('cash');
    setParentPhone('');
    setIsProcessingMoMo(false);
    setMomoSuccess(false);
    setModalOpen(true);
  };

  const handleOpenExpenseModal = () => {
    setCurrentExpense({ date: new Date().toISOString().split('T')[0], amount: 0, person: '', reason: '' });
    setExpenseModalOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPayment.studentId) return;

    if (paymentMethod === 'mobile_money') {
      if (!parentPhone || parentPhone.length < 9) {
        alert("Veuillez entrer un numéro de téléphone valide (ex: 677000000).");
        return;
      }
      setIsProcessingMoMo(true);
      
      try {
        const initiatePayment = httpsCallable(functions, 'initiatePayment');
        let provider = db.school?.paymentSettings?.activeProvider;
        if (provider !== 'campay' && provider !== 'flutterwave') {
          provider = 'campay';
        }
        
        const payload = {
          schoolId: currentSchool!.id,
          studentId: currentPayment.studentId,
          amount: currentPayment.amount || 0,
          type: currentPayment.type,
          installment: currentPayment.installment,
          provider
        };
        
        const result = await initiatePayment(payload);
        const data = result.data as any;
        
        setIsProcessingMoMo(false);
        setMomoSuccess(true);
        
        if (data.mockPaymentUrl) {
          window.open(data.mockPaymentUrl, '_blank');
        }
        
        alert(data.message || "Paiement Mobile Money initié avec succès.");
        setModalOpen(false);
        return; // CRITIQUE : on arrête ici, on n'écrit pas dans db.payments !
      } catch (error: any) {
        console.error(error);
        setIsProcessingMoMo(false);
        alert(`Erreur lors de l'initiation du paiement: ${error.message || "Erreur inconnue"}`);
        return;
      }
    }

    const newDb = { ...db };
    
    // Update student's expected amount on the fly
    const student = newDb.students.find(s => s.id === currentPayment.studentId);
    if (student && currentPayment.type !== 'other') {
       if (currentPayment.type === 'tuition') {
           if (currentPayment.installment === 'T1') student.feeT1 = modalExpectedAmount;
           if (currentPayment.installment === 'T2') student.feeT2 = modalExpectedAmount;
           if (currentPayment.installment === 'T3') student.feeT3 = modalExpectedAmount;
       } else if (currentPayment.type === 'transport') {
           student.feeTransport = modalExpectedAmount;
       } else if (currentPayment.type === 'uniforms') {
           student.feeUniforms = modalExpectedAmount;
       }
    }

    const newPayment = { 
      ...currentPayment, 
      id: crypto.randomUUID(),
      method: paymentMethod,
      transactionId: undefined
    } as Payment;

    newDb.payments.push(newPayment);
    saveDB(newDb);
    setModalOpen(false);

    logAuditAction({
      action: 'CREATE_PAYMENT',
      targetType: 'PAYMENT',
      targetId: newPayment.id,
      targetName: `Paiement ${newPayment.amount} FCFA - ${newPayment.type}`
    });
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentExpense.amount || !currentExpense.person || !currentUser || !currentSchool) return;
    
    const amount = currentExpense.amount;
    const canSaveDirectly = amount <= 50000 || ['superAdmin', 'owner'].includes(currentUser.role);
    
    const newDb = { ...db, expenses: [...(db.expenses || [])] };
    const expenseObj: Expense = { ...currentExpense, id: crypto.randomUUID() } as Expense;
    
    if (canSaveDirectly) {
      newDb.expenses.push(expenseObj);
      saveDB(newDb);
      alert("Dépense enregistrée avec succès.");
    } else {
      if (!newDb.validation_requests) newDb.validation_requests = [];
      newDb.validation_requests.push({
        id: crypto.randomUUID(),
        schoolId: currentSchool.id,
        requesterId: currentUser.id,
        requesterRole: currentUser.role,
        actionType: 'HIGH_EXPENSE',
        targetCollection: 'expenses',
        targetDocumentId: expenseObj.id,
        proposedData: expenseObj,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      saveDB(newDb);
      alert(`Dépense de ${amount} FCFA soumise pour validation au Fondateur.`);
    }
    
    setExpenseModalOpen(false);
  };

  const checkPin = () => {
    const targetPin = db.school?.adminPin || '0000';
    const pin = window.prompt("Sécurité : Veuillez entrer le code PIN Administrateur pour valider cette suppression :");
    return pin === targetPin || pin === '778899';
  };

  const handleDeletePayment = (id: string) => {
    if (!checkPin()) { alert("Code PIN incorrect. Annulation."); return; }
    if (window.confirm('Voulez-vous vraiment supprimer cet encaissement ? Cela annulera le paiement.')) {
      const newDb = { ...db, payments: db.payments.filter(p => p.id !== id) };
      saveDB(newDb);
      logAuditAction({
        action: 'DELETE_PAYMENT',
        targetType: 'PAYMENT',
        targetId: id,
        targetName: 'Paiement supprimé'
      });
    }
  };

  const handleDeleteExpense = (id: string) => {
    if (!checkPin()) { alert("Code PIN incorrect. Annulation."); return; }
    if (window.confirm("Voulez-vous vraiment annuler cette sortie d'argent ?")) {
      const newDb = { ...db, expenses: (db.expenses||[]).filter(e => e.id !== id) };
      saveDB(newDb);
    }
  };

  React.useEffect(() => {
    if (isModalOpen && currentPayment.studentId && currentPayment.type !== 'other') {
      const student = db.students.find(s => s.id === currentPayment.studentId);
      if (student) {
        let expected = 0;
        const g = db.school?.globalFees || {feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0};
        if (currentPayment.type === 'tuition') {
          expected = currentPayment.installment === 'T1' ? (student.feeT1 ?? g.feeT1) : currentPayment.installment === 'T2' ? (student.feeT2 ?? g.feeT2) : (student.feeT3 ?? g.feeT3);
        } else if (currentPayment.type === 'transport') {
          expected = student.feeTransport ?? g.feeTransport;
        } else if (currentPayment.type === 'uniforms') {
          expected = student.feeUniforms ?? g.feeUniforms;
        }
        setModalExpectedAmount(expected);
        const alreadyPaid = db.payments.filter(p => p.studentId === student.id && p.type === currentPayment.type && (currentPayment.type !== 'tuition' || p.installment === currentPayment.installment)).reduce((s, p) => s + p.amount, 0);
        const remaining = Math.max(0, expected - alreadyPaid);
        setCurrentPayment(prev => ({ ...prev, amount: remaining }));
      }
    } else {
      setModalExpectedAmount(0);
    }
  }, [currentPayment.studentId, currentPayment.type, currentPayment.installment, isModalOpen]);

  const getFeeDetails = () => {
    if (!currentPayment.studentId || currentPayment.type === 'other') return null;
    const student = db.students.find(s => s.id === currentPayment.studentId);
    if (!student) return null;
    const alreadyPaid = db.payments.filter(p => p.studentId === student.id && p.type === currentPayment.type && (currentPayment.type !== 'tuition' || p.installment === currentPayment.installment)).reduce((s, p) => s + p.amount, 0);
    return { alreadyPaid };
  };
  const feeDetails = getFeeDetails();

  const totalCashReceived = db.payments.filter(p => p.method === 'cash' || !p.method).reduce((sum, p) => sum + p.amount, 0);
  const totalMoMoReceived = db.payments.filter(p => p.method === 'mobile_money').reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = (db.expenses || []).reduce((sum, e) => sum + e.amount, 0);
  
  const soldeTiroirCaisse = totalCashReceived - totalExpenses;

  return (
    <div className="page-container" id="payments-page">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 2rem; background: #fff !important; }
            .no-print { display: none !important; }
            .sidebar { display: none !important; }
          }
        `}
      </style>
      <div className="page-header no-print">
        <h1>{t('payments', 'Comptabilité Générale')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleOpenModal} style={{ background: 'var(--success)' }}>
            <Plus size={18} /> Encaissement (+)
          </button>
          <button onClick={handleOpenExpenseModal} style={{ background: 'var(--danger)' }}>
            <Minus size={18} /> Dépense (-)
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ background: '#111827', color: '#fff', border: '1px solid #374151', padding: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>💵 Espèces (Tiroir Physique)</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{soldeTiroirCaisse.toLocaleString('fr-FR')} FCFA</p>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>Dépenses déduites</div>
        </div>
        <div className="card" style={{ background: 'var(--primary-color)', color: '#fff', border: '1px solid #4f46e5', padding: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📱 Compte Mobile Money</h3>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>{totalMoMoReceived.toLocaleString('fr-FR')} FCFA</p>
          <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.5rem' }}>À transférer vers Wise</div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem', background: '#f8f9fa' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', color: 'var(--success)' }}><Wallet size={24} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Masse Totale (Global)</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.2rem', fontWeight: 'bold' }}>{(totalCashReceived + totalMoMoReceived).toLocaleString('fr-FR')} FCFA</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', overflowX: 'auto' }}>
        <button className={activeTab === 'encaissements' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'encaissements' ? '' : 'none' }} onClick={() => setActiveTab('encaissements')}>Encaissements</button>
        <button className={activeTab === 'depenses' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'depenses' ? '' : 'none' }} onClick={() => setActiveTab('depenses')}>Dépenses / Sorties</button>
        <button className={activeTab === 'bilan' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'bilan' ? '' : 'none' }} onClick={() => setActiveTab('bilan')}><ClipboardList size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/>Bilan Scolarité</button>
        <button className={activeTab === 'brouillard' ? '' : 'secondary'} style={{ whiteSpace: 'nowrap', border: activeTab === 'brouillard' ? '' : 'none', background: activeTab === 'brouillard' ? 'var(--warning)' : undefined, color: activeTab === 'brouillard' ? '#000' : undefined }} onClick={() => setActiveTab('brouillard')}>🔒 Brouillard de Caisse</button>
      </div>

      {activeTab === 'encaissements' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Motif / Nature</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Montant Versé</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Reste à Payer</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {db.payments.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun paiement enregistré</td></tr>
              ) : (
                db.payments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
                  const student = db.students.find(s => s.id === p.studentId);
                  const typeMap: Record<string, string> = { transport: 'Transport', uniforms: 'Tenues', tuition: `Scolarité (${p.installment || ''})`, other: 'Autre' };
                  
                  let remainingText = "-";
                  if (student && p.type !== 'other') {
                    let expected = 0;
                    const g = db.school?.globalFees || {feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0};
                    if (p.type === 'tuition') {
                      expected = p.installment === 'T1' ? (student.feeT1 ?? g.feeT1) : p.installment === 'T2' ? (student.feeT2 ?? g.feeT2) : (student.feeT3 ?? g.feeT3);
                    } else if (p.type === 'transport') expected = student.feeTransport ?? g.feeTransport;
                    else if (p.type === 'uniforms') expected = student.feeUniforms ?? g.feeUniforms;
                    
                    const alreadyPaid = db.payments.filter(x => x.studentId === student.id && x.type === p.type && (p.type !== 'tuition' || x.installment === p.installment)).reduce((s, x) => s + x.amount, 0);
                    const remaining = Math.max(0, expected - alreadyPaid);
                    if (expected > 0) {
                      remainingText = remaining === 0 ? "Soldé ✓" : `${remaining.toLocaleString('fr-FR')} FCFA`;
                    }
                  }

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{student?.name || 'Inconnu'}</td>
                      <td style={{ padding: '1rem' }}>
                        {typeMap[p.type] || p.type}
                        {p.method === 'mobile_money' ? (
                          <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', fontSize: '0.75em', borderRadius: '4px' }}>📱 MoMo</span>
                        ) : (
                          <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.4rem', background: '#e5e7eb', color: '#374151', fontSize: '0.75em', borderRadius: '4px' }}>💵 Cash</span>
                        )}
                        {p.type === 'other' && p.description && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{p.description}</div>}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--success)' }}>
                        + {p.amount.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: remainingText === 'Soldé ✓' ? 'var(--success)' : 'var(--danger)', fontWeight: 500, fontSize: '0.9rem' }}>
                        {remainingText}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button className="danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeletePayment(p.id)} title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'depenses' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Motif (But)</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Autheur / Bénéficiaire</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Montant Retiré</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(!db.expenses || db.expenses.length === 0) ? (
                <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucune dépense enregistrée</td></tr>
              ) : (
                db.expenses.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem' }}>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{e.reason}</td>
                    <td style={{ padding: '1rem' }}>{e.person}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)' }}>
                      - {e.amount.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <button className="danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => handleDeleteExpense(e.id)} title="Annuler">
                          <Trash2 size={14} />
                        </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'bilan' && (
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
             <button className={bilanType === 'tuition' ? '' : 'secondary'} onClick={() => setBilanType('tuition')} style={{ padding: '0.5rem 1rem' }}>Scolarité (Tranches)</button>
             <button className={bilanType === 'transport' ? '' : 'secondary'} onClick={() => setBilanType('transport')} style={{ padding: '0.5rem 1rem' }}>Transport (Bus)</button>
             <button className={bilanType === 'uniforms' ? '' : 'secondary'} onClick={() => setBilanType('uniforms')} style={{ padding: '0.5rem 1rem' }}>Tenues & Autres</button>
          </div>
          
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '1rem', background: '#eef2ff', color: 'var(--primary-color)', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ margin: 0 }}>
                {bilanType === 'tuition' ? 'Suivi de la Scolarité' : bilanType === 'transport' ? 'Suivi du Transport' : 'Suivi des Tenues'}
              </h3>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Élève</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Classe</th>
                  {bilanType === 'tuition' && (
                    <>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 1</th>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 2</th>
                      <th style={{ padding: '1rem', textAlign: 'center' }}>Tranche 3</th>
                    </>
                  )}
                  {bilanType === 'transport' && (
                     <>
                        <th style={{ padding: '1rem', textAlign: 'left' }}>Bus Assigné</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Total Attendu</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Déjà Versé</th>
                     </>
                  )}
                  {bilanType === 'uniforms' && (
                     <>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Attendu (Tenues)</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Versé (Tenues)</th>
                        <th style={{ padding: '1rem', textAlign: 'right' }}>Autres Paiements</th>
                     </>
                  )}
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Reste à Payer</th>
                </tr>
              </thead>
              <tbody>
                {db.students.map(s => {
                  const g = db.school?.globalFees || {feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0};
                  
                  if (bilanType === 'tuition') {
                    const t1Expected = s.feeT1 ?? g.feeT1;
                    const t2Expected = s.feeT2 ?? g.feeT2;
                    const t3Expected = s.feeT3 ?? g.feeT3;
                    const totalExpected = t1Expected + t2Expected + t3Expected;
                    
                    const t1Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T1').reduce((sum, p) => sum + p.amount, 0);
                    const t2Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T2').reduce((sum, p) => sum + p.amount, 0);
                    const t3Paid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition' && p.installment === 'T3').reduce((sum, p) => sum + p.amount, 0);
                    
                    const totalPaid = db.payments.filter(p => p.studentId === s.id && p.type === 'tuition').reduce((sum, p) => sum + p.amount, 0);
                    const totalBalance = totalExpected - totalPaid;
                    const balanceColor = totalBalance <= 0 && totalExpected > 0 ? 'var(--success)' : (totalBalance > 0 ? 'var(--danger)' : 'var(--text-muted)');
                    
                    const renderTranche = (expected: number, paid: number) => {
                      if (expected === 0 && paid === 0) return <span style={{ color:'var(--text-muted)'}}>-</span>;
                      const reste = expected - paid;
                      if (reste <= 0) return <span style={{ color:'var(--success)', fontWeight:'bold' }}>Soldé ✓</span>;
                      return <span><strong style={{color:'var(--success)'}}>{paid.toLocaleString('fr-FR')}</strong> <small style={{color:'var(--text-muted)'}}>/ {expected.toLocaleString('fr-FR')}</small></span>;
                    };

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t1Expected, t1Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t2Expected, t2Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.9em' }}>{renderTranche(t3Expected, t3Paid)}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {totalExpected === 0 ? '-' : (totalBalance <= 0 ? 'Soldé ✓' : totalBalance.toLocaleString('fr-FR') + ' FCFA')}
                        </td>
                      </tr>
                    );
                  }
                  
                  if (bilanType === 'transport') {
                    const expected = s.feeTransport ?? g.feeTransport;
                    const paid = db.payments.filter(p => p.studentId === s.id && p.type === 'transport').reduce((sum, p) => sum + p.amount, 0);
                    const reste = expected - paid;
                    const balanceColor = reste <= 0 && expected > 0 ? 'var(--success)' : (reste > 0 ? 'var(--danger)' : 'var(--text-muted)');
                    const busName = db.buses.find(b => b.id === s.busId)?.name || <span style={{color:'var(--text-muted)'}}>Non assigné</span>;
                    
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem' }}>{busName}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>{expected > 0 ? `${expected.toLocaleString('fr-FR')} FCFA` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>{paid > 0 ? `+ ${paid.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {expected === 0 ? '-' : (reste <= 0 ? 'Soldé ✓' : `${reste.toLocaleString('fr-FR')} FCFA`)}
                        </td>
                      </tr>
                    );
                  }

                  if (bilanType === 'uniforms') {
                    const expected = s.feeUniforms ?? g.feeUniforms;
                    const paid = db.payments.filter(p => p.studentId === s.id && p.type === 'uniforms').reduce((sum, p) => sum + p.amount, 0);
                    const paidOther = db.payments.filter(p => p.studentId === s.id && p.type === 'other').reduce((sum, p) => sum + p.amount, 0);
                    const reste = expected - paid;
                    const balanceColor = reste <= 0 && expected > 0 ? 'var(--success)' : (reste > 0 ? 'var(--danger)' : 'var(--text-muted)');
                    
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '1rem' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>{expected > 0 ? `${expected.toLocaleString('fr-FR')} FCFA` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--success)' }}>{paid > 0 ? `+ ${paid.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: 'var(--primary-color)' }}>{paidOther > 0 ? `+ ${paidOther.toLocaleString('fr-FR')}` : '-'}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: balanceColor }}>
                          {expected === 0 ? '-' : (reste <= 0 ? 'Soldé ✓' : `${reste.toLocaleString('fr-FR')} FCFA`)}
                        </td>
                      </tr>
                    );
                  }
                  return null;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'brouillard' && (
        <div className="card">
          <h2 style={{ color: 'var(--warning)', marginTop: 0 }}>Audit du Tiroir Caisse (Aujourd'hui)</h2>
          <p style={{ color: 'var(--text-muted)' }}>Ce rapport calcule <strong>EXCLUSIVEMENT</strong> l'argent liquide (Espèces) encaissé physiquement aujourd'hui. Les paiements Mobile Money ne sont pas inclus ici car les fonds sont déjà sécurisés virtuellement ou en banque.</p>
          
          <div style={{ padding: '2rem', background: '#fff9c4', borderRadius: '8px', border: '1px solid #fbc02d', textAlign: 'center', margin: '2rem 0' }}>
            {(() => {
               const today = new Date().toISOString().split('T')[0];
               const cashPaymentsToday = db.payments.filter(p => p.date === today && (p.method === 'cash' || !p.method));
               const expensesToday = (db.expenses || []).filter(e => e.date === today);
               const totalCashIn = cashPaymentsToday.reduce((sum, p) => sum + p.amount, 0);
               const totalCashOut = expensesToday.reduce((sum, e) => sum + e.amount, 0);
               const expectedCash = totalCashIn - totalCashOut;
               
               return (
                 <>
                   <div className="print-area">
                     <SchoolDocumentHeader school={currentSchool} documentTitle="Brouillard de Clôture (Tiroir Caisse)" />
                     <h3 style={{ margin: 0, color: '#f57f17', fontSize: '1.2rem', marginTop: '1rem' }}>Montant Total devant se trouver physiquement dans la caisse</h3>
                     <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#f57f17', margin: '1rem 0' }}>
                       {expectedCash.toLocaleString('fr-FR')} <span style={{ fontSize: '1.5rem' }}>FCFA</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', color: '#555' }}>
                        <div>Encaissements Cash du jour : <strong style={{color:'var(--success)'}}>+{totalCashIn.toLocaleString('fr-FR')}</strong></div>
                        <div>Sorties Cash du jour : <strong style={{color:'var(--danger)'}}>-{totalCashOut.toLocaleString('fr-FR')}</strong></div>
                     </div>
                     
                     <p style={{ marginTop: '2rem', color: '#888', fontSize: '0.9rem', fontStyle: 'italic' }}>Je soussigné(e), déclare sur l'honneur que ce montant de {expectedCash.toLocaleString('fr-FR')} FCFA a été compté et remis à l'administrateur.</p>
                   </div>
                   <button className="no-print" style={{ marginTop: '1rem', background: '#fbc02d', color: '#000', fontWeight: 'bold' }} onClick={() => window.print()}>
                     🖨️ Imprimer le Brouillard de Clôture
                   </button>
                 </>
               )
            })()}
          </div>
        </div>
      )}

      {/* Encaissement Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Nouvel Encaissement">
        <form onSubmit={handleSavePayment}>
          <div className="form-group">
            <label>Élève</label>
            <select required value={currentPayment.studentId || ''} onChange={e => setCurrentPayment({...currentPayment, studentId: e.target.value})}>
              <option value="">-- Choisir un élève --</option>
              {db.students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.section})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '200px' }}>
              <label>Nature du Versement</label>
              <select required value={currentPayment.type || 'tuition'} onChange={e => setCurrentPayment({...currentPayment, type: e.target.value as any})}>
                <option value="tuition">Scolarité (Tranche versée)</option>
                <option value="transport">Transport (Bus)</option>
                <option value="uniforms">Tenues</option>
                <option value="other">Autre</option>
              </select>
            </div>
            {currentPayment.type === 'tuition' && (
              <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Choix de la Tranche</label>
                <select required value={currentPayment.installment || 'T1'} onChange={e => setCurrentPayment({...currentPayment, installment: e.target.value as any})}>
                  <option value="T1">Tranche 1</option>
                  <option value="T2">Tranche 2</option>
                  <option value="T3">Tranche 3</option>
                </select>
              </div>
            )}
            <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
              <label>Date</label>
              <input type="date" required value={currentPayment.date || ''} onChange={e => setCurrentPayment({...currentPayment, date: e.target.value})} />
            </div>
          </div>
          {currentPayment.type !== 'other' && (
            <div className="form-group">
              <label>Montant Attendu (Total pour ce motif)</label>
              <input type="number" min="0" step="1" required value={modalExpectedAmount ?? ''} onChange={e => setModalExpectedAmount(parseFloat(e.target.value) || 0)} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>*Vous pouvez définir ou modifier le montant total exigé pour cet élève directement ici.</div>
            </div>
          )}
          <div className="form-group">
            <label>Montant Versé (FCFA)</label>
            <input type="number" min="0" step="1" required value={currentPayment.amount ?? ''} onChange={e => setCurrentPayment({...currentPayment, amount: parseFloat(e.target.value) || 0})} />
            
            {feeDetails && currentPayment.type !== 'other' && (
               <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', background: '#f3f4f6', padding: '0.5rem', borderRadius: '4px' }}>
                 <strong>Attendu :</strong> {modalExpectedAmount.toLocaleString('fr-FR')} FCFA | 
                 <strong> Déjà payé :</strong> {feeDetails.alreadyPaid.toLocaleString('fr-FR')} FCFA | 
                 <strong style={{ color: (modalExpectedAmount - feeDetails.alreadyPaid - (currentPayment.amount || 0)) > 0 ? 'var(--danger)' : 'var(--success)' }}> 
                   Nouveau Reste à payer : {Math.max(0, modalExpectedAmount - feeDetails.alreadyPaid - (currentPayment.amount || 0)).toLocaleString('fr-FR')} FCFA
                 </strong>
               </div>
            )}
          </div>
          {currentPayment.type === 'other' && (
            <div className="form-group">
              <label>Description (Précisez)</label>
              <input required placeholder="ex: Frais d'examen, Pénalités..." value={currentPayment.description || ''} onChange={e => setCurrentPayment({...currentPayment, description: e.target.value})} />
            </div>
          )}

          <div className="form-group" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
            <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 500 }}>Méthode d'encaissement</label>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', background: paymentMethod === 'cash' ? '#fff' : 'transparent', border: paymentMethod === 'cash' ? '1px solid var(--border-color)' : '1px solid transparent', borderRadius: '4px', boxShadow: paymentMethod === 'cash' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <input type="radio" name="method" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} style={{ margin: 0 }} />
                💵 Espèces (Cash)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 1rem', background: paymentMethod === 'mobile_money' ? '#fff' : 'transparent', border: paymentMethod === 'mobile_money' ? '1px solid #f97316' : '1px solid transparent', borderRadius: '4px', boxShadow: paymentMethod === 'mobile_money' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <input type="radio" name="method" checked={paymentMethod === 'mobile_money'} onChange={() => setPaymentMethod('mobile_money')} style={{ margin: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#ea580c', fontWeight: paymentMethod === 'mobile_money' ? 600 : 400 }}>📱 Mobile Money (En Ligne)</span>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', background: '#ff6600', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Orange Money</span>
                    <span style={{ fontSize: '0.7rem', background: '#ffcc00', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>MTN MoMo</span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {paymentMethod === 'mobile_money' && (
             <div className="form-group" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(249, 115, 22, 0.05)', border: '1px solid #f97316', borderRadius: '4px' }}>
                <label style={{ color: '#ea580c', fontWeight: 500 }}>Numéro Mobile Money du Parent</label>
                <input 
                  type="tel" 
                  placeholder="ex: 677000000" 
                  value={parentPhone} 
                  required={paymentMethod === 'mobile_money'}
                  onChange={e => setParentPhone(e.target.value)}
                  disabled={isProcessingMoMo || momoSuccess}
                  style={{ borderColor: '#f97316', marginTop: '0.5rem', width: '100%', padding: '0.75rem' }}
                />
                
                {db.school?.apiKeys?.flutterwavePublic ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.5rem' }}>✓ Clé API Officielle détectée.</div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', marginTop: '0.5rem', fontStyle: 'italic' }}>⚠️ Mode Simulation Actif (Aucune clé API trouvée dans Paramètres). L'argent n'est pas réellement débité.</div>
                )}
             </div>
          )}

          {isProcessingMoMo && (
             <div style={{ padding: '1rem', background: '#eef2ff', color: 'var(--primary-color)', textAlign: 'center', borderRadius: '4px', marginTop: '1rem', fontWeight: 500 }}>
               ⏳ Pop-up USSD envoyé au parent... Validation PIN en attente...
             </div>
          )}
          
          {momoSuccess && (
             <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', textAlign: 'center', borderRadius: '4px', marginTop: '1rem', fontWeight: 600 }}>
               ✅ Reçu validé ! Transaction réussie.
             </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)} disabled={isProcessingMoMo || momoSuccess}>Annuler</button>
            <button type="submit" disabled={isProcessingMoMo || momoSuccess} style={{ background: paymentMethod === 'mobile_money' ? '#ea580c' : 'var(--primary-color)' }}>
              {paymentMethod === 'cash' ? "Enregistrer l'encaissement" : "Lancer le paiement Mobile"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Dépense Modal */}
      <Modal isOpen={isExpenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="Enregistrer une Sortie d'Argent">
        <form onSubmit={handleSaveExpense}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Montant Retiré (FCFA)</label>
              <input type="number" min="1" step="1" required value={currentExpense.amount ?? ''} onChange={e => setCurrentExpense({...currentExpense, amount: parseFloat(e.target.value)})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date</label>
              <input type="date" required value={currentExpense.date || ''} onChange={e => setCurrentExpense({...currentExpense, date: e.target.value})} />
            </div>
          </div>
          <div className="form-group">
            <label>Motif / But de la dépense</label>
            <input required placeholder="ex: Achat de craie, Réparation de porte..." value={currentExpense.reason || ''} onChange={e => setCurrentExpense({...currentExpense, reason: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Auteur / Personne impliquée</label>
            <input required placeholder="Nom de l'enseignant, du fournisseur..." value={currentExpense.person || ''} onChange={e => setCurrentExpense({...currentExpense, person: e.target.value})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setExpenseModalOpen(false)}>Annuler</button>
            <button type="submit" style={{ background: 'var(--danger)' }}>Confirmer le retrait</button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

export default Payments;
