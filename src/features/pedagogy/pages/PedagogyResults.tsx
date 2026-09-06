import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db as firestore, functions } from '../../../db/firebase';
import { useAppContext } from '../../../context/AppContext';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { useScopedResource } from '../hooks/useScopedResource';
import { readBoundedDocuments } from '../services/boundedQuery';
import { loadWeeklyAssessments } from '../services/pedagogyService';
import type { WeeklyAssessment } from '../types';

interface ResultEvaluation { id: string; schoolId: string; academicYearId: string; classId: string; periodId: string; title: string; maxScore: number; date: string; status: string; version: number; teacherStaffId: string; pedagogyPublicationId?: string }
interface Pupil { id: string; name: string }
type ResultStatus = 'scored' | 'absent' | 'excused' | 'notSubmitted' | 'notEvaluated';
interface Entry { resultStatus: ResultStatus | ''; score: string; comment: string }
interface RecordedGrade { studentId: string; resultStatus: ResultStatus; score?: number; comment?: string; version: number }
const emptyEvaluations: ResultEvaluation[] = [];
const emptyAssessments: WeeklyAssessment[] = [];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date());

export default function PedagogyResults() {
  const { db, currentSchool } = useAppContext();
  const [yearId, setYearId] = useState(''), [classId, setClassId] = useState(''), [periodId, setPeriodId] = useState(''), [dirty, setDirty] = useState(false);
  const years = (db?.academicYears || []).filter(item => item.schoolId === currentSchool?.id);
  const year = years.find(item => item.id === yearId) || years.find(item => item.id === currentSchool?.activeAcademicYearId);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.schoolId === currentSchool?.id && item.isActive !== false), [db?.classes, currentSchool?.id]);
  const classroom = classes.find(item => item.id === classId) || classes[0];
  const periods = (db?.periods || []).filter(item => item.schoolId === currentSchool?.id && item.academicYearId === year?.id);
  const period = periods.find(item => item.id === periodId) || periods.find(item => item.status === 'open') || periods[0];
  return <main className="pedagogy-page">
    <PedagogyHeader title="Résultats et suivi" description="La secrétaire transcrit les corrections reçues. Les notes restent dans le registre existant ; aucun résultat n’est déduit d’une absence." /><PedagogyNav />
    <fieldset className="pedagogy-toolbar" disabled={dirty}>
      <label>Année<select value={year?.id || ''} onChange={event => setYearId(event.target.value)}>{years.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Classe<select value={classroom?.id || ''} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
      <label>Période<select value={period?.id || ''} onChange={event => setPeriodId(event.target.value)}>{periods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </fieldset>
    {dirty && <p>Enregistrez ou annulez la saisie en cours avant de changer de périmètre.</p>}
    {currentSchool && year && classroom && period ? <ClassResults key={`${currentSchool.id}:${year.id}:${classroom.id}:${period.id}`} schoolId={currentSchool.id} academicYearId={year.id} classId={classroom.id} periodId={period.id} canRecord={year.status === 'active' && period.status === 'open'} onDirty={setDirty} /> : <p>Une année, une classe et une période configurées sont nécessaires.</p>}
  </main>;
}

function ClassResults({ schoolId, academicYearId, classId, periodId, canRecord, onDirty }: { schoolId: string; academicYearId: string; classId: string; periodId: string; canRecord: boolean; onDirty: (dirty: boolean) => void }) {
  const load = useCallback(async () => (await readBoundedDocuments<ResultEvaluation>(query(collection(firestore, 'evaluations'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), where('periodId', '==', periodId)), 100, 'Évaluations')).filter(item => item.pedagogyPublicationId), [schoolId, academicYearId, classId, periodId]);
  const resource = useScopedResource(JSON.stringify([schoolId, academicYearId, classId, periodId]), emptyEvaluations, load, 'Résultats indisponibles.');
  const [selectedId, setSelectedId] = useState(''), [dirty, setDirty] = useState(false), [transferring, setTransferring] = useState(false);
  const evaluation = resource.data.find(item => item.id === selectedId) || resource.data[0];
  const changeDirty = useCallback((value: boolean) => { setDirty(value); onDirty(value); }, [onDirty]);
  const changeTransferBusy = useCallback((value: boolean) => { setTransferring(value); onDirty(value); }, [onDirty]);
  return <>
    {canRecord && !dirty && <TransferAssessment schoolId={schoolId} academicYearId={academicYearId} classId={classId} periodId={periodId} onTransferred={resource.refresh} onBusy={changeTransferBusy} />}
    {resource.error && <p role="alert">{resource.error}</p>}
    <section className="pedagogy-card">
      <h2>Épreuves transférées vers la notation</h2>
      <label>Épreuve par matière<select disabled={dirty || transferring} value={evaluation?.id || ''} onChange={event => setSelectedId(event.target.value)}>{resource.data.map(item => <option key={item.id} value={item.id}>{item.title} · {item.date}</option>)}</select></label>
      {!resource.loading && !resource.data.length && <p>Aucune épreuve pédagogique transférée dans cette période.</p>}
      <p>Une note globale ne démontre pas une compétence précise. Sans rattachement à des preuves détaillées : données insuffisantes.</p>
      {evaluation && <ResultRoster key={`${evaluation.id}:${evaluation.version}`} evaluation={evaluation} canRecord={canRecord && !transferring && evaluation.status === 'open'} onDirty={changeDirty} />}
    </section>
  </>;
}

function TransferAssessment({ schoolId, academicYearId, classId, periodId, onTransferred, onBusy }: { schoolId: string; academicYearId: string; classId: string; periodId: string; onTransferred: () => Promise<void>; onBusy: (busy: boolean) => void }) {
  const workspace = usePedagogyWorkspace(schoolId, academicYearId);
  const [weekId, setWeekId] = useState(''), [date, setDate] = useState(today()), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const week = workspace.weeks.find(item => item.id === weekId) || workspace.weeks.find(item => item.weekStartDate <= today() && item.weekEndDate >= today()) || workspace.weeks[0];
  const load = useCallback(async () => week ? (await loadWeeklyAssessments(schoolId, academicYearId, week.id, classId)).filter(item => item.teacherValidated && ['teacher_validated', 'ready_to_print'].includes(item.status)) : [], [schoolId, academicYearId, classId, week]);
  const resource = useScopedResource(week ? JSON.stringify([schoolId, academicYearId, classId, week.id]) : null, emptyAssessments, load, 'Épreuve indisponible.');
  const assessment = resource.data[0], lock = useRef(false);
  const transfer = async () => {
    if (!assessment || !confirmed || lock.current) return;
    lock.current = true; setBusy(true); onBusy(true);
    try {
      await httpsCallable(functions, 'publishPedagogyAssessmentToGrades')({ schoolId, assessmentId: assessment.id, generationVersion: assessment.generationVersion, contentRevision: assessment.contentRevision || 0, sourceChecksum: assessment.sourceChecksum, periodId, date, confirmTransfer: true });
      await onTransferred(); setMessage('Transfert enregistré : une évaluation canonique par matière. Aucun résultat élève n’a été créé.'); setConfirmed(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Transfert non confirmé.'); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  };
  return <section className="pedagogy-card"><h2>Transférer une épreuve validée</h2>
    <p>Le transfert conserve la version, les barèmes et les visas ; il ne publie pas les bulletins et ne signifie pas que l’épreuve a été passée.</p>
    <label>Semaine de l’épreuve<select value={week?.id || ''} onChange={event => { setWeekId(event.target.value); setConfirmed(false); }}>{workspace.weeks.map(item => <option key={item.id} value={item.id}>{item.weekStartDate}</option>)}</select></label>
    <label>Date prévue de l’épreuve<input type="date" value={date} onChange={event => { setDate(event.target.value); setConfirmed(false); }} /></label>
    {assessment ? <p>{assessment.title} · version {assessment.generationVersion}, correction {assessment.contentRevision || 0}</p> : <p>Aucune version validée par toutes les matières dans cette semaine.</p>}
    <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Confirmer le transfert de cette version pour la période sélectionnée</label>
    <button className="pedagogy-button" disabled={!assessment || !confirmed || busy} onClick={() => void transfer()}>Transférer vers la saisie des résultats</button>
    {(message || resource.error || workspace.error) && <p role="status">{message || resource.error || workspace.error}</p>}
  </section>;
}

function ResultRoster({ evaluation, canRecord, onDirty }: { evaluation: ResultEvaluation; canRecord: boolean; onDirty: (dirty: boolean) => void }) {
  const [pupils, setPupils] = useState<Pupil[]>([]), [grades, setGrades] = useState<RecordedGrade[]>([]), [edits, setEdits] = useState<Record<string, Entry>>({});
  const [cursors, setCursors] = useState<Array<QueryDocumentSnapshot | null>>([null]), [next, setNext] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('');
  const [correctionDate, setCorrectionDate] = useState(today()), [received, setReceived] = useState(false), [refreshVersion, setRefreshVersion] = useState(0);
  const pending = useRef<Record<string, unknown> | null>(null), lock = useRef(false);
  const after = cursors[cursors.length - 1];
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const page = await getDocs(query(collection(firestore, 'students'), where('schoolId', '==', evaluation.schoolId), where('academicYearId', '==', evaluation.academicYearId), where('classId', '==', evaluation.classId), orderBy(documentId()), ...(after ? [startAfter(after)] : []), limit(26)));
      const visible = page.docs.slice(0, 25);
      const recorded = visible.length ? await getDocs(query(collection(firestore, 'grades'), where('schoolId', '==', evaluation.schoolId), where('evaluationId', '==', evaluation.id), where('studentId', 'in', visible.map(item => item.id)), limit(26))) : null;
      if (recorded && new Set(recorded.docs.map(item => item.data().studentId)).size !== recorded.size) throw new Error('Plusieurs résultats existent pour un élève : vérification administrative requise.');
      if (!alive) return;
      setPupils(visible.map(item => ({ id: item.id, name: String(item.data().name || item.id) })));
      setGrades(recorded?.docs.map(item => item.data() as RecordedGrade) || []);
      setNext(page.size > 25 ? visible[visible.length - 1] : null); setLoading(false);
    };
    void load().catch(error => { if (alive) { setMessage(error instanceof Error ? error.message : 'Liste indisponible.'); setLoading(false); } });
    return () => { alive = false; };
  }, [evaluation, after, refreshVersion]);
  const change = (pupilId: string, values: Partial<Entry>) => {
    const previous = grades.find(item => item.studentId === pupilId);
    setEdits(current => ({ ...current, [pupilId]: { ...(current[pupilId] || { resultStatus: previous?.resultStatus || '', score: previous?.score === undefined ? '' : String(previous.score), comment: previous?.comment || '' }), ...values } }));
    setReceived(false); onDirty(true);
  };
  const reset = () => { setEdits({}); setReceived(false); onDirty(false); };
  const save = async () => {
    if (lock.current || !received || !canRecord) return;
    lock.current = true; setBusy(true);
    try {
      if (!pending.current) {
        const rows = Object.entries(edits).map(([studentId, entry]) => {
          if (!entry.resultStatus) throw new Error('Choisissez explicitement le statut de chaque résultat saisi.');
          if (entry.resultStatus === 'scored' && (!entry.score.trim() || !Number.isFinite(Number(entry.score)))) throw new Error('Un score explicite est requis ; un champ vide n’est pas zéro.');
          return { studentId, resultStatus: entry.resultStatus, ...(entry.resultStatus === 'scored' ? { score: Number(entry.score) } : {}), comment: entry.comment, expectedVersion: grades.find(item => item.studentId === studentId)?.version || 0 };
        });
        pending.current = { schoolId: evaluation.schoolId, evaluationId: evaluation.id, expectedEvaluationVersion: evaluation.version, teacherStaffId: evaluation.teacherStaffId, correctionDate, correctionReceived: true, requestId: crypto.randomUUID(), rows };
      }
      await httpsCallable(functions, 'recordPedagogyResults')(pending.current);
      pending.current = null; setUncertain(false); reset(); setLoading(true); setRefreshVersion(value => value + 1); setMessage('Résultats enregistrés dans le registre canonique. La publication des bulletins reste une décision de direction.');
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && ['functions/invalid-argument', 'functions/permission-denied', 'functions/unauthenticated', 'functions/failed-precondition', 'functions/aborted', 'functions/already-exists'].includes(code)) pending.current = null;
      setUncertain(Boolean(pending.current)); setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé. Réessayez le même lot ou rechargez pour vérifier.');
    }
    finally { lock.current = false; setBusy(false); }
  };
  const hasEdits = Object.keys(edits).length > 0;
  return <>
    <p>Barème de cette matière : /{evaluation.maxScore}. Enseignant correcteur : celui affecté à cette épreuve. Une absence de ligne reste « Manquant ».</p>
    {message && <p role="status">{message}</p>}
    {uncertain && <p>Réponse incertaine : les données du lot sont conservées. Réessayez ce même lot ou rechargez pour vérifier l’enregistrement.</p>}
    <fieldset disabled={!canRecord || loading || busy || uncertain}>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Élève</th><th>Résultat</th><th>Score</th><th>Commentaire reçu</th></tr></thead><tbody>{pupils.map(pupil => {
        const recorded = grades.find(item => item.studentId === pupil.id), entry = edits[pupil.id];
        const status = entry?.resultStatus || recorded?.resultStatus || '';
        return <tr key={pupil.id}><th scope="row">{pupil.name}</th><td><select aria-label={`Résultat ${pupil.name}`} value={status} onChange={event => change(pupil.id, { resultStatus: event.target.value as ResultStatus })}><option value="" disabled>Manquant — aucune saisie</option><option value="scored">Noté</option><option value="absent">Absent</option><option value="notEvaluated">Non évalué</option><option value="notSubmitted">Non remis</option><option value="excused">Dispensé</option></select></td><td><input aria-label={`Score ${pupil.name}`} type="number" min="0" max={evaluation.maxScore} step="0.01" disabled={status !== 'scored'} value={entry?.score ?? (recorded?.score === undefined ? '' : String(recorded.score))} onChange={event => change(pupil.id, { score: event.target.value })} /></td><td><input aria-label={`Commentaire ${pupil.name}`} maxLength={500} value={entry?.comment ?? recorded?.comment ?? ''} onChange={event => change(pupil.id, { comment: event.target.value })} /></td></tr>;
      })}</tbody></table></div>
      <label>Date de correction<input type="date" value={correctionDate} onChange={event => { setCorrectionDate(event.target.value); setReceived(false); }} /></label>
      <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> Correction de l’enseignant reçue ; je transcris uniquement les résultats indiqués</label>
    </fieldset>
    <button className="pedagogy-button" disabled={!canRecord || !hasEdits || !received || busy || loading} onClick={() => void save()}>{uncertain ? 'Réessayer le même lot' : 'Enregistrer les résultats reçus'}</button>
    {!uncertain && <button className="pedagogy-button pedagogy-button--secondary" disabled={!hasEdits || busy} onClick={reset}>Annuler la saisie non enregistrée</button>}
    <div className="pedagogy-actions"><button disabled={hasEdits || loading || busy || cursors.length < 2} onClick={() => { setLoading(true); setCursors(current => current.slice(0, -1)); }}>Élèves précédents</button><button disabled={hasEdits || loading || busy || !next} onClick={() => { setLoading(true); setCursors(current => [...current, next]); }}>Élèves suivants</button></div>
  </>;
}
