import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../db/firebase';
import '../pedagogy-print.css';

interface Review {
  id: string; className: string; weekStartDate: string; weekEndDate: string; generationVersion: number;
  status: 'needs_review' | 'ready_to_print'; teacherValidated: boolean; title: string; notice: string;
  language: 'fr' | 'en'; sourceChecksum: string;
  teacherValidations: Array<{ subjectId: string; teacherStaffId: string }>;
  excluded: Array<{ preparationId: string; reason: string }>;
  activities: Array<{ preparationId: string; preparationVersion: number; subjectId: string; domainLabel: string; confirmationId: string; effectiveDate: string | null; partial: boolean; confirmedContent: string; observationPrompt: string; adaptationPrompt: string }>;
}
type Scope = { schoolId: string; academicYearId: string; classId: string; weekId: string };
interface Loaded { review: Review | null; sourceChanged: boolean; availableActivityCount: number }
const call = async (scope: Scope, input: Record<string, unknown>) => (await httpsCallable<Scope & Record<string, unknown>, Loaded>(functions, 'managePreschoolWeeklyReview')({ ...scope, ...input })).data;

/** Parent keys this component by the complete tenant/year/class/week scope. */
export function PreschoolWeeklyReview({ scope, teachers }: { scope: Scope; teachers: Array<{ id: string; name?: string }> }) {
  const [loaded, setLoaded] = useState<Loaded>({ review: null, sourceChanged: false, availableActivityCount: 0 });
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [teacherId, setTeacherId] = useState(''), [subjectId, setSubjectId] = useState(''), [note, setNote] = useState(''), [received, setReceived] = useState(false);
  const mounted = useRef(true), lock = useRef(false), sequence = useRef(0);
  const { schoolId, academicYearId, classId, weekId } = scope;
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const data = await call({ schoolId, academicYearId, classId, weekId }, { operation: 'read' });
    if (mounted.current && sequence.current === request) { setLoaded(data); setReceived(false); }
  }, [schoolId, academicYearId, classId, weekId]);
  useEffect(() => { mounted.current = true; void refresh().catch(error => { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); }); return () => { mounted.current = false; sequence.current += 1; }; }, [refresh]);
  const run = async (input: Record<string, unknown>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await call(scope, input); await refresh(); if (mounted.current) setMessage('Bilan actualisé. Aucune observation d’enfant ni note créée.'); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Action non confirmée.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const review = loaded.review, en = review?.language === 'en';
  const domains = [...new Map((review?.activities || []).map(a => [a.subjectId, a.domainLabel])).entries()];
  const generate = () => {
    if (review && loaded.sourceChanged && !window.confirm('Les activités ont changé. Créer une nouvelle révision et demander de nouveaux accords enseignants ?')) return;
    void run({ operation: 'generate', expectedVersion: review?.generationVersion || 0, confirmRevision: Boolean(review && loaded.sourceChanged) });
  };
  return <section className="pedagogy-card" data-testid="preschool-weekly-review">
    <div className="no-print">
      <h2>Bilan hebdomadaire préscolaire</h2>
      <p>Un guide qualitatif issu uniquement des activités confirmées réalisées. Aucun appel IA. Les observations et acquis se consignent ensuite dans le suivi existant.</p>
      {message && <p role="status" className="pedagogy-alert">{message}</p>}
      {loaded.sourceChanged && <p role="alert">Activités modifiées : ce bilan est périmé. Une nouvelle révision et de nouveaux accords sont nécessaires.</p>}
      <button className="pedagogy-button" disabled={busy || !loaded.availableActivityCount} onClick={generate}>{review ? 'Actualiser le bilan explicitement' : 'Préparer le bilan qualitatif'}</button>
      {!loaded.availableActivityCount && <p>Aucune activité réalisée et confirmée exploitable.</p>}
      {review && <>
        <p>{review.activities.length} activité(s) · {review.excluded.length} préparation(s) exclue(s) · {review.teacherValidations.length}/{domains.length} accord(s) enseignant.</p>
        {review.status !== 'ready_to_print' && !loaded.sourceChanged && <fieldset disabled={busy}>
          <legend>Consigner un accord réellement reçu</legend>
          <label>Domaine<select value={subjectId} onChange={e => { setSubjectId(e.target.value); setReceived(false); }}><option value="">Choisir un domaine</option>{domains.filter(([id]) => !review.teacherValidations.some(v => v.subjectId === id)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Enseignant responsable<select value={teacherId} onChange={e => { setTeacherId(e.target.value); setReceived(false); }}><option value="">Choisir un enseignant</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label>Note de déclaration<textarea maxLength={2000} value={note} onChange={e => { setNote(e.target.value); setReceived(false); }} /></label>
          <label><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} /> Accord enseignant reçu pour cette version, ce domaine et les seules activités confirmées.</label>
          <button className="pedagogy-button" disabled={!received || !note.trim() || !teacherId || !subjectId} onClick={() => void run({ operation: 'record_teacher_agreement', expectedVersion: review.generationVersion, sourceChecksum: review.sourceChecksum, subjectId, teacherStaffId: teacherId, note, declarationReceived: received })}>Enregistrer l’accord reçu</button>
        </fieldset>}
        <div className="pedagogy-actions"><button className="pedagogy-button pedagogy-button--secondary" disabled={busy} onClick={() => window.print()}>{review.status === 'ready_to_print' && !loaded.sourceChanged ? 'Imprimer le guide validé' : 'Imprimer le brouillon'}</button><Link to="/pedagogy/observations">Consigner les observations qualitatives</Link><Link to="/pedagogy/follow-up">Acquis et remédiation</Link></div>
        <details><summary>Voir les détails de provenance</summary><p style={{ overflowWrap: 'anywhere' }}>{review.sourceChecksum}</p><p>Aucune compétence ministérielle déduite automatiquement. Chaque activité conserve la préparation, sa version et la déclaration de réalisation.</p></details>
      </>}
    </div>
    {review && <section className="pedagogy-a4 assessment-paper" lang={review.language} data-testid="preschool-review-print">
      <h2>{review.title}</h2><p>{review.className} · {review.weekStartDate} — {review.weekEndDate} · v{review.generationVersion}</p>
      {(review.status !== 'ready_to_print' || loaded.sourceChanged) && <p className="assessment-watermark">{en ? 'DRAFT — TEACHER REVIEW REQUIRED' : 'BROUILLON — REVUE ENSEIGNANT REQUISE'}</p>}
      <p>{review.notice}</p>
      {review.activities.map((activity, index) => <article className="assessment-question" key={activity.preparationId}>
        <h3>{index + 1}. {activity.domainLabel}</h3><p>{activity.confirmedContent}</p><p>{activity.observationPrompt}</p><p>{activity.adaptationPrompt}</p>
        <p>{en ? 'Observed action / words and support provided' : 'Action / parole observée et aide apportée'} : __________________________</p>
        <p>{en ? 'Not observed · Discovering · Developing · Acquired (no selection made)' : 'Non observé · Découverte · En développement · Acquis (aucun choix prérempli)'}</p>
        <small>{en ? 'Confirmed on' : 'Réalisation confirmée le'} {activity.effectiveDate}{activity.partial ? en ? ' · confirmed excerpt only' : ' · extrait confirmé seulement' : ''}</small>
      </article>)}
    </section>}
  </section>;
}
