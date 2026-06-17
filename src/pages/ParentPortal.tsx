import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { LogOut, User as UserIcon, BookOpen, AlertTriangle, CheckCircle, CreditCard, Calendar, Bus } from 'lucide-react';
import type { Student } from '../types';

const ParentPortal: React.FC = () => {
  const { db, currentUser, currentSchool, logout, isSchoolSuspended } = useAppContext();
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
      .filter(p => p.studentId === student.id && p.type === 'tuition' && (p.installment === tranche || (!p.installment && tranche === 'T1')))
      .reduce((sum, p) => sum + p.amount, 0);

    return paidForTranche >= expectedFee;
  };

  const getTrancheBalance = (student: Student, tranche: 'T1' | 'T2' | 'T3') => {
    const expectedFee = student[`fee${tranche}`] || 0;
    const paidForTranche = db.payments
      .filter(p => p.studentId === student.id && p.type === 'tuition' && (p.installment === tranche || (!p.installment && tranche === 'T1')))
      .reduce((sum, p) => sum + p.amount, 0);
    return Math.max(0, expectedFee - paidForTranche);
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

  const isSevereDebt = (student: Student) => {
    // Si la tranche 1 est impayée (sans bypass), c'est un grand impayé.
    return !isTranchePaid(student, 'T1');
  };

  return (
    <div style={{ position: 'relative' }}>
      {isSchoolSuspended && (
        <div style={{ position: 'sticky', top: 0, zIndex: 999, background: '#ea580c', color: 'white', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
          <AlertTriangle size={20} style={{ marginRight: '0.5rem' }} />
          Abonnement suspendu. L'accès est restreint en lecture seule. Veuillez contacter EcoScolaire.
        </div>
      )}
      <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto', paddingTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Portail Parent - {currentSchool.name}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Bienvenue, {parent.email}</p>
        </div>
        <button className="secondary" onClick={logout} data-testid="logout-button"><LogOut size={18} /> Déconnexion</button>
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

                {isSevereDebt(student) && activeTab !== 'finance' ? (
                  <div style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px', padding: '1.5rem', textAlign: 'center', color: '#991b1b', margin: '1rem 0' }}>
                    <AlertTriangle size={32} style={{ margin: '0 auto 1rem' }} />
                    <h3 style={{ margin: '0 0 0.5rem' }}>Dossier Bloqué</h3>
                    <p style={{ margin: 0 }}>
                      L'accès au dossier de <strong>{student.name}</strong> est temporairement restreint en raison d'un impayé majeur sur la scolarité.
                      Veuillez consulter l'onglet <strong>Finances</strong> pour régulariser la situation ou contacter l'administration.
                    </p>
                  </div>
                ) : (
                  <>
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
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BookOpen size={20} color="var(--primary-color)" /> Notes du Trimestre 1</h3>
                    {isTranchePaid(student, 'T1') ? (
                      <div className="card" style={{ background: '#f8fafc', padding: '1rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                              <th style={{ padding: '0.5rem' }}>Matière</th>
                              <th style={{ padding: '0.5rem' }}>Note/20</th>
                              <th style={{ padding: '0.5rem' }}>Appréciation</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem' }}>Mathématiques</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>16.5</td>
                              <td style={{ padding: '0.5rem', color: 'var(--success)' }}>Très bien</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem' }}>Français</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>14.0</td>
                              <td style={{ padding: '0.5rem', color: 'var(--primary-color)' }}>Bien</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '0.5rem' }}>Sciences</td>
                              <td style={{ padding: '0.5rem', fontWeight: 600 }}>18.0</td>
                              <td style={{ padding: '0.5rem', color: 'var(--success)' }}>Excellent</td>
                            </tr>
                          </tbody>
                        </table>
                        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                          <button className="primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Télécharger le Bulletin Complet (PDF)</button>
                        </div>
                      </div>
                    ) : (
                      renderBlockadeAlert(student, 1)
                    )}

                    <h3 style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BookOpen size={20} color="var(--primary-color)" /> Notes du Trimestre 2</h3>
                    {isTranchePaid(student, 'T2') ? (
                      <p style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>✅ Trimestre en cours. Le bulletin n'est pas encore généré.</p>
                    ) : (
                      renderBlockadeAlert(student, 2)
                    )}

                    <h3 style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BookOpen size={20} color="var(--primary-color)" /> Notes du Trimestre 3</h3>
                    {isTranchePaid(student, 'T3') ? (
                      <p style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>✅ Trimestre non débuté.</p>
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
                          const paid = db.payments.filter(p => p.studentId === student.id && p.type === 'tuition' && (p.installment === tranche || (!p.installment && tranche === 'T1'))).reduce((sum, p) => sum + p.amount, 0);
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
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ background: '#f0fdf4', color: '#166534', padding: '1rem', borderRadius: '8px', flex: 1, border: '1px solid #bbf7d0' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>Jours de présence</h4>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>85</div>
                      </div>
                      <div style={{ background: '#fef2f2', color: '#991b1b', padding: '1rem', borderRadius: '8px', flex: 1, border: '1px solid #fecaca' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>Absences justifiées</h4>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>2</div>
                      </div>
                      <div style={{ background: '#fffbeb', color: '#92400e', padding: '1rem', borderRadius: '8px', flex: 1, border: '1px solid #fde68a' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>Absences non justifiées</h4>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>0</div>
                      </div>
                    </div>
                    
                    <h4>Dernières absences</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: 'var(--bg-color)' }}>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Motif</th>
                          <th style={{ padding: '0.75rem', textAlign: 'left' }}>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>12/04/2024</td>
                          <td style={{ padding: '0.75rem' }}>Maladie</td>
                          <td style={{ padding: '0.75rem', color: 'var(--success)' }}>Justifié</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem' }}>05/03/2024</td>
                          <td style={{ padding: '0.75rem' }}>Rendez-vous médical</td>
                          <td style={{ padding: '0.75rem', color: 'var(--success)' }}>Justifié</td>
                        </tr>
                      </tbody>
                    </table>
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
                  </>
                )}

              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
};

export default ParentPortal;
