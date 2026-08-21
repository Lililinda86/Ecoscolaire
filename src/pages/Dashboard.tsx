import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { 
  UserPlus, GraduationCap, DollarSign, AlertCircle, 
  CheckCircle2, XCircle, FileText, MessageSquare, Briefcase, PlusCircle,
  Users, Bus, AlertTriangle, Activity
} from 'lucide-react';
import { calculateCollectedPaymentTotal, calculateNetExpenseTotal } from '../utils/expenseLedger';
import { deduplicateAttendanceRecords, getAfricaDoualaDateKey, normalizeAttendanceDate, normalizeAttendanceStatus } from '../utils/attendanceRecords';

const formatReasons = (reasons: string[]) => {
  if (reasons.length <= 2) return reasons.join(' · ');
  return `${reasons.slice(0, 2).join(' · ')} · +${reasons.length - 2}`;
};

const formatLocalDateKey = (date: Date): string | null => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const normalizeDateKey = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const parsed = new Date(trimmed);
    return formatLocalDateKey(parsed);
  }

  if (value instanceof Date) {
    return formatLocalDateKey(value);
  }

  if (value && typeof value === 'object') {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: number;
    };

    if (typeof candidate.toDate === 'function') {
      try {
        return formatLocalDateKey(candidate.toDate());
      } catch {
        return null;
      }
    }

    if (typeof candidate.seconds === 'number') {
      return formatLocalDateKey(new Date(candidate.seconds * 1000));
    }
  }

  return null;
};

const Dashboard: React.FC = () => {
  const { db, isFirestoreConnected, currentUser } = useAppContext();
  const navigate = useNavigate();

  // Vue d'ensemble de l'établissement
  const italoStats = useMemo(() => {
    const students = db?.students ?? [];
    const classes = db?.classes ?? [];
    const attendanceList = deduplicateAttendanceRecords(db?.attendance || []);
    
    const validClassIds = new Set(classes.map(c => c.id).filter(Boolean));
    const classIdToNameMap = new Map(classes.map(c => [c.id, c.name]));

    // 1. Map each studentId to their classId for attendance
    const studentClassMap = new Map<string, string>();
    students.forEach(s => {
      if (s && s.id && s.classId) {
        studentClassMap.set(s.id, s.classId);
      }
    });

    // 2. Gather unique valid dates of attendance per class
    const classDaysMap = new Map<string, Set<string>>();
    attendanceList.forEach(a => {
      if (a && a.studentId && a.date) {
        const norm = normalizeAttendanceDate(a.date);
        if (!norm) return;
        const classId = studentClassMap.get(a.studentId);
        if (!classId) return;

        if (!classDaysMap.has(classId)) {
          classDaysMap.set(classId, new Set());
        }
        classDaysMap.get(classId)!.add(norm);
      }
    });

    const classDaysSorted = new Map<string, string[]>();
    for (const [classId, dateSet] of classDaysMap.entries()) {
      classDaysSorted.set(classId, Array.from(dateSet).sort());
    }

    // 3. Group attendance status by student
    const studentStates = new Map<string, { presentDates: Set<string>; absentDates: Set<string> }>();
    attendanceList.forEach(a => {
      if (a && a.studentId && a.date) {
        const norm = normalizeAttendanceDate(a.date);
        if (!norm) return;

        if (!studentStates.has(a.studentId)) {
          studentStates.set(a.studentId, { presentDates: new Set(), absentDates: new Set() });
        }
        const states = studentStates.get(a.studentId)!;
        const status = normalizeAttendanceStatus(a);
        if (status === 'present' || status === 'late') {
          states.presentDates.add(norm);
          states.absentDates.delete(norm);
        } else if (status === 'absent' || status === 'left_early') {
          if (!states.presentDates.has(norm)) {
            states.absentDates.add(norm);
          }
        }
      }
    });

    let totalStudents = 0;
    let newStudents = 0;
    let returningStudents = 0;
    let transportedStudents = 0;

    let registrationExpectedTotal = 0;
    let registrationPaidTotal = 0;
    
    let tuitionExpectedTotal = 0;
    let tuitionPaidTotal = 0;
    
    let transportPaidTotal = 0;

    let studentsToRemindCount = 0;
    let parentsWithoutPhoneCount = 0;
    let studentsWithoutClassCount = 0;
    let prolongedAbsenceCount = 0;

    const allPriorityActions: Array<{
      studentId: string;
      name: string;
      className: string;
      level: 1 | 2 | 3;
      reasons: string[];
      recommendedAction: string;
      remaining: number;
      prolongedAbsenceDays: number;
    }> = [];

    students.forEach(student => {
      totalStudents++;
      
      if (student.studentStatus === 'nouveau') {
        newStudents++;
      } else if (student.studentStatus === 'ancien') {
        returningStudents++;
      }

      if (student.usesTransport) {
        transportedStudents++;
      }

      const regExpected = student.registrationFeeExpected ?? 15000;
      const regPaid = student.registrationFeePaid ?? 0;
      const regRemaining = Math.max(regExpected - regPaid, 0);

      registrationExpectedTotal += regExpected;
      registrationPaidTotal += regPaid;

      const tuiExpected = (student.tuitionExpected && student.tuitionExpected > 0)
        ? student.tuitionExpected
        : ((student.feeT1 || 0) + (student.feeT2 || 0) + (student.feeT3 || 0));
      const tuiPaid = student.tuitionPaid ?? 0;
      const tuiRemaining = Math.max(tuiExpected - tuiPaid, 0);

      tuitionExpectedTotal += tuiExpected;
      tuitionPaidTotal += tuiPaid;

      const transPaid = Number(student.transportPaid) || 0;
      transportPaidTotal += transPaid;
      
      const transportFeeConfigured = Number(student.transportMonthlyFee) > 0;
      const hasNoTransportPayment = student.usesTransport === true && transportFeeConfigured && transPaid <= 0;

      // 4. Calculate consecutive absences
      let consecutiveAbsenceDays = 0;
      const classId = student.classId;
      if (classId) {
        const sortedDays = classDaysSorted.get(classId);
        const states = studentStates.get(student.id);
        if (sortedDays && sortedDays.length >= 3 && states) {
          for (let i = sortedDays.length - 1; i >= 0; i--) {
            const day = sortedDays[i];
            if (states.absentDates.has(day)) {
              consecutiveAbsenceDays++;
            } else {
              break;
            }
          }
        }
      }
      const hasProlongedAbsence = consecutiveAbsenceDays >= 3;
      if (hasProlongedAbsence) {
        prolongedAbsenceCount++;
      }

      const isClassInvalid = !student.classId || student.classId.trim() === '' || !validClassIds.has(student.classId);
      const isPhoneMissing = !student.parentPhone || student.parentPhone.trim() === '';

      // Debt detail reasons
      const debtReasons: string[] = [];
      let totalDebt = 0;
      if (regRemaining > 0) {
        debtReasons.push('Inscription à régulariser');
        totalDebt += regRemaining;
      }
      if (tuiRemaining > 0) {
        debtReasons.push('Pension à régulariser');
        totalDebt += tuiRemaining;
      }

      const hasDebt = totalDebt > 0;
      if (hasDebt || regRemaining > 0 || tuiRemaining > 0) {
        studentsToRemindCount++;
      }

      if (isClassInvalid) {
        studentsWithoutClassCount++;
      }

      if (isPhoneMissing) {
        parentsWithoutPhoneCount++;
      }

      // Group into a single action per student with priority levels
      let level: 1 | 2 | 3 | null = null;
      const studentMotifs: string[] = [];
      let recommendedAction = '';

      if (hasProlongedAbsence) {
        studentMotifs.push('Absence prolongée');
        if (isPhoneMissing) {
          studentMotifs.push('Téléphone manquant');
          level = 1;
          recommendedAction = 'Rechercher un contact et prévenir la direction';
        } else {
          level = 1;
          recommendedAction = 'Contacter la famille';
        }
      }

      if (isClassInvalid) {
        studentMotifs.push(student.classId ? 'Classe invalide' : 'Classe absente');
        if (level === null || level > 2) {
          level = 2;
          recommendedAction = 'Affecter une classe';
        }
      }

      if (hasNoTransportPayment) {
        studentMotifs.push('Paiement transport à vérifier');
        if (level === null || level > 2) {
          level = 2;
          recommendedAction = 'Contacter le responsable financier';
        }
      }

      if (hasDebt) {
        debtReasons.forEach(r => studentMotifs.push(r));
        if (level === null || level > 2) {
          level = 2;
          recommendedAction = 'Contacter le responsable financier';
        }
      }

      if (isPhoneMissing && !hasProlongedAbsence) {
        studentMotifs.push('Téléphone parent manquant');
        if (level === null || level > 3) {
          level = 3;
          recommendedAction = 'Compléter les coordonnées';
        }
      }

      const resolvedClassName = (student.classId && classIdToNameMap.get(student.classId)) || student.rawClassName || 'Non assigné';

      if (level !== null) {
        allPriorityActions.push({
          studentId: student.id,
          name: student.name,
          className: resolvedClassName,
          level,
          reasons: Array.from(new Set(studentMotifs)),
          recommendedAction,
          remaining: totalDebt,
          prolongedAbsenceDays: consecutiveAbsenceDays
        });
      }
    });

    const comparePriorityActions = (a: typeof allPriorityActions[0], b: typeof allPriorityActions[0]) => {
      // 1. Level: 1 (Urgent) before 2 (Haute) before 3 (Normale)
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      // 2. Prolonged absence days (descending)
      if (a.prolongedAbsenceDays !== b.prolongedAbsenceDays) {
        return b.prolongedAbsenceDays - a.prolongedAbsenceDays;
      }
      // 3. Count of reasons (descending)
      if (a.reasons.length !== b.reasons.length) {
        return b.reasons.length - a.reasons.length;
      }
      // 4. Remaining debt (descending)
      if (a.remaining !== b.remaining) {
        return b.remaining - a.remaining;
      }
      // 5. Alphabetical name comparison
      return a.name.localeCompare(b.name);
    };

    const priorityActions = allPriorityActions.sort(comparePriorityActions).slice(0, 10);

    const registrationRemainingTotal = Math.max(registrationExpectedTotal - registrationPaidTotal, 0);
    const tuitionRemainingTotal = Math.max(tuitionExpectedTotal - tuitionPaidTotal, 0);

    return {
      totalStudents, newStudents, returningStudents, transportedStudents,
      registrationExpectedTotal, registrationPaidTotal, registrationRemainingTotal,
      tuitionExpectedTotal, tuitionPaidTotal, tuitionRemainingTotal,
      transportPaidTotal,
      studentsToRemindCount, parentsWithoutPhoneCount, studentsWithoutClassCount, prolongedAbsenceCount,
      priorityActions
    };
  }, [db]);

  // Real data calculations in local timezone format (YYYY-MM-DD)
  const todayStr = useMemo(() => getAfricaDoualaDateKey(), []);

  const currentMonthPrefix = useMemo(() => {
    return todayStr.slice(0, 7); // YYYY-MM
  }, [todayStr]);

  const todayStats = useMemo(() => {
    const attendanceList = deduplicateAttendanceRecords(db?.attendance || []);
    const staffAttendanceList = db?.staffAttendance || [];
    const paymentsList = db?.payments || [];

    const todayAttendance = attendanceList.filter(a => a && normalizeAttendanceDate(a.date) === todayStr);
    const presentStudents = todayAttendance.filter(a => normalizeAttendanceStatus(a) === 'present').length;
    const absentStudents = todayAttendance.filter(a => normalizeAttendanceStatus(a) === 'absent').length;
    const lateStudents = todayAttendance.filter(a => normalizeAttendanceStatus(a) === 'late').length;

    const presentStaff = staffAttendanceList.filter(sa => sa && normalizeDateKey(sa.date) === todayStr && sa.present === true).length;

    const todayPayments = paymentsList
      .filter(p => p && normalizeDateKey(p.date) === todayStr)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return {
      presentStudents,
      absentStudents,
      lateStudents,
      presentStaff,
      todayPayments,
      pendingNotifications: 0
    };
  }, [db?.attendance, db?.staffAttendance, db?.payments, todayStr]);

  const monthStats = useMemo(() => {
    const paymentsList = db?.payments || [];
    const expensesList = db?.expenses || [];
    const fuelExpensesList = db?.fuelExpenses || [];
    const maintenancesList = db?.maintenances || [];

    const revenues = calculateCollectedPaymentTotal(paymentsList
      .filter(p => p && normalizeDateKey(p.date)?.startsWith(currentMonthPrefix) === true));

    const exp = calculateNetExpenseTotal(expensesList
      .filter(e => e && normalizeDateKey(e.date)?.startsWith(currentMonthPrefix) === true));

    const fuel = fuelExpensesList
      .filter(fe => fe && normalizeDateKey(fe.date)?.startsWith(currentMonthPrefix) === true)
      .reduce((sum, fe) => sum + (Number(fe.amount) || 0), 0);

    const maint = maintenancesList
      .filter(m => m && normalizeDateKey(m.date)?.startsWith(currentMonthPrefix) === true)
      .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

    const expenses = exp + fuel + maint;
    const balance = revenues - expenses;

    const paymentCount = paymentsList.filter(
      p => p && normalizeDateKey(p.date)?.startsWith(currentMonthPrefix) === true
    ).length;

    return {
      revenues,
      expenses,
      balance,
      paymentCount
    };
  }, [db?.payments, db?.expenses, db?.fuelExpenses, db?.maintenances, currentMonthPrefix]);

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher', 'boardViewer'].includes(currentUser.role)) return null;

  if (!db) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }} data-testid="dashboard-page">
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-color)', margin: 0 }}>
            {db.school?.name || 'Tableau de bord'}
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
            {db.school?.academicYear ? `Année académique ${db.school.academicYear}` : 'Année scolaire non définie'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isFirestoreConnected ? 'var(--secondary-color)' : '#fee2e2', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600, color: isFirestoreConnected ? 'var(--text-color)' : '#991b1b' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: isFirestoreConnected ? 'var(--success)' : 'var(--danger)' }} />
            {isFirestoreConnected ? 'Système en ligne' : 'Mode hors-ligne'}
          </div>
        </div>
      </div>

      {/* Actions Rapides */}
      <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(to right, #4f46e5, #3b82f6)', color: 'white', border: 'none' }}>
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, marginBottom: '1.5rem', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlusCircle size={20} /> Actions Rapides
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/students')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <UserPlus size={18} /> Ajouter un élève
          </button>
          <button onClick={() => navigate('/staff')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <Briefcase size={18} /> Ajouter un enseignant
          </button>
          <button onClick={() => navigate('/payments')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <DollarSign size={18} /> Enregistrer un paiement
          </button>
          <button onClick={() => navigate('/grades')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <FileText size={18} /> Générer un bulletin
          </button>
          <button onClick={() => navigate('/classes')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <GraduationCap size={18} /> Créer une classe
          </button>
          <button onClick={() => navigate('/communication')} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
            <MessageSquare size={18} /> Envoyer WhatsApp
          </button>
        </div>
      </div>

      {/* Suivi d'Activité */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Activity size={24} color="var(--primary-color)" /> Suivi de l'établissement {db.school?.academicYear ? `- ${db.school.academicYear}` : ''}
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          {/* Carte 1 - Inscriptions */}
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} /> Inscriptions
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Total élèves</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{italoStats.totalStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Nouveaux</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>{italoStats.newStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Anciens</span>
              <span style={{ fontWeight: 600, color: '#3b82f6' }}>{italoStats.returningStudents}</span>
            </div>
          </div>

          {/* Carte 2 - Paiements */}
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={18} /> Paiements
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Inscription (Enc. / Att.)</span>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{italoStats.registrationPaidTotal.toLocaleString()} / {italoStats.registrationExpectedTotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Pension (Enc. / Att.)</span>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>{italoStats.tuitionPaidTotal.toLocaleString()} / {italoStats.tuitionExpectedTotal.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Reste total</span>
              <span style={{ fontWeight: 700, color: '#ef4444' }}>{(italoStats.registrationRemainingTotal + italoStats.tuitionRemainingTotal).toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Carte 3 - Transport */}
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Bus size={18} /> Transport
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Élèves transportés</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{italoStats.transportedStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Transport encaissé</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>{italoStats.transportPaidTotal.toLocaleString()} FCFA</span>
            </div>
          </div>

          {/* Carte 4 - Relances */}
          <div className="card" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#9f1239', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} /> Relances
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#be123c' }}>Élèves à relancer</span>
              <span style={{ fontWeight: 700, color: '#9f1239' }}>{italoStats.studentsToRemindCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#be123c' }}>Parents sans téléphone</span>
              <span style={{ fontWeight: 700, color: '#9f1239' }}>{italoStats.parentsWithoutPhoneCount}</span>
            </div>
          </div>
        </div>

        {/* Tableau Actions prioritaires */}
        <div className="card" style={{ background: 'white', padding: '1rem', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: '#334155' }}>Actions prioritaires (Top 10)</h3>
          {italoStats.priorityActions.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '0.5rem' }}>Élève</th>
                  <th style={{ padding: '0.5rem' }}>Classe</th>
                  <th style={{ padding: '0.5rem' }}>Priorité</th>
                  <th style={{ padding: '0.5rem' }}>Motif</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Reste (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                {italoStats.priorityActions.map((action, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 500, color: '#0f172a' }}>{action.name}</td>
                    <td style={{ padding: '0.5rem', color: '#475569' }}>{action.className}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600, color: action.level === 1 ? '#dc2626' : action.level === 2 ? '#d97706' : '#2563eb' }}>
                      {action.level === 1 ? 'Urgent' : action.level === 2 ? 'Haute' : 'Normale'}
                    </td>
                    <td style={{ padding: '0.5rem', color: action.level === 1 ? '#dc2626' : action.level === 2 ? '#d97706' : '#475569' }}>
                      {formatReasons(action.reasons)}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: action.remaining > 0 ? '#ef4444' : '#94a3b8' }}>
                      {action.remaining > 0 ? action.remaining.toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem', marginBottom: '0.25rem' }}>Aucune action prioritaire</div>
              <div style={{ fontSize: '0.875rem' }}>Aucun dossier nécessitant une intervention immédiate</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* SECTION AUJOURD'HUI */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="var(--primary-color)" /> Aujourd'hui
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={16} color="var(--success)" /> Élèves présents
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.presentStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <XCircle size={16} color="var(--danger)" /> Élèves absents
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.absentStudents}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <Briefcase size={16} color="var(--primary-color)" /> Personnel présent
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{todayStats.presentStaff}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <DollarSign size={16} color="var(--success)" /> Recettes du jour
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{todayStats.todayPayments.toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* SECTION CE MOIS */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <DollarSign size={18} color="var(--success)" /> Ce Mois
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Revenus</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--success)' }}>{monthStats.revenues.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Dépenses</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--danger)' }}>{monthStats.expenses.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Solde Net</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--primary-color)' }}>{monthStats.balance.toLocaleString()} FCFA</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <FileText size={16} color="var(--accent-color)" /> Paiements enregistrés
              </div>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{monthStats.paymentCount}</span>
            </div>
          </div>
        </div>

        {/* SECTION ALERTES */}
        <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} color="var(--warning)" /> Alertes & Tâches
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Alerte 1: Élèves à relancer */}
            {italoStats.studentsToRemindCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fffbeb', padding: '0.75rem', borderRadius: '8px' }}>
                <DollarSign size={16} color="#d97706" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#92400e', fontSize: '0.875rem' }}>{italoStats.studentsToRemindCount} élèves à relancer</div>
                  <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Paiements ou dossiers à régulariser</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#166534', fontSize: '0.875rem' }}>Aucun élève à relancer</div>
                  <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Tous les comptes sont en règle</div>
                </div>
              </div>
            )}

            {/* Alerte 2: Parents sans téléphone */}
            {italoStats.parentsWithoutPhoneCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fff1f2', padding: '0.75rem', borderRadius: '8px' }}>
                <UserCircle2 size={16} color="#dc2626" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#991b1b', fontSize: '0.875rem' }}>{italoStats.parentsWithoutPhoneCount} fiches sans téléphone parent</div>
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Coordonnées parentales à compléter</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#166534', fontSize: '0.875rem' }}>Toutes les coordonnées parentales sont renseignées</div>
                  <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Aucun téléphone parent manquant</div>
                </div>
              </div>
            )}

            {/* Alerte 3: Élèves sans classe */}
            {italoStats.studentsWithoutClassCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#eff6ff', padding: '0.75rem', borderRadius: '8px' }}>
                <FileText size={16} color="#2563eb" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.875rem' }}>
                    {italoStats.studentsWithoutClassCount} {italoStats.studentsWithoutClassCount === 1 ? 'élève sans classe valide' : 'élèves sans classe valide'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#1d4ed8' }}>Affectation ou classe à vérifier</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#166534', fontSize: '0.875rem' }}>Tous les élèves sont affectés</div>
                  <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Aucune affectation manquante</div>
                </div>
              </div>
            )}

            {/* Alerte 4: Absences prolongées */}
            {italoStats.prolongedAbsenceCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fff1f2', padding: '0.75rem', borderRadius: '8px' }}>
                <UserCircle2 size={16} color="#dc2626" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#991b1b', fontSize: '0.875rem' }}>
                    {italoStats.prolongedAbsenceCount} {italoStats.prolongedAbsenceCount === 1 ? 'élève en absence prolongée' : 'élèves en absence prolongée'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Absents depuis au moins 3 jours scolaires</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px' }}>
                <CheckCircle2 size={16} color="#16a34a" style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#166534', fontSize: '0.875rem' }}>Aucune absence prolongée</div>
                  <div style={{ fontSize: '0.75rem', color: '#15803d' }}>Aucun élève absent depuis 3 jours scolaires</div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// Mock icon missing from import above
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number | string };
const Calendar: React.FC<IconProps> = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
const UserCircle2: React.FC<IconProps> = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0"></path><circle cx="12" cy="10" r="4"></circle><circle cx="12" cy="12" r="10"></circle></svg>;

export default Dashboard;
