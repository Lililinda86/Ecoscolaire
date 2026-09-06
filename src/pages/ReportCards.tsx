import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileDown, FileText, Printer, RefreshCw, Send } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import type { ReportCard, ReportCardSnapshot } from '../types';
import { getSchoolReportCards, manageReportCard, ReportCardEngineError, type ReportCardAction } from '../services/reportCardFunctions';
import { downloadReportCardPdf } from '../services/reportCardPdf';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import { getClassOptionLabel } from '../utils/classCatalog';

const MANAGER_ROLES = new Set(['superAdmin', 'owner', 'director']);
const statusLabels: Record<ReportCard['status'], string> = { draft: 'Brouillon', validated: 'Validé', published: 'Publié' };
const subjectStatusLabels: Record<string, string> = {
  VALID: 'Résultat valide',
  NOT_EVALUATED: 'Non évalué',
  NO_CALCULABLE_GRADE: 'Note manquante',
  MISSING_COEFFICIENT: 'Coefficient manquant',
};

const ReportCards: React.FC = () => {
  const { db, currentUser, currentSchool, isSchoolSuspended } = useAppContext();
  const schoolId = currentSchool?.id || currentUser?.schoolId || '';
  const canManage = MANAGER_ROLES.has(currentUser?.role || '');
  const [academicYearId, setAcademicYearId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [reportCards, setReportCards] = useState<ReportCard[]>([]);
  const [directorComment, setDirectorComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadReportCards = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      setReportCards(await getSchoolReportCards(schoolId));
    } catch {
      setError('Impossible de charger les bulletins.');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { void loadReportCards(); }, [loadReportCards]);

  const years = useMemo(() => (db.academicYears || []).filter(year => year.schoolId === schoolId), [db.academicYears, schoolId]);
  const periods = useMemo(() => (db.periods || []).filter(period => period.schoolId === schoolId && period.academicYearId === academicYearId), [db.periods, schoolId, academicYearId]);
  const classes = useMemo(() => (db.classes || []).filter(klass => !klass.schoolId || klass.schoolId === schoolId), [db.classes, schoolId]);
  const students = useMemo(() => (db.students || []).filter(student => student.classId === classId && student.schoolingStatus !== 'inactive'), [db.students, classId]);
  const reportCard = useMemo(() => reportCards.find(value => value.academicYearId === academicYearId
    && value.periodId === periodId && value.classId === classId && value.studentId === studentId),
  [reportCards, academicYearId, periodId, classId, studentId]);
  const publishedProgram = useMemo(() => (db.classPrograms || []).find(program => program.schoolId === schoolId
    && program.academicYearId === academicYearId && program.classId === classId && program.status === 'published'),
  [db.classPrograms, schoolId, academicYearId, classId]);

  useEffect(() => { setPeriodId(''); setClassId(''); setStudentId(''); }, [academicYearId]);
  useEffect(() => { setStudentId(''); }, [classId]);
  useEffect(() => { setDirectorComment(reportCard?.directorComment || ''); }, [reportCard]);

  const snapshot: ReportCardSnapshot | undefined = reportCard?.status === 'published'
    ? reportCard.officialSnapshot || reportCard.snapshot
    : reportCard?.snapshot;
  const noCalculableResult = Boolean(snapshot && snapshot.subjectResults.every(subject => !subject.calculable));
  const configurationMessages = [
    years.length === 0 ? 'Aucune période disponible.' : '',
    academicYearId && periods.length === 0 ? 'Aucune période disponible.' : '',
    academicYearId && classId && !publishedProgram ? 'Programme non publié.' : '',
    noCalculableResult ? 'Aucun résultat admissible.' : '',
  ].filter(Boolean);
  const selectionComplete = Boolean(academicYearId && periodId && classId && studentId);

  const runAction = async (action: ReportCardAction) => {
    if (!schoolId || !selectionComplete || busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'GENERATE_DRAFT') {
        await manageReportCard({ action, schoolId, academicYearId, periodId, classId, studentId, directorComment });
      } else if (reportCard) {
        await manageReportCard({ action, schoolId, reportCardId: reportCard.id, expectedVersion: reportCard.version, directorComment });
      }
      await loadReportCards();
    } catch (reason) {
      const code = reason instanceof ReportCardEngineError ? reason.businessCode : 'INTERNAL_ERROR';
      const safeMessages: Record<string, string> = {
        PROGRAM_NOT_PUBLISHED: 'Programme non publié.',
        TEACHER_ASSIGNMENT_REQUIRED: 'Affectation enseignante active manquante.',
        REPORT_CARD_INCOMPLETE: 'Bulletin non générable : résultats incomplets.',
        SOURCES_CHANGED_REFRESH_REQUIRED: 'Les résultats ont changé. Actualisez explicitement le brouillon.',
        VERSION_CONFLICT: 'Le bulletin a été modifié ailleurs. Rechargez la page.',
      };
      setError(safeMessages[code] || 'Le bulletin ne peut pas être traité dans son état actuel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-cards-page">
      <style>{`
        .report-card-selectors { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; }
        .report-card-selectors label { display:grid; gap:.4rem; font-weight:600; min-width:0; }
        .report-card-selectors select { width:100%; min-width:0; }
        .report-card-actions { display:flex; flex-wrap:wrap; gap:.75rem; align-items:center; }
        .report-card-subject-row { display:grid; grid-template-columns:minmax(150px,2fr) minmax(80px,.7fr) minmax(90px,.8fr) minmax(130px,1fr); gap:.75rem; padding:.8rem; border-bottom:1px solid var(--border-color); align-items:center; }
        .report-card-subject-row.header { font-weight:700; background:#eef2ff; }
        .report-card-status { display:inline-flex; padding:.25rem .6rem; border-radius:999px; background:#e0e7ff; font-weight:700; text-transform:uppercase; font-size:.75rem; }
        .report-card-print { background:#fff; color:#1e293b; max-width:210mm; margin:0 auto; }
        @media (max-width: 900px) { .report-card-selectors { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width: 600px) {
          .report-card-selectors { grid-template-columns:1fr; }
          .report-card-subject-row, .report-card-subject-row.header { grid-template-columns:1fr 1fr; }
          .report-card-subject-row.header { display:none; }
          .report-card-actions button { width:100%; justify-content:center; }
        }
        @media print {
          .sidebar, .topbar, .no-print { display:none !important; }
          .main-content { margin:0 !important; padding:0 !important; }
          .report-card-print { width:182mm; max-width:none; box-shadow:none !important; border:none !important; padding:0 !important; }
          .report-card-subject-row { break-inside:avoid; }
          @page { size:A4 portrait; margin:14mm; }
        }
      `}</style>
      <div className="page-header no-print">
        <div>
          <h1>Bulletins scolaires</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Snapshots officiels reproductibles par année, période, classe et élève.</p>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: '1rem' }}>
        <div className="report-card-selectors">
          <label>Année scolaire
            <select data-testid="report-card-year" value={academicYearId} onChange={event => setAcademicYearId(event.target.value)}>
              <option value="">Sélectionner</option>{years.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
          <label>Période
            <select data-testid="report-card-period" value={periodId} onChange={event => setPeriodId(event.target.value)} disabled={!academicYearId}>
              <option value="">Sélectionner</option>{periods.map(period => <option key={period.id} value={period.id}>{period.name}</option>)}
            </select>
          </label>
          <label>Classe
            <select data-testid="report-card-class" value={classId} onChange={event => setClassId(event.target.value)} disabled={!academicYearId}>
              <option value="">Sélectionner</option>{classes.map(klass => <option key={klass.id} value={klass.id}>{getClassOptionLabel(klass, classes)}</option>)}
            </select>
          </label>
          <label>Élève
            <select data-testid="report-card-student" value={studentId} onChange={event => setStudentId(event.target.value)} disabled={!classId}>
              <option value="">Sélectionner</option>{students.map(student => <option key={student.id} value={student.id}>{student.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {(configurationMessages.length > 0 || !selectionComplete) && (
        <div className="card no-print" data-testid="report-card-configuration-state" style={{ borderLeft: '4px solid #d97706', marginBottom: '1rem' }}>
          <strong>Bulletin non générable.</strong>
          <ul style={{ marginBottom: 0 }}>{configurationMessages.map(message => <li key={message}>{message}</li>)}</ul>
          {!selectionComplete && <p style={{ marginBottom: 0 }}>Sélectionnez explicitement l’année, la période, la classe et l’élève.</p>}
          <small>Aucune période, note, évaluation, affectation ou bulletin n’est créé automatiquement.</small>
        </div>
      )}
      {error && <div className="card no-print" role="alert" style={{ borderLeft: '4px solid #dc2626', marginBottom: '1rem' }}>{error}</div>}

      <div className="card no-print" style={{ marginBottom: '1rem' }}>
        <div className="report-card-actions">
          {!reportCard && canManage && <button data-testid="report-card-generate" disabled={!selectionComplete || !publishedProgram || busy || isSchoolSuspended} onClick={() => void runAction('GENERATE_DRAFT')}><FileText size={18} /> Générer le brouillon</button>}
          {reportCard?.status === 'draft' && canManage && <button data-testid="report-card-refresh" className="secondary" disabled={busy || isSchoolSuspended} onClick={() => void runAction('REFRESH_DRAFT')}><RefreshCw size={18} /> Actualiser explicitement</button>}
          {reportCard?.status === 'draft' && canManage && <button data-testid="report-card-validate" disabled={busy || Boolean(snapshot?.blockingIssues.length) || isSchoolSuspended} onClick={() => void runAction('VALIDATE')}><CheckCircle2 size={18} /> Valider</button>}
          {reportCard?.status === 'validated' && canManage && <button data-testid="report-card-publish" disabled={busy || isSchoolSuspended} onClick={() => void runAction('PUBLISH')}><Send size={18} /> Publier</button>}
          {reportCard?.status === 'published' && <button className="secondary" data-testid="report-card-print" onClick={() => window.print()}><Printer size={18} /> Imprimer</button>}
          {reportCard?.status === 'published' && <button className="secondary" data-testid="report-card-pdf" onClick={() => downloadReportCardPdf(reportCard)}><FileDown size={18} /> Exporter PDF</button>}
          {loading && <span>Chargement…</span>}{busy && <span>Traitement atomique…</span>}
        </div>
        {reportCard && canManage && reportCard.status !== 'published' && (
          <label style={{ display: 'grid', gap: '.4rem', marginTop: '1rem' }}>Commentaire de la direction
            <textarea value={directorComment} maxLength={1000} rows={3} onChange={event => setDirectorComment(event.target.value)} />
          </label>
        )}
      </div>

      {reportCard && snapshot && (
        <article className="card report-card-print" data-testid="report-card-snapshot" style={{ padding: '2rem' }}>
          <SchoolDocumentHeader school={currentSchool} documentTitle="Bulletin scolaire" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', margin: '1rem 0' }}>
            <div><strong>{snapshot.student.name}</strong><br />Classe : {snapshot.class.name}<br />Section : {snapshot.class.section || '-'}</div>
            <div style={{ textAlign: 'right' }}>Année : {snapshot.academicYear.name}<br />Période : {snapshot.period.name}<br /><span className="report-card-status">{statusLabels[reportCard.status]}</span></div>
          </div>
          <div className="report-card-subject-row header"><span>Matière</span><span>Coefficient</span><span>Moyenne /20</span><span>État</span></div>
          {snapshot.subjectResults.map(subject => (
            <div className="report-card-subject-row" key={subject.classSubjectId} data-testid={`report-card-subject-${subject.subjectId}`}>
              <span><strong>{subject.subjectName || subject.subjectId}</strong><br /><small>{subject.subjectCode || '-'}</small></span>
              <span>{subject.coefficient ?? '-'}</span>
              <span>{subject.rawAverage === null ? '-' : subject.rawAverage.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{subjectStatusLabels[subject.status] || subject.status}{subject.absenceCount ? ` · ABSENT ${subject.absenceCount}` : ''}{subject.excusedCount ? ` · EXCUSED ${subject.excusedCount}` : ''}</span>
            </div>
          ))}
          <div style={{ marginTop: '1.5rem', padding: '1rem', border: '2px solid #1e293b' }}>
            <strong>Moyenne générale : {snapshot.overallResult.generalAverage === null ? 'Non calculable' : `${snapshot.overallResult.generalAverage.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / 20`}</strong>
            <p style={{ marginBottom: 0 }}>Rang : différé · Mention : non configurée · Décision de passage : hors périmètre</p>
          </div>
          <div style={{ marginTop: '1.5rem' }}><strong>Commentaire de la direction</strong><p>{snapshot.directorComment || reportCard.directorComment || 'Aucun commentaire.'}</p></div>
          <footer style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span>Révision programme : {snapshot.program.revisionNumber}</span><span>Direction</span></footer>
        </article>
      )}
    </div>
  );
};

export default ReportCards;
