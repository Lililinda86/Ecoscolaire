import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { PreparationStatus } from '../components/PreparationStatus';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { loadLessonPreparation, saveLessonPreparationReview, startLessonPreparationAnalysis, uploadLessonPreparation, validateLessonPreparation } from '../services/pedagogyService';
import type { LessonPreparation, PreparationReview } from '../types';
import { getClassOptionLabel } from '../../../utils/classCatalog';

const emptyReview: PreparationReview = { lessonTitle: '', objective: '', prerequisites: '', materials: '', lessonSteps: '', assessment: '', differentiation: '' };

export default function PedagogyPreparationImport() {
  const { db, currentSchool } = useAppContext();
  const [params] = useSearchParams();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const subjects = useMemo(() => (db?.subjects || []).filter(item => item.isActive !== false), [db?.subjects]);
  const teachers = useMemo(() => (db?.staff || []).filter(item => item.active !== false && item.status !== 'inactive'), [db?.staff]);
  const [classId, setClassId] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const state = useLessonPreparations(currentSchool?.id, year?.id, weekStartDate || workspace.weeks[0]?.weekStartDate || '', classId || classes[0]?.id || '');
  const [preparationId, setPreparationId] = useState(params.get('id') || '');
  const [manual, setManual] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [teacherStaffId, setTeacherStaffId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<PreparationReview>(emptyReview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loadedPreparation, setLoadedPreparation] = useState<LessonPreparation>();
  const selectedClassId = classId || classes[0]?.id || '';
  const selectedWeekStartDate = weekStartDate || workspace.weeks[0]?.weekStartDate || '';
  const candidate = loadedPreparation?.id === preparationId ? loadedPreparation : state.preparations.find(item => item.id === preparationId);
  const selected = manual || candidate?.schoolId !== currentSchool?.id || candidate?.academicYearId !== year?.id ? undefined : candidate;
  useEffect(() => {
    if (!currentSchool?.id || !preparationId) return;
    let alive = true;
    void loadLessonPreparation(currentSchool.id, preparationId).then(value => { if (alive) setLoadedPreparation(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, [currentSchool?.id, preparationId]);
  useEffect(() => {
    if (!selected) return;
    const extracted = selected.extractedData || {};
    setReview({
      lessonTitle: selected.reviewData?.lessonTitle || String(extracted.lessonTitle || selected.lessonTitle || ''),
      objective: selected.reviewData?.objective || String(extracted.objective || selected.objective || ''),
      prerequisites: selected.reviewData?.prerequisites || (Array.isArray(extracted.prerequisites) ? extracted.prerequisites.join('\n') : ''),
      materials: selected.reviewData?.materials || (Array.isArray(extracted.materials) ? extracted.materials.join('\n') : ''),
      lessonSteps: selected.reviewData?.lessonSteps || (Array.isArray(extracted.lessonSteps) ? JSON.stringify(extracted.lessonSteps, null, 2) : ''),
      assessment: selected.reviewData?.assessment || String(extracted.assessment || ''),
      differentiation: selected.reviewData?.differentiation || String(extracted.differentiation || '')
    });
  }, [selected]);
  const upload = async () => {
    if (!currentSchool?.id || !year?.id || !file) return;
    setBusy(true); setMessage('Dépôt de l’original puis analyse…');
    try {
      const subject = subjects.find(item => item.id === subjectId);
      const registered = await uploadLessonPreparation(currentSchool.id, file, manual ? undefined : preparationId, manual ? {
        academicYearId: year.id, classId: selectedClassId, subjectId, subjectName: subject?.name || '', teacherStaffId, weekStartDate: selectedWeekStartDate, lessonTitle, objective
      } : undefined);
      setPreparationId(registered.preparationId);
      const analyzed = await startLessonPreparationAnalysis(currentSchool.id, registered.uploadId);
      await state.refresh();
      setLoadedPreparation(await loadLessonPreparation(currentSchool.id, registered.preparationId));
      setMessage(analyzed.analysisStatus === 'failed' ? 'Analyse échouée : la relecture manuelle reste disponible.' : 'Analyse terminée : vérifiez chaque champ avant validation.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Dépôt impossible.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!currentSchool?.id || !preparationId) return;
    setBusy(true);
    try { await saveLessonPreparationReview(currentSchool.id, preparationId, review); await state.refresh(); setLoadedPreparation(await loadLessonPreparation(currentSchool.id, preparationId)); setMessage('Corrections enregistrées.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Correction impossible.'); }
    finally { setBusy(false); }
  };
  const retryAnalysis = async () => {
    if (!currentSchool?.id || !selected?.currentUploadId || busy) return;
    setBusy(true); setMessage('Reprise explicite du contrôle du fichier…');
    try {
      const response = await startLessonPreparationAnalysis(currentSchool.id, selected.currentUploadId, true);
      await state.refresh(); setLoadedPreparation(await loadLessonPreparation(currentSchool.id, selected.id));
      setMessage(response.analysisStatus === 'failed' ? `Analyse indisponible (${response.errorCode || 'échec'}). La relecture manuelle reste possible.` : 'Analyse terminée : relecture requise.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Reprise impossible.'); }
    finally { setBusy(false); }
  };
  const validate = async () => {
    if (!currentSchool?.id || !preparationId) return;
    setBusy(true);
    try { await validateLessonPreparation(currentSchool.id, preparationId); await state.refresh(); setLoadedPreparation(await loadLessonPreparation(currentSchool.id, preparationId)); setMessage('Préparation validée après relecture du secrétariat.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Validation impossible.'); }
    finally { setBusy(false); }
  };
  const field = (key: keyof PreparationReview, label: string) => <label>{label}<textarea value={review[key]} onChange={event => setReview(value => ({ ...value, [key]: event.target.value }))} /></label>;
  return <main className="pedagogy-page">
    <PedagogyHeader title="Importer et relire" description="PDF, JPEG ou PNG (10 Mio maximum). L’intégrité du fichier est contrôlée ; l’IA documentaire réelle reste indisponible tant que son autorisation et sa configuration ne sont pas validées." />
    <PedagogyNav />
    {message && <div className="pedagogy-alert">{message}</div>}
    {selected && ['failed', 'processing'].includes(selected.analysisStatus) && selected.status !== 'validated' && <div className="pedagogy-alert"><p>{selected.analysisError || 'Analyse en cours : la reprise sera refusée tant que le délai de traitement n’est pas expiré.'}</p><button disabled={busy} onClick={() => void retryAnalysis()}>Reprendre le contrôle du même fichier</button></div>}
    <section className="pedagogy-card">
      <div className="pedagogy-card-title"><div><h2>Original immuable</h2><p>Un même contenu conserve le même identifiant; l’écrasement et la suppression sont interdits.</p></div><Link to="/pedagogy/preparations">Retour au suivi</Link></div>
      <label className="pedagogy-check"><input type="checkbox" checked={manual} onChange={event => setManual(event.target.checked)} /> Préparation manuelle non planifiée</label>
      <div className="pedagogy-form-grid">
        <label>Classe<select value={selectedClassId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
        <label>Semaine<select value={selectedWeekStartDate} onChange={event => setWeekStartDate(event.target.value)}>{workspace.weeks.map(item => <option key={item.id} value={item.weekStartDate}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
        {!manual && <label>Préparation attendue<select value={preparationId} onChange={event => { setPreparationId(event.target.value); setLoadedPreparation(undefined); }}><option value="">Choisir…</option>{state.preparations.map(item => <option key={item.id} value={item.id}>{item.subjectName} — {item.lessonTitle || 'sans titre'}</option>)}</select></label>}
        {manual && <><label>Matière<select value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Choisir…</option>{subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Enseignant<select value={teacherStaffId} onChange={event => setTeacherStaffId(event.target.value)}><option value="">Choisir…</option>{teachers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Titre<input value={lessonTitle} onChange={event => setLessonTitle(event.target.value)} /></label><label>Objectif<textarea value={objective} onChange={event => setObjective(event.target.value)} /></label></>}
        <label>Document<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      </div>
      <button className="pedagogy-button" disabled={busy || !file || (!manual && !preparationId) || (manual && (!subjectId || !teacherStaffId))} onClick={() => void upload()}>Déposer et analyser</button>
    </section>
    {selected && <section className="pedagogy-card"><div className="pedagogy-card-title"><div><h2>Relecture structurée</h2><p>{selected.subjectName} · chaque zone reste modifiable avant validation.</p></div><PreparationStatus status={selected.status} analysisStatus={selected.analysisStatus} /></div>{selected.analysisStatus === 'failed' && <div className="pedagogy-alert pedagogy-alert--error">L’analyse a échoué. Complétez manuellement les champs puis enregistrez la relecture.</div>}<div className="pedagogy-form-grid">{field('lessonTitle', 'Titre de la leçon')}{field('objective', 'Objectif')}{field('prerequisites', 'Prérequis')}{field('materials', 'Matériel')}{field('lessonSteps', 'Déroulement')}{field('assessment', 'Évaluation')}{field('differentiation', 'Différenciation')}</div><div className="pedagogy-actions"><button className="pedagogy-button pedagogy-button--secondary" disabled={busy || selected.status === 'validated'} onClick={() => void save()}>Enregistrer les corrections</button><button className="pedagogy-button" disabled={busy || selected.status !== 'needs_review' || !selected.reviewData} onClick={() => void validate()}>Valider après relecture</button></div>{selected.validationMeaning && <p className="pedagogy-alert">{selected.validationMeaning}</p>}</section>}
  </main>;
}
