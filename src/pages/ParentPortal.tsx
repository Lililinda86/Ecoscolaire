import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { LogOut, User as UserIcon, BookOpen, AlertTriangle, CheckCircle, CreditCard, Calendar, Bus } from 'lucide-react';
import type { Student } from '../types';

const ParentPortal: React.FC = () => {
  const { db, currentUser, currentSchool, logout } = useAppContext();
  const [activeTab, setActiveTab] = useState<'overview' | 'grades' | 'attendance' | 'finance' | 'transport'>('overview');

  if (!currentUser || currentUser.role !== 'parent' || !currentSchool) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Accès réservé aux parents de l'école.</div>;
  }

  const parent = currentUser;
  
  // Filter children belonging to this parent and this school
  const children = db.students.filter(s => s.schoolId === currentSchool.id && (parent.studentIds || []).includes(s.id));

  // Helper to check if a specific Tranche is fully paid for a student
  const isTranchePaid = (student: Student, tranche: 'T1' | 'T2' | 'T3') => {
    // If bypass is active, return true immediately
    if (student.financialBypass && student.financialBypass[tranche.toLowerCase() as keyof typeof student.financialBypass]) {
      return true;
    }

    const expectedFee = student[`fee${tranche}`] || 0;
    if (expectedFee === 0) return true; // Free or not set

    const paidForTranche = db.payments
      .filter(p => p.studentId === student.id && p.type === 'tuition' && p.installment === tranche)
      .reduce((sum, p) => sum + p.amount, 0);

    return paidForTranche >= expectedFee;
  };

  const getTrancheBalance = (student: Student, tranche: 'T1' | 'T2' | 'T3') => {
    const expectedFee = student[`fee${tranche}`] || 0;
    const paidForTranche = db.payments
      .filter(p => p.studentId === student.id && p.type === 'tuition' && p.installment === tranche)
      .reduce((sum, p) => sum + p.amount, 0);
    return expectedFee - paidForTranche;
  };

  const renderBlockadeAlert = (student: Student, trimester: 1 | 2 | 3) => {
    const tranche = `T${trimester}` as 'T1' | 'T2' | 'T3';
    if (isTranchePaid(student, tranche)) return null;

    const balance = getTrancheBalance(student, tranche);

    return (
      <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', color: '#991b1b', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Accès Bloqué - Trimestre {trimester}</h4>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            L'accès aux notes et au bulletin du <strong>Trimestre {trimester}</strong> est temporairement bloqué car la <strong>Tranche {trimester}</strong> de pension correspondante n'est pas encore entièrement réglée.
            <br/><br/>
            <strong>Montant Restant : {balance.toLocaleString()} FCFA</strong>
            <br/>
            Veuillez vous rapprocher de l'administration pour régulariser la situation.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Portail Parent - {currentSchool.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Bienvenue, {parent.email}</p>
        </div>
        <button className="secondary" onClick={logout}><LogOut size={18} /> Déconnexion</button>
      </div>

      {children.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <AlertTriangle size={48} style={{ color: 'var(--warning)', margin: '0 auto 1rem' }} />
          <h3>Aucun enfant associé</h3>
          <p>Aucun dossier d'élève n'est actuellement lié à votre compte. Veuillez contacter l'administration.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <button className={activeTab === 'overview' ? 'primary' : 'secondary'} onClick={() => setActiveTab('overview')}><UserIcon size={18} /> Vue d'ensemble</button>
            <button className={activeTab === 'grades' ? 'primary' : 'secondary'} onClick={() => setActiveTab('grades')}><BookOpen size={18} /> Notes & Bulletins</button>
            <button className={activeTab === 'attendance' ? 'primary' : 'secondary'} onClick={() => setActiveTab('attendance')}><Calendar size={18} /> Présences</button>
            <button className={activeTab === 'finance' ? 'primary' : 'secondary'} onClick={() => setActiveTab('finance')}><CreditCard size={18} /> Finances</button>
            <button className={activeTab === 'transport' ? 'primary' : 'secondary'} onClick={() => setActiveTab('transport')}><Bus size={18} /> Transport</button>
          </div>

          <div>
            {children.map(student => (
              <div key={student.id} className="card" style={{ marginBottom: '2rem' }}>
                <h2 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserIcon size={24} color="var(--primary)" /> {student.name} <small style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '1rem' }}>(Matricule: {student.matricule || 'N/A'})</small>
                </h2>

                {activeTab === 'overview' && (
                  <div>
                    <p><strong>Classe :</strong> {db.classes.find(c => c.id === student.classId)?.name || 'Non assigné'}</p>
                    <p><strong>Date de naissance :</strong> {student.dob}</p>
                    <p><strong>Section :</strong> {student.section}</p>
                    {/* Alerte globale sur la vue d'ensemble */}
                    {!isTranchePaid(student, 'T1') && renderBlockadeAlert(student, 1)}
                    {!isTranchePaid(student, 'T2') && renderBlockadeAlert(student, 2)}
                    {!isTranchePaid(student, 'T3') && renderBlockadeAlert(student, 3)}
                  </div>
                )}

                {activeTab === 'grades' && (
                  <div>
                    <h3>Notes du Trimestre 1</h3>
                    {isTranchePaid(student, 'T1') ? (
                      <p>✅ Accès autorisé. Les notes s'afficheront ici.</p>
                    ) : (
                      renderBlockadeAlert(student, 1)
                    )}

                    <h3 style={{ marginTop: '2rem' }}>Notes du Trimestre 2</h3>
                    {isTranchePaid(student, 'T2') ? (
                      <p>✅ Accès autorisé. Les notes s'afficheront ici.</p>
                    ) : (
                      renderBlockadeAlert(student, 2)
                    )}

                    <h3 style={{ marginTop: '2rem' }}>Notes du Trimestre 3</h3>
                    {isTranchePaid(student, 'T3') ? (
                      <p>✅ Accès autorisé. Les notes s'afficheront ici.</p>
                    ) : (
                      renderBlockadeAlert(student, 3)
                    )}
                  </div>
                )}

                {activeTab === 'finance' && (
                  <div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                      <thead style={{ background: 'var(--bg-color)' }}>
                        <tr><th style={{ padding: '0.75rem', textAlign: 'left' }}>Tranche</th><th style={{ padding: '0.75rem', textAlign: 'left' }}>Attendu</th><th style={{ padding: '0.75rem', textAlign: 'left' }}>Payé</th><th style={{ padding: '0.75rem', textAlign: 'left' }}>Statut</th></tr>
                      </thead>
                      <tbody>
                        {['T1', 'T2', 'T3'].map(tranche => {
                          const expected = student[`fee${tranche}` as keyof Student] as number || 0;
                          const paid = db.payments.filter(p => p.studentId === student.id && p.type === 'tuition' && p.installment === tranche).reduce((sum, p) => sum + p.amount, 0);
                          const isPaid = isTranchePaid(student, tranche as any);
                          return (
                            <tr key={tranche} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.75rem' }}>{tranche === 'T1' ? 'Trimestre 1' : tranche === 'T2' ? 'Trimestre 2' : 'Trimestre 3'}</td>
                              <td style={{ padding: '0.75rem' }}>{expected.toLocaleString()} FCFA</td>
                              <td style={{ padding: '0.75rem' }}>{paid.toLocaleString()} FCFA</td>
                              <td style={{ padding: '0.75rem' }}>
                                {isPaid ? <span style={{ color: 'var(--success)', fontWeight: 600 }}><CheckCircle size={14} style={{ verticalAlign: 'middle' }}/> Soldé</span> : <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Impayé ({expected - paid} restants)</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'attendance' && (
                  <div>
                    <p>Historique des présences disponible prochainement.</p>
                  </div>
                )}

                {activeTab === 'transport' && (
                  <div>
                    {student.busId ? (
                      <p><strong>Ligne / Bus :</strong> {db.buses.find(b => b.id === student.busId)?.name || 'Inconnu'}</p>
                    ) : (
                      <p>Votre enfant n'est pas inscrit au service de transport scolaire.</p>
                    )}
                  </div>
                )}

              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ParentPortal;
