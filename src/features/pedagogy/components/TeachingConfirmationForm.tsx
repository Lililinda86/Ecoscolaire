import { useRef, useState } from 'react';
import type { LessonPreparation, TeachingState } from '../types';
import { recordTeachingConfirmations } from '../services/pedagogyService';

const teachingLabels: Record<TeachingState, string> = {
  unconfirmed: 'Non confirmé', taught: 'Enseigné', partially_taught: 'Partiellement enseigné', postponed: 'Reporté', not_taught: 'Non enseigné'
};
type Declaration = { status: TeachingState; effectiveDate: string; teacherStaffId: string; excerpts: string; note: string };
export function TeachingConfirmationForm({ schoolId, academicYearId, classId, weekId, preparations, teachers, onSaved }: {
  schoolId: string; academicYearId: string; classId: string; weekId: string;
  preparations: LessonPreparation[]; teachers: Array<{ id: string; name?: string }>; onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, Declaration>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [attested, setAttested] = useState(false);
  const submission = useRef<{ signature: string; requestId: string } | null>(null);
  const saving = useRef(false);
  const entries = Object.entries(selected);
  const save = async () => {
    if (saving.current || !attested || entries.length < 1 || entries.length > 25) return;
    const declarations = entries.map(([preparationId, entry]) => ({ ...entry, preparationId, expectedVersion: preparations.find(item => item.id === preparationId)!.version, excerpts: entry.excerpts.split('\n').map(line => line.trim()).filter(Boolean) }));
    const signature = JSON.stringify(declarations);
    if (submission.current?.signature !== signature) submission.current = { signature, requestId: crypto.randomUUID() };
    saving.current = true; setBusy(true); setMessage('Enregistrement en cours…');
    try {
      await recordTeachingConfirmations({ schoolId, academicYearId, classId, weekId, requestId: submission.current.requestId, declarations });
      setSelected({}); setAttested(false); submission.current = null;
      await onSaved(); setMessage('Déclarations enregistrées. La confirmation du cours reste distincte de la réception de la préparation.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé. Réessayez avec la même saisie.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const update = (id: string, value: Partial<Declaration>) => { setSelected(current => ({ ...current, [id]: { ...current[id], ...value } })); setAttested(false); };
  return <section className="pedagogy-card no-print">
    <h2>Enseignements réalisés</h2>
    <p>Enregistrez la déclaration reçue de l’enseignant. Une préparation reçue et vérifiée ne confirme pas que le cours a eu lieu. Sélectionnez jusqu’à 25 cours par enregistrement.</p>
    {message && <p role="status" className="pedagogy-alert">{message}</p>}
    {preparations.map(preparation => <article className="pedagogy-template-section" key={preparation.id}>
      <label><input type="checkbox" disabled={busy || (!selected[preparation.id] && entries.length >= 25)} checked={Boolean(selected[preparation.id])} onChange={event => {
        if (event.target.checked) setSelected(current => ({ ...current, [preparation.id]: { status: 'unconfirmed', effectiveDate: preparation.lessonDate || preparation.weekStartDate, teacherStaffId: preparation.teacherStaffId, excerpts: '', note: '' } }));
        else setSelected(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== preparation.id)));
        setAttested(false);
      }} /> {preparation.subjectName} — {preparation.lessonTitle || 'Leçon à préciser'}</label>
      <p>{teachingLabels[preparation.teachingConfirmation?.status || 'unconfirmed']}{preparation.teachingConfirmation?.effectiveDate ? ` · ${preparation.teachingConfirmation.effectiveDate}` : ''}</p>
      {selected[preparation.id] && <fieldset disabled={busy}>
        <label>Déclaration<select value={selected[preparation.id].status} onChange={event => update(preparation.id, { status: event.target.value as TeachingState })}>{Object.entries(teachingLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Enseignant déclarant<select value={selected[preparation.id].teacherStaffId} onChange={event => update(preparation.id, { teacherStaffId: event.target.value })}><option value="">Sélectionner</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
        {['taught', 'partially_taught'].includes(selected[preparation.id].status) && <label>Date effective<input type="date" min={preparation.weekStartDate} max={preparation.weekEndDate} value={selected[preparation.id].effectiveDate} onChange={event => update(preparation.id, { effectiveDate: event.target.value })} /></label>}
        {selected[preparation.id].status === 'partially_taught' && <>
          <details><summary>Contenu relu disponible</summary><p style={{ whiteSpace: 'pre-wrap' }}>{[preparation.reviewData?.lessonTitle, preparation.reviewData?.objective, preparation.reviewData?.lessonSteps].filter(Boolean).join('\n')}</p></details>
          <label>Passages réellement enseignés, un extrait exact par ligne<textarea value={selected[preparation.id].excerpts} onChange={event => update(preparation.id, { excerpts: event.target.value })} /></label>
          <p>Seuls ces passages pourront alimenter une évaluation. Les autres parties restent exclues.</p>
        </>}
        <label>Commentaire de l’enseignant<textarea maxLength={2000} value={selected[preparation.id].note} onChange={event => update(preparation.id, { note: event.target.value })} /></label>
      </fieldset>}
    </article>)}
    {entries.length > 0 && <><label><input type="checkbox" checked={attested} disabled={busy} onChange={event => setAttested(event.target.checked)} /> Je consigne les déclarations reçues des enseignants sélectionnés.</label><button className="pedagogy-button" disabled={busy || !attested} onClick={() => void save()}>Enregistrer {entries.length} déclaration(s)</button></>}
  </section>;
}
