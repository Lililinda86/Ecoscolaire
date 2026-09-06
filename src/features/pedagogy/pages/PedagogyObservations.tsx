import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, documentId, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db as firestore, functions } from '../../../db/firebase';
import { useAppContext } from '../../../context/AppContext';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import type { ObservationState } from '../../../../functions/src/pedagogy/pedagogyPolicy';

const states: Record<ObservationState, string> = { not_observed: 'Non observé', discovering: 'En découverte', developing: 'En cours d’acquisition', acquired: 'Acquis' };
type Student = { id: string; name: string };
export default function PedagogyObservations() {
  const { db, currentSchool } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId);
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const [classId, setClassId] = useState(''), [weekId, setWeekId] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const week = workspace.weeks.find(item => item.id === weekId) || workspace.weeks[0];
  const scopeKey = `${currentSchool?.id}:${year?.id}:${selectedClassId}:${week?.id}`;
  return <main className="pedagogy-page">
    <PedagogyHeader title="Activités et observations" description="Consignez les observations datées transmises par l’enseignant, sans note ni classement préscolaire." /><PedagogyNav />
    <section className="pedagogy-toolbar no-print">
      <label>Classe<select value={selectedClassId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option value={item.id} key={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
      <label>Semaine<select value={week?.id || ''} onChange={event => setWeekId(event.target.value)}>{workspace.weeks.map(item => <option value={item.id} key={item.id}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
    </section>
    {currentSchool && year && week ? <ObservationRoster key={scopeKey} schoolId={currentSchool.id} academicYearId={year.id} classId={selectedClassId} weekStartDate={week.weekStartDate} teachers={(db?.staff || []).filter(item => item.role === 'teacher' && item.active !== false).map(item => ({ id: item.id, name: item.name || 'Enseignant' }))} /> : <p>Choisissez une année et une semaine pédagogique configurées.</p>}
  </main>;
}

function ObservationRoster({ schoolId, academicYearId, classId, weekStartDate, teachers }: { schoolId: string; academicYearId: string; classId: string; weekStartDate: string; teachers: Array<{ id: string; name: string }> }) {
  const preparations = useLessonPreparations(schoolId, academicYearId, weekStartDate, classId);
  const sources = preparations.preparations.filter(item => item.status === 'validated' && ['taught', 'partially_taught'].includes(item.teachingConfirmation?.status || ''));
  const [preparationId, setPreparationId] = useState(''), [teacherStaffId, setTeacherStaffId] = useState('');
  const [objective, setObjective] = useState(''), [date, setDate] = useState(weekStartDate);
  const [students, setStudents] = useState<Student[]>([]), [cursor, setCursor] = useState(''), [hasMore, setHasMore] = useState(false);
  const [rows, setRows] = useState<Record<string, { state: ObservationState; comment: string }>>({});
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [received, setReceived] = useState(false);
  const saving = useRef(false), request = useRef<{ signature: string; id: string } | null>(null);
  const prep = sources.find(item => item.id === preparationId);
  useEffect(() => {
    let alive = true;
    const constraints = [where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(26)];
    void getDocs(query(collection(firestore, 'students'), ...constraints)).then(result => {
      if (!alive) return;
      setStudents(result.docs.slice(0, 25).map(doc => ({ id: doc.id, name: String(doc.data().name || [doc.data().firstName, doc.data().lastName].filter(Boolean).join(' ') || 'Élève sans nom affichable') })));
      setHasMore(result.size > 25);
    }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); });
    return () => { alive = false; };
  }, [schoolId, academicYearId, classId, cursor]);
  const save = async () => {
    if (saving.current || !received || !prep || !teacherStaffId || !Object.keys(rows).length) return;
    const payload = { schoolId, academicYearId, classId, preparationId, teacherStaffId, objective, date, declarationReceived: true, rows: Object.entries(rows).map(([studentId, row]) => ({ studentId, ...row })) };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    saving.current = true; setBusy(true); setMessage('Enregistrement en cours…');
    try {
      await httpsCallable(functions, 'recordPedagogyObservations')({ ...payload, requestId: request.current.id });
      setRows({}); setReceived(false); request.current = null; setMessage('Observations enregistrées avec la provenance de l’enseignant.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Écriture non confirmée. Vous pouvez reprendre la saisie.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="pedagogy-card">
    <p>Une observation décrit une situation. Elle ne suffit pas à conclure à une difficulté durable et ne constitue pas un diagnostic. « Non observé » n’est pas un échec.</p>
    {message && <p role="status" className="pedagogy-alert">{message}</p>}
    <fieldset disabled={busy}>
      <label>Activité enseignée<select value={preparationId} onChange={event => { setPreparationId(event.target.value); setObjective(''); setReceived(false); }}><option value="">Sélectionner un cours confirmé</option>{sources.map(item => <option key={item.id} value={item.id}>{item.subjectName} — {item.lessonTitle}</option>)}</select></label>
      {prep && <details open><summary>Contenu confirmé utilisable</summary><p style={{ whiteSpace: 'pre-wrap' }}>{prep.teachingConfirmation?.status === 'partially_taught' ? prep.teachingConfirmation.excerpts.join('\n') : [prep.reviewData?.lessonTitle, prep.reviewData?.objective, prep.reviewData?.lessonSteps].filter(Boolean).join('\n')}</p></details>}
      <label>Objectif observable, extrait exact du contenu confirmé<textarea value={objective} maxLength={1000} onChange={event => { setObjective(event.target.value); setReceived(false); }} /></label>
      <label>Enseignant déclarant<select value={teacherStaffId} onChange={event => { setTeacherStaffId(event.target.value); setReceived(false); }}><option value="">Sélectionner</option>{teachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
      <label>Date d’observation<input type="date" value={date} onChange={event => { setDate(event.target.value); setReceived(false); }} /></label>
      {students.map(student => <div className="pedagogy-template-section" key={student.id}>
        <label><input type="checkbox" checked={Boolean(rows[student.id])} onChange={event => {
          if (event.target.checked) setRows(current => ({ ...current, [student.id]: { state: 'not_observed', comment: '' } }));
          else setRows(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== student.id)));
          setReceived(false);
        }} /> {student.name}</label>
        {rows[student.id] && <><label>Observation pour {student.name}<select value={rows[student.id].state} onChange={event => { setRows(current => ({ ...current, [student.id]: { ...current[student.id], state: event.target.value as ObservationState } })); setReceived(false); }}>{Object.entries(states).map(([state, label]) => <option key={state} value={state}>{label}</option>)}</select></label><label>Contexte pour {student.name}<textarea value={rows[student.id].comment} maxLength={2000} onChange={event => { setRows(current => ({ ...current, [student.id]: { ...current[student.id], comment: event.target.value } })); setReceived(false); }} /></label></>}
      </div>)}
      {!students.length && <p>Aucun élève rattaché à cette classe et à cette année. Vérifiez les inscriptions existantes.</p>}
      <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} /> Ces observations m’ont été transmises par l’enseignant sélectionné.</label>
      <button className="pedagogy-button" disabled={!received || !prep || !teacherStaffId || !objective || !Object.keys(rows).length} onClick={() => void save()}>Enregistrer les observations</button>
      <div className="pedagogy-actions">{cursor && <button disabled={Object.keys(rows).length > 0} onClick={() => setCursor('')}>Première page</button>}{hasMore && <button disabled={Object.keys(rows).length > 0} onClick={() => setCursor(students.at(-1)!.id)}>Élèves suivants</button>}</div>
    </fieldset>
  </section>;
}
