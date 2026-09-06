import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db as firestore, functions } from '../../../db/firebase';
import { useAppContext } from '../../../context/AppContext';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { useScopedResource } from '../hooks/useScopedResource';
import { readBoundedDocuments } from '../services/boundedQuery';

type Row = { id: string; [key: string]: unknown };
type Evidence = { kind: 'grade' | 'observation'; id: string; label: string; date: string; subjectId: string };
const emptyRows: Row[] = [];
const emptyProfile = { observations: emptyRows, grades: emptyRows, remediations: emptyRows };
const dateToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date());
const DraftContext = createContext<{ locked: boolean; ids: string[]; mark: (id: string, dirty: boolean) => void }>({ locked: false, ids: [], mark: () => {} });
const stateLabels: Record<string, string> = { not_observed: 'Non observé', discovering: 'En découverte', developing: 'En cours d’acquisition', acquired: 'Acquis', absent: 'Absent', notEvaluated: 'Non évalué', notSubmitted: 'Non remis', excused: 'Dispensé', proposed: 'Proposée', approved: 'Validée par l’enseignant', completed: 'Réalisée — bilan attendu', reviewed: 'Réévaluation consignée', cancelled: 'Annulée', progress_observed: 'Progrès observé', continue_support: 'Poursuivre l’accompagnement', insufficient_evidence: 'Preuves insuffisantes' };

export default function PedagogyStudentFollowUp() {
  const { db, currentSchool } = useAppContext();
  const [classId, setClassId] = useState('');
  const [drafts, setDrafts] = useState<string[]>([]);
  const mark = useCallback((id: string, dirty: boolean) => setDrafts(current => dirty ? current.includes(id) ? current : [...current, id] : current.filter(value => value !== id)), []);
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId && item.schoolId === currentSchool?.id);
  const classes = (db?.classes || []).filter(item => item.schoolId === currentSchool?.id && item.isActive !== false);
  const classroom = classes.find(item => item.id === classId) || classes[0];
  const teachers = (db?.staff || []).filter(item => item.schoolId === currentSchool?.id && item.role === 'teacher' && item.active !== false).map(item => ({ id: item.id, name: item.name || 'Enseignant' }));
  return <DraftContext.Provider value={{ locked: drafts.length > 0, ids: drafts, mark }}><main className="pedagogy-page"><PedagogyHeader title="Suivi individuel et remédiation" description="Des preuves datées, des actions proposées, des décisions enseignantes reçues. Aucun diagnostic automatique." /><PedagogyNav />
    <label>Classe suivie<select disabled={drafts.length > 0} value={classroom?.id || ''} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option value={item.id} key={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
    {drafts.length > 0 && <p>Enregistrez ou effacez les saisies en cours avant de changer d’élève ou de classe.</p>}
    {currentSchool && year && classroom && <StudentPicker key={`${currentSchool.id}:${year.id}:${classroom.id}`} schoolId={currentSchool.id} academicYearId={year.id} classId={classroom.id} teachers={teachers} />}
  </main></DraftContext.Provider>;
}

function StudentPicker({ schoolId, academicYearId, classId, teachers }: { schoolId: string; academicYearId: string; classId: string; teachers: Array<{ id: string; name: string }> }) {
  const { locked } = useContext(DraftContext);
  const [cursor, setCursor] = useState(''), [studentId, setStudentId] = useState('');
  const load = useCallback(async () => (await getDocs(query(collection(firestore, 'students'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(26)))).docs.map(item => ({ ...item.data(), id: item.id })), [schoolId, academicYearId, classId, cursor]);
  const roster = useScopedResource<Row[]>(JSON.stringify([schoolId, academicYearId, classId, cursor]), emptyRows, load, 'Élèves indisponibles.');
  const page = roster.data.slice(0, 25), student = page.find(item => item.id === studentId) || page[0];
  return <>
    {roster.error && <p role="alert">{roster.error}</p>}
    <label>Élève suivi<select disabled={locked} value={student?.id || ''} onChange={event => setStudentId(event.target.value)}>{page.map(item => <option key={item.id} value={item.id}>{String(item.name || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Élève')}</option>)}</select></label>
    <div className="pedagogy-actions">{cursor && <button disabled={locked} onClick={() => setCursor('')}>Première page</button>}{roster.data.length > 25 && <button disabled={locked} onClick={() => setCursor(page.at(-1)!.id)}>Élèves suivants</button>}</div>
    {student && <StudentProfile key={student.id} schoolId={schoolId} academicYearId={academicYearId} classId={classId} studentId={student.id} teachers={teachers} />}
  </>;
}

function StudentProfile({ schoolId, academicYearId, classId, studentId, teachers }: { schoolId: string; academicYearId: string; classId: string; studentId: string; teachers: Array<{ id: string; name: string }> }) {
  const load = useCallback(async () => {
    const read = (name: string) => readBoundedDocuments<Row>(query(collection(firestore, name), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), where('studentId', '==', studentId)), 1000, name);
    const [observations, grades, remediations] = await Promise.all([read('pedagogyObservations'), read('grades'), read('pedagogyRemediations')]);
    return { observations, grades, remediations };
  }, [schoolId, academicYearId, classId, studentId]);
  const resource = useScopedResource(JSON.stringify([schoolId, academicYearId, classId, studentId]), emptyProfile, load, 'Suivi indisponible.');
  const evidence: Evidence[] = [
    ...resource.data.observations.filter(item => !item.supersededBy && item.state !== 'not_observed').map(item => ({ kind: 'observation' as const, id: item.id, date: String(item.date), subjectId: String(item.subjectId), label: `${item.date} · ${item.objective} · ${stateLabels[String(item.state)] || item.state}` })),
    ...resource.data.grades.filter(item => item.resultStatus === 'scored').map(item => ({ kind: 'grade' as const, id: item.id, date: String(item.correctionDate || ''), subjectId: String(item.subjectId), label: `${item.subjectId} · ${item.score}/${item.maxScore} · version ${item.version}` }))
  ];
  return <section className="pedagogy-card">
    <p>Compétences : données insuffisantes en l’absence de rattachement pédagogique explicite. Les notes ci-dessous sont les notes canoniques, pas un registre parallèle. « Acquis » dans une observation décrit cette situation, pas un acquis durable.</p>
    {resource.loading && <p>Chargement du dossier…</p>}{resource.error && <p role="alert">{resource.error}</p>}
    <h2>Preuves et historique d’observation</h2>
    {resource.data.observations.map(item => <p key={item.id}>{String(item.date)} · {String(item.objective)} · {stateLabels[String(item.state)]} · {String(item.comment)}{item.supersededBy ? ' — rectifiée, exclue des preuves courantes' : ''}</p>)}
    {resource.data.grades.map(item => <p key={item.id}>{String(item.subjectId)} · {item.resultStatus === 'scored' ? `${item.score}/${item.maxScore}` : stateLabels[String(item.resultStatus)] || 'Statut non calculable'} · version {String(item.version)}</p>)}
    {!resource.loading && !resource.error && !resource.data.observations.length && !resource.data.grades.length && <p>Aucune preuve saisie. Ce n’est pas un résultat nul.</p>}
    {!resource.loading && !resource.error && <RemediationForm schoolId={schoolId} evidence={evidence} teachers={teachers} onSaved={resource.refresh} />}
    <h2>Actions d’accompagnement</h2>
    {resource.data.remediations.map(item => <article className="pedagogy-template-section" key={item.id}><h3>{String(item.proposedActivity)}</h3><p>{String(item.reason)} · Échéance : {String(item.dueDate)} · {stateLabels[String(item.status)]}</p>
      {['approval', 'completion', 'review', 'cancellation'].map(key => { const declaration = item[key] as Record<string, unknown> | undefined; return declaration && <p key={key}>{String(declaration.date)} · {String(declaration.note)} {declaration.outcome ? `· ${stateLabels[String(declaration.outcome)]}` : ''}</p>; })}
      {!['reviewed', 'cancelled'].includes(String(item.status)) && <RemediationForm key={`${item.id}:${item.version}`} schoolId={schoolId} current={item} evidence={evidence} teachers={teachers} onSaved={resource.refresh} />}
    </article>)}
  </section>;
}

function RemediationForm({ schoolId, evidence, teachers, current, onSaved }: { schoolId: string; evidence: Evidence[]; teachers: Array<{ id: string; name: string }>; current?: Row; onSaved: () => Promise<void> }) {
  const [sourceKey, setSourceKey] = useState(''), [activity, setActivity] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(dateToday()), [teacherId, setTeacherId] = useState(''), [received, setReceived] = useState(false), [outcome, setOutcome] = useState('insufficient_evidence'), [cancel, setCancel] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [uncertain, setUncertain] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null), saving = useRef(false);
  const { mark, ids } = useContext(DraftContext);
  const formId = String(current?.id || 'new'), initialDate = useRef(dateToday());
  const anotherDraft = ids.some(id => id !== formId);
  const dirty = Boolean(activity || note || sourceKey || teacherId || received || cancel || busy || uncertain || date !== initialDate.current);
  useEffect(() => { mark(formId, dirty); return () => mark(formId, false); }, [formId, dirty, mark]);
  const clear = () => { setActivity(''); setNote(''); setSourceKey(''); setTeacherId(''); setReceived(false); setCancel(false); setDate(initialDate.current); };
  const action = !current ? 'CREATE' : cancel ? 'CANCEL' : current.status === 'proposed' ? 'APPROVE' : current.status === 'approved' ? 'COMPLETE' : 'REVIEW';
  const selected = evidence.find(item => `${item.kind}:${item.id}` === sourceKey);
  const save = async () => {
    if (saving.current || anotherDraft) return;
    const payload = pending.current || { schoolId, action, requestId: crypto.randomUUID(), ...(current ? { remediationId: current.id, expectedVersion: current.version, teacherStaffId: teacherId, declarationReceived: received, date, note, ...(action === 'REVIEW' ? { evidenceKind: selected?.kind, evidenceId: selected?.id, outcome } : {}) } : { sourceKind: selected?.kind, sourceId: selected?.id, activity, reason: note, dueDate: date }) };
    pending.current = payload; saving.current = true; setBusy(true);
    try { await httpsCallable(functions, 'managePedagogyRemediation')(payload); pending.current = null; setUncertain(false); setMessage('Action enregistrée avec son historique.'); clear(); await onSaved(); }
    catch (error) {
      const code = (error as { code?: string }).code || '';
      if (['functions/invalid-argument', 'functions/failed-precondition', 'functions/permission-denied', 'functions/aborted', 'functions/already-exists', 'functions/unauthenticated'].includes(code)) { pending.current = null; setUncertain(false); } else setUncertain(true);
      setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé.');
    } finally { saving.current = false; setBusy(false); }
  };
  return <details open={Boolean(current)}><summary>{current ? 'Consigner la suite reçue de l’enseignant' : 'Proposer une activité ciblée'}</summary>
    {message && <p role="status">{message}</p>}
    <fieldset disabled={busy || uncertain || anotherDraft}>
      {(!current || action === 'REVIEW') && <label>{current ? 'Nouvelle preuve après réalisation' : 'Preuve initiale'}<select value={sourceKey} onChange={event => { setSourceKey(event.target.value); setReceived(false); }}><option value="">Sélectionner une preuve</option>{evidence.filter(item => !current || item.subjectId === current.subjectId).map(item => <option key={`${item.kind}:${item.id}`} value={`${item.kind}:${item.id}`}>{item.label}</option>)}</select></label>}
      {!current && <label>Activité proposée<textarea maxLength={2000} value={activity} onChange={event => setActivity(event.target.value)} /></label>}
      <label>{current ? 'Compte rendu reçu de l’enseignant' : 'Motif contextualisé, sans diagnostic'}<textarea maxLength={2000} value={note} onChange={event => { setNote(event.target.value); setReceived(false); }} /></label>
      <label>{current ? 'Date de la décision ou réalisation' : 'Échéance proposée'}<input type="date" value={date} onChange={event => { setDate(event.target.value); setReceived(false); }} /></label>
      {current && <><label>Enseignant déclarant<select value={teacherId} onChange={event => { setTeacherId(event.target.value); setReceived(false); }}><option value="">Sélectionner</option>{teachers.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        {['proposed', 'approved'].includes(String(current.status)) && <label><input type="checkbox" checked={cancel} onChange={event => { setCancel(event.target.checked); setReceived(false); }} /> Consigner une annulation motivée</label>}
        {action === 'REVIEW' && <label>Conclusion enseignante<select value={outcome} onChange={event => { setOutcome(event.target.value); setReceived(false); }}><option value="insufficient_evidence">Preuves insuffisantes</option><option value="progress_observed">Progrès observé</option><option value="continue_support">Poursuivre l’accompagnement</option></select></label>}
        <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> J’ai reçu cette déclaration de l’enseignant ; je ne la déduis pas des notes.</label></>}
    </fieldset>
    {uncertain && <p>Réponse incertaine : reprendre enverra exactement la même demande, sans créer de doublon.</p>}
    {dirty && !busy && !uncertain && <button onClick={clear}>Effacer la saisie non enregistrée</button>}
    <button disabled={busy || !uncertain && (!note || (!current && (!selected || !activity)) || Boolean(current && (!teacherId || !received || action === 'REVIEW' && !selected)))} onClick={() => void save()}>{uncertain ? 'Reprendre la même demande' : !current ? 'Enregistrer la proposition' : action === 'APPROVE' ? 'Consigner l’accord enseignant' : action === 'COMPLETE' ? 'Consigner la réalisation' : action === 'CANCEL' ? 'Consigner l’annulation' : 'Consigner la réévaluation'}</button>
  </details>;
}
