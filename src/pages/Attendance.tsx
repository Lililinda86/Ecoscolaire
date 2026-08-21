import React, { useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { db as firestore } from '../db/firebase';

import { sortClasses } from '../utils/sortClasses';
import { Check, X, Calendar, Clock, LogOut, Printer } from 'lucide-react';
import Modal from '../components/Modal';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import type { Attendance as AttendanceRecord, StaffAttendance, AttendanceStatus } from '../types';
import { recordStudentAttendance } from '../services/studentAttendance';
import { deduplicateAttendanceRecords, getAfricaDoualaDateKey, normalizeAttendanceDate } from '../utils/attendanceRecords';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);

const Attendance: React.FC = () => {
  const { db, updateLocalState, updateAttendanceLocal, currentSchool, currentUser } = useAppContext();
  const { t } = useI18n();

  const today = getAfricaDoualaDateKey();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [target, setTarget] = useState<'students' | 'staff'>('students');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');

  // Reason prompt state
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [pendingReasonContext, setPendingReasonContext] = useState<{id: string, isStaff: boolean, status: AttendanceStatus}>({id: '', isStaff: false, status: 'left_early'});
  const [reasonText, setReasonText] = useState('');

  // History state
  const [historyPersonId, setHistoryPersonId] = useState<string|null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const deduplicatedAttendance = useMemo(
    () => deduplicateAttendanceRecords(db.attendance),
    [db.attendance],
  );
  const allowedClassIds = useMemo(() => {
    if (!currentUser || currentUser.role !== 'teacher') return null;
    const activeYearId = currentSchool?.activeAcademicYearId;
    return new Set((db.teacherAssignmentSlots || [])
      .filter(slot => slot.isActive === true
        && slot.schoolId === currentSchool?.id
        && slot.academicYearId === activeYearId
        )
      .map(slot => slot.classId));
  }, [currentSchool?.activeAcademicYearId, currentSchool?.id, currentUser, db.teacherAssignmentSlots]);
  const availableClasses = useMemo(
    () => db.classes.filter(row => !allowedClassIds || allowedClassIds.has(row.id)),
    [allowedClassIds, db.classes],
  );

  if (!currentUser || ![...MANAGER_ROLES, 'teacher'].includes(currentUser.role)) return null;

  const students = db.students.filter(s => {
    const matchSection = sectionFilter === 'all' || s.section === sectionFilter;
    const matchClass = classFilter === 'all' || s.classId === classFilter;
    const authorizedClass = !allowedClassIds || Boolean(s.classId && allowedClassIds.has(s.classId));
    return matchSection && matchClass && authorizedClass;
  });
  const staff = db.staff;

  const withSaving = async (id: string, operation: () => Promise<void>) => {
    setSavingIds(previous => new Set(previous).add(id));
    setSaveError('');
    setSaveMessage('');
    try {
      await operation();
      setSaveMessage('Présence enregistrée.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Impossible d'enregistrer la présence.");
      throw error;
    } finally {
      setSavingIds(previous => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleStudentAttendance = async (studentId: string, status: AttendanceStatus, reason?: string) => {
    await withSaving(studentId, async () => {
      const response = await recordStudentAttendance({ studentId, date, status, note: reason });
      updateAttendanceLocal(response.attendance);
    });
  };

  const toggleStaffAttendance = async (staffId: string, status: AttendanceStatus, reason?: string) => {
    if (!currentSchool?.id) throw new Error('École active introuvable.');
    await withSaving(`staff:${staffId}`, async () => {
      const id = `staff_${encodeURIComponent(currentSchool.id)}_${date}_${encodeURIComponent(staffId)}`;
      const record: StaffAttendance = { id, schoolId: currentSchool.id, staffId, date, status, present: status === 'present' || status === 'late', reason };
      await setDoc(doc(firestore, 'staffAttendance', id), { ...record, updatedAt: serverTimestamp() }, { merge: true });
      updateLocalState(previous => {
        const rows = [...(previous.staffAttendance || [])];
        const index = rows.findIndex(row => row.id === id);
        if (index >= 0) rows[index] = record;
        else rows.push(record);
        return { staffAttendance: rows };
      });
    });
  };

  const executeStatusChange = async (id: string, isStaff: boolean, status: AttendanceStatus) => {
    if (status === 'left_early' || status === 'absent') {
      setPendingReasonContext({id, isStaff, status});
      setReasonText('');
      setReasonModalOpen(true);
    } else {
      try {
        if (isStaff) await toggleStaffAttendance(id, status);
        else await toggleStudentAttendance(id, status);
      } catch { /* surfaced through saveError */ }
    }
  };

  const handleReasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (pendingReasonContext.isStaff) {
        await toggleStaffAttendance(pendingReasonContext.id, pendingReasonContext.status, reasonText);
      } else {
        await toggleStudentAttendance(pendingReasonContext.id, pendingReasonContext.status, reasonText);
      }
      setReasonModalOpen(false);
    } catch {
      // The modal stays open and saveError explains the backend refusal.
    }
  };

  const getStudentRecord = (studentId: string) => {
    return deduplicatedAttendance.find(a => a.studentId === studentId && normalizeAttendanceDate(a.date) === date);
  };

  const getStaffRecord = (staffId: string) => {
    return db.staffAttendance?.find(a => a.staffId === staffId && a.date === date);
  };

  const markAllStudents = async (status: 'present'|'absent') => {
    try { await Promise.all(students.map(student => toggleStudentAttendance(student.id, status))); } catch { /* surfaced */ }
  };

  const markAllStaff = async (status: 'present'|'absent') => {
    try { await Promise.all(staff.map(person => toggleStaffAttendance(person.id, status))); } catch { /* surfaced */ }
  };

  const yearNum = parseInt(month.split('-')[0]);
  const monthNum = parseInt(month.split('-')[1]);
  const daysInMonth = new Date(yearNum, monthNum, 0).getDate();
  const daysArray = Array.from({length: daysInMonth}, (_, i) => i + 1);

  const historyPerson = target === 'students' 
    ? db.students.find(s => s.id === historyPersonId)
    : db.staff.find(s => s.id === historyPersonId);
    
  let historyRecords: (AttendanceRecord | StaffAttendance)[] = [];
  if (historyPerson) {
    if (target === 'students') {
      historyRecords = deduplicatedAttendance.filter(a => a.studentId === historyPerson.id && (a.status !== 'present' || a.reason));
    } else {
      historyRecords = (db.staffAttendance || []).filter(a => a.staffId === historyPerson.id && (a.status !== 'present' || a.reason));
    }
    historyRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  const getStatusLabel = (status: string | undefined, present: boolean) => {
    if (status === 'absent' || (!status && !present)) return 'Absent';
    if (status === 'late') return 'En Retard';
    if (status === 'left_early') return 'Sortie Avant Heure';
    return 'Présent';
  };

  return (
    <div className="page-container" id="attendance-page">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 2rem; background: #fff !important; }
            .no-print { display: none !important; }
            .sidebar { display: none !important; }
            .card { border: none !important; box-shadow: none !important; }
            .print-area-header { display: block !important; }
          }
        `}
      </style>
      <div className="page-header no-print">
        <h1>{t('attendance', 'Présences')}</h1>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={18} /> Imprimer le rapport
          </button>
          <select value={target} onChange={e => {setTarget(e.target.value as 'students' | 'staff'); setClassFilter('all');}}>
            <option value="students">Élèves</option>
            {MANAGER_ROLES.has(currentUser.role) && <option value="staff">Personnel</option>}
          </select>
          <div style={{ display: 'flex', background: 'var(--bg-color)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
             <button title="Vue Journalière" onClick={() => setViewMode('daily')} style={{ borderRadius: 0, padding: '0.5rem 1rem', background: viewMode === 'daily' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'daily' ? '#fff' : 'inherit', border: 'none' }}>Quotidien</button>
             <button title="Vue Mensuelle" onClick={() => setViewMode('monthly')} style={{ borderRadius: 0, padding: '0.5rem 1rem', background: viewMode === 'monthly' ? 'var(--primary-color)' : 'transparent', color: viewMode === 'monthly' ? '#fff' : 'inherit', border: 'none' }}><Calendar size={18} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />Mensuel</button>
          </div>
        </div>
      </div>

      {saveError && <p role="alert" style={{ color: 'var(--danger)', marginTop: 0 }}>{saveError}</p>}
      {saveMessage && !saveError && <p role="status" style={{ color: 'var(--success)', marginTop: 0 }}>{saveMessage}</p>}

      {viewMode === 'daily' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              {target === 'students' && (
                <>
                  <select value={sectionFilter} onChange={e => {setSectionFilter(e.target.value); setClassFilter('all');}}>
                    <option value="all">Toutes les sections</option>
                    <option value="francophone">Francophone</option>
                    <option value="anglophone">Anglophone</option>
                  </select>
                  <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                    <option value="all">Toutes les classes</option>
                    {sortClasses(availableClasses).filter(c => sectionFilter === 'all' || c.type === sectionFilter).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button disabled={savingIds.size > 0} className="secondary" onClick={() => target === 'students' ? markAllStudents('present') : markAllStaff('present')} style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>
                ✓ Tous présents
              </button>
              <button disabled={savingIds.size > 0} className="secondary" onClick={() => target === 'students' ? markAllStudents('absent') : markAllStaff('absent')} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                ✕ Tous absents
              </button>
            </div>
          </div>

          <div className="card print-area" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '2rem 2rem 0 2rem', display: 'none' }} className="print-area-header">
               <SchoolDocumentHeader school={currentSchool} documentTitle={`Rapport de Présences (${new Date(date).toLocaleDateString('fr-FR')})`} />
               <p><strong>Cible :</strong> {target === 'students' ? 'Élèves' : 'Personnel'} | <strong>Classe :</strong> {target === 'students' && classFilter !== 'all' ? db.classes.find(c => c.id === classFilter)?.name : 'Toutes'}</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>{target === 'students' ? 'Élève' : 'Membre du personnel'}</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>{target === 'students' ? 'Classe (Section)' : 'Rôle'}</th>
                  <th style={{ padding: '1rem', textAlign: 'left' }}>Motif (si applicable)</th>
                  <th style={{ padding: '1rem', textAlign: 'right' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {target === 'students' ? (
                  students.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun élève trouvé</td></tr>
                  ) : (
                    students.map(s => {
                      const record = getStudentRecord(s.id);
                      const currentStatus = record?.status || (record?.present ? 'present' : (record?.present === false ? 'absent' : null));
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer', color: 'var(--primary-color)' }} onClick={() => setHistoryPersonId(s.id)}>
                            {s.name} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>(Historique)</span>
                          </td>
                          <td style={{ padding: '1rem', textTransform: 'capitalize' }}>{db.classes.find(c => c.id === s.classId)?.name || s.section}</td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{record?.reason || '-'}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button disabled={savingIds.has(s.id)} aria-label={`Marquer ${s.name} présent`} title="Présent" className={currentStatus === 'present' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'present' ? 'var(--success)' : '' }} onClick={() => executeStatusChange(s.id, false, 'present')}><Check size={16} /></button>
                              <button disabled={savingIds.has(s.id)} aria-label={`Marquer ${s.name} absent`} title="Absent" className={currentStatus === 'absent' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'absent' ? 'var(--danger)' : '' }} onClick={() => executeStatusChange(s.id, false, 'absent')}><X size={16} /></button>
                              <button disabled={savingIds.has(s.id)} aria-label={`Marquer ${s.name} en retard`} title="Retard" className={currentStatus === 'late' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'late' ? 'var(--warning)' : '', color: currentStatus === 'late' ? '#fff' : '' }} onClick={() => executeStatusChange(s.id, false, 'late')}><Clock size={16} /></button>
                              <button disabled={savingIds.has(s.id)} aria-label={`Marquer ${s.name} sorti avant l'heure`} title="Sortie" className={currentStatus === 'left_early' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'left_early' ? 'var(--primary-color)' : '', color: currentStatus === 'left_early' ? '#fff' : '' }} onClick={() => executeStatusChange(s.id, false, 'left_early')}><LogOut size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : (
                  staff.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun membre du personnel</td></tr>
                  ) : (
                    staff.map(s => {
                      const record = getStaffRecord(s.id);
                      const currentStatus = record?.status || (record?.present ? 'present' : (record?.present === false ? 'absent' : null));
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '1rem', fontWeight: 500, cursor: 'pointer', color: 'var(--primary-color)' }} onClick={() => setHistoryPersonId(s.id)}>
                            {s.name} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>(Historique)</span>
                          </td>
                          <td style={{ padding: '1rem', textTransform: 'capitalize' }}>{s.role}</td>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{record?.reason || '-'}</td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button title="Présent" className={currentStatus === 'present' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'present' ? 'var(--success)' : '' }} onClick={() => executeStatusChange(s.id, true, 'present')}><Check size={16} /></button>
                              <button title="Absent" className={currentStatus === 'absent' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'absent' ? 'var(--danger)' : '' }} onClick={() => executeStatusChange(s.id, true, 'absent')}><X size={16} /></button>
                              <button title="Retard" className={currentStatus === 'late' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'late' ? 'var(--warning)' : '', color: currentStatus === 'late' ? '#fff' : '' }} onClick={() => executeStatusChange(s.id, true, 'late')}><Clock size={16} /></button>
                              <button title="Sortie/Permission" className={currentStatus === 'left_early' ? '' : 'secondary'} style={{ padding: '0.25rem 0.5rem', background: currentStatus === 'left_early' ? 'var(--primary-color)' : '', color: currentStatus === 'left_early' ? '#fff' : '' }} onClick={() => executeStatusChange(s.id, true, 'left_early')}><LogOut size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'monthly' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 500 }}>Mois :</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            
            {target === 'students' && (
              <>
                <select value={sectionFilter} onChange={e => {setSectionFilter(e.target.value); setClassFilter('all');}}>
                  <option value="all">Toutes sections</option>
                  <option value="francophone">Francophone</option>
                  <option value="anglophone">Anglophone</option>
                </select>
                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="all">Toutes classes</option>
                  {sortClasses(availableClasses).filter(c => sectionFilter === 'all' || c.type === sectionFilter).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </>
            )}

            <span style={{ marginLeft: 'auto', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              P: Présent | A: Absent | R: Retard | S: Sortie
            </span>
          </div>
          <div className="card print-area" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{ padding: '2rem 2rem 0 2rem', display: 'none' }} className="print-area-header">
               <SchoolDocumentHeader school={currentSchool} documentTitle={`Rapport Mensuel (${month})`} />
               <p><strong>Cible :</strong> {target === 'students' ? 'Élèves' : 'Personnel'} | <strong>Classe :</strong> {target === 'students' && classFilter !== 'all' ? db.classes.find(c => c.id === classFilter)?.name : 'Toutes'}</p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  <th style={{ padding: '0.5rem', textAlign: 'left', minWidth: '150px', borderRight: '1px solid var(--border-color)', position: 'sticky', left: 0, background: 'var(--bg-color)' }}>Nom</th>
                  {daysArray.map(d => <th key={d} style={{ padding: '0.5rem', textAlign: 'center', borderRight: '1px solid var(--border-color)', width: '30px' }}>{d}</th>)}
                  <th style={{ padding: '0.5rem', textAlign: 'center', background: '#ffebee' }}>Abs.</th>
                </tr>
              </thead>
              <tbody>
                {(target === 'students' ? students : staff).map(person => {
                  let totalAbsences = 0;
                  return (
                    <tr key={person.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem', borderRight: '1px solid var(--border-color)', position: 'sticky', left: 0, background: '#fff', cursor: 'pointer', color: 'var(--primary-color)' }} onClick={() => setHistoryPersonId(person.id)}>
                        <div style={{ fontWeight: 500 }}>{person.name}</div>
                        {target === 'students' && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {db.classes.find(c => c.id === (person as { classId?: string }).classId)?.name || ''}
                          </div>
                        )}
                      </td>
                      {daysArray.map(d => {
                        const dateStr = `${month}-${d.toString().padStart(2, '0')}`;
                        let isPresent = null;
                        let statusStr = null;
                        
                        if (target === 'students') {
                          const r = deduplicatedAttendance.find(a => a.studentId === person.id && normalizeAttendanceDate(a.date) === dateStr);
                          if (r) { isPresent = r.present; statusStr = r.status; }
                        } else {
                          const r = db.staffAttendance?.find(a => a.staffId === person.id && a.date === dateStr);
                          if (r) { isPresent = r.present; statusStr = r.status; }
                        }

                        if (!statusStr && isPresent !== null) {
                          statusStr = isPresent ? 'present' : 'absent';
                        }

                        if (statusStr === 'absent') totalAbsences++;

                        let cellColor = '';
                        let letter = '-';
                        if (statusStr === 'present') { cellColor = '#e8f5e9'; letter = 'P'; }
                        if (statusStr === 'absent') { cellColor = '#ffebee'; letter = 'A'; }
                        if (statusStr === 'late') { cellColor = 'rgba(245, 158, 11, 0.1)'; letter = 'R'; }
                        if (statusStr === 'left_early') { cellColor = 'rgba(79, 70, 229, 0.1)'; letter = 'S'; }
                        
                        return (
                          <td key={d} style={{ padding: '0.5rem', textAlign: 'center', borderRight: '1px solid var(--border-color)', background: cellColor, fontWeight: statusStr ? 'bold' : 'normal', color: statusStr === 'absent' ? 'var(--danger)' : (statusStr === 'late' ? 'var(--warning)' : (statusStr === 'left_early' ? 'var(--primary-color)' : 'inherit')) }}>
                            {letter}
                          </td>
                        );
                      })}
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 'bold', background: '#ffebee' }}>{totalAbsences}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Exits / Absences Motif Modal */}
      <Modal isOpen={reasonModalOpen} onClose={() => setReasonModalOpen(false)} title="Enregistrer le motif">
        <form onSubmit={handleReasonSubmit}>
          <div className="form-group">
            <label>Motif / Raison (Optionnel)</label>
            <input 
              autoFocus
              placeholder="Ex: Maladie, Rendez-vous familial, Permission..." 
              value={reasonText} 
              onChange={e => setReasonText(e.target.value)} 
            />
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            L'état "<b>{pendingReasonContext.status === 'left_early' ? 'Sortie' : 'Absent'}</b>" sera appliqué à l'enregistrement.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setReasonModalOpen(false)}>Annuler</button>
            <button type="submit" disabled={savingIds.has(pendingReasonContext.isStaff ? `staff:${pendingReasonContext.id}` : pendingReasonContext.id)}>Valider</button>
          </div>
        </form>
      </Modal>

      {/* Person History Modal */}
      <Modal isOpen={!!historyPersonId} onClose={() => setHistoryPersonId(null)} title={`Historique d'Absences & Sorties - ${historyPerson?.name || ''}`}>
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {historyRecords.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun pointage inhabituel enregistré.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Statut</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Motif</th>
                </tr>
              </thead>
              <tbody>
                {historyRecords.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(r.date).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold', color: r.status === 'absent' || (!r.status && !r.present) ? 'var(--danger)' : 'inherit' }}>
                      {getStatusLabel(r.status, r.present)}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{r.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button onClick={() => setHistoryPersonId(null)}>Fermer</button>
        </div>
      </Modal>

    </div>
  );
};

export default Attendance;
