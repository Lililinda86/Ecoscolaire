import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SchoolDocumentHeader from '../../../components/SchoolDocumentHeader';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import {
  ensureWeeklyAssessmentDraft, generateWeeklyAssessment, loadAssessmentItems, loadWeeklyAssessments,
  markWeeklyAssessmentReadyToPrint, recordWeeklyAssessmentTeacherValidation, saveWeeklyAssessmentEdits
} from '../services/pedagogyService';
import type { AssessmentItem, WeeklyAssessment } from '../types';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { localEducationStage } from '../../../../functions/src/pedagogy/pedagogyPolicy';
import { Link } from 'react-router-dom';

const labels: Record<WeeklyAssessment['status'], string> = {
  draft: 'Brouillon vide', generating: 'Génération…', needs_review: 'À faire valider', teacher_validated: 'Validée enseignant',
  ready_to_print: 'Prête à imprimer', failed: 'Échec — réessayer', archived: 'Archivée'
};

const sourceSignature = (ids: string[], versions: Record<string, number> = {}) => ids.sort().map(id => `${id}:${versions[id] || 1}`).join('|');

export default function PedagogyAssessments() {
  const { db, currentSchool } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const teachers = useMemo(() => (db?.staff || []).filter(item => item.role === 'teacher' && item.active !== false && item.status !== 'inactive'), [db?.staff]);
  const [classId, setClassId] = useState('');
  const [weekId, setWeekId] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const preschool = ['pre_nursery', 'preschool'].includes(localEducationStage(classes.find(item => item.id === selectedClassId) || {}));
  const selectedWeek = workspace.weeks.find(item => item.id === weekId) || workspace.weeks[0];
  const preparations = useLessonPreparations(currentSchool?.id, year?.id, selectedWeek?.weekStartDate || '', selectedClassId);
  const [assessments, setAssessments] = useState<WeeklyAssessment[]>([]);
  const [loadedItems, setItems] = useState<AssessmentItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [teacherStaffId, setTeacherStaffId] = useState('');
  const [validationNote, setValidationNote] = useState('');
  const [validationSubject, setValidationSubject] = useState('');
  const [declarationReceived, setDeclarationReceived] = useState(false);
  const [declarationScope, setDeclarationScope] = useState('');
  const [printMode, setPrintMode] = useState<'student' | 'correction'>('student');
  const assessment = assessments.find(item => item.schoolId === currentSchool?.id && item.academicYearId === year?.id && item.classId === selectedClassId && item.weekId === selectedWeek?.id);
  const items = loadedItems.filter(item => item.weeklyAssessmentId === assessment?.id && item.generationVersion === assessment?.generationVersion);
  const scope = useMemo(() => currentSchool?.id && year?.id && selectedClassId && selectedWeek ? { schoolId: currentSchool.id, academicYearId: year.id, classId: selectedClassId, weekId: selectedWeek.id } : null, [currentSchool?.id, year?.id, selectedClassId, selectedWeek]);
  const scopeKey = JSON.stringify(scope);
  const requestSequence = useRef(0), activeScope = useRef(''), operationLock = useRef(false);
  const reviewScopeKey = `${scopeKey}:${assessment?.generationVersion || 0}:${assessment?.contentRevision || 0}`;
  const confirmedDeclaration = declarationReceived && declarationScope === reviewScopeKey;

  const refresh = useCallback(async () => {
    if (!scope || activeScope.current !== scopeKey) return;
    const request = ++requestSequence.current;
    const loaded = await loadWeeklyAssessments(scope.schoolId, scope.academicYearId, scope.weekId, scope.classId);
    const questions = loaded[0]?.generationVersion ? await loadAssessmentItems(scope.schoolId, loaded[0].id, loaded[0].generationVersion) : [];
    if (request !== requestSequence.current || activeScope.current !== scopeKey) return;
    setAssessments(loaded);
    setItems(questions);
  }, [scope, scopeKey]);
  useEffect(() => {
    activeScope.current = scopeKey;
    void refresh().catch(error => { if (activeScope.current === scopeKey) setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); });
    return () => { activeScope.current = ''; requestSequence.current += 1; };
  }, [refresh, scopeKey]);

  const validated = preparations.preparations.filter(item => item.status === 'validated' && item.currentUploadId && ['taught', 'partially_taught'].includes(item.teachingConfirmation?.status || ''));
  const expected = preparations.preparations;
  const covered = [...new Map(validated.map(item => [item.subjectId, item.subjectName])).entries()];
  const missing = [...new Map(expected.filter(item => !covered.some(([id]) => id === item.subjectId)).map(item => [item.subjectId, item.subjectName])).entries()];
  const currentSignature = sourceSignature(validated.map(item => item.id), Object.fromEntries(validated.map(item => [item.id, item.version])));
  const savedSignature = assessment ? sourceSignature([...(assessment.sourcePreparationIds || [])], assessment.sourcePreparationVersions) : '';
  const sourceChanged = Boolean(assessment?.sourceChecksum && currentSignature !== savedSignature);

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (operationLock.current || activeScope.current !== scopeKey) return;
    operationLock.current = true;
    setBusy(true); setMessage('Traitement en cours…');
    try { await action(); await refresh(); if (activeScope.current === scopeKey) setMessage(success); }
    catch (error) { if (activeScope.current === scopeKey) setMessage(error instanceof Error ? error.message : 'Opération impossible.'); }
    finally { operationLock.current = false; setBusy(false); }
  };
  const generate = (regenerate = false) => {
    if (!scope) return;
    const protectedRevision = regenerate && assessment && ['teacher_validated', 'ready_to_print'].includes(assessment.status);
    if (regenerate && !window.confirm(protectedRevision ? 'Créer explicitement une nouvelle révision après validation enseignant ?' : 'Régénérer explicitement ce brouillon ?')) return;
    void run(async () => { await ensureWeeklyAssessmentDraft(scope); await generateWeeklyAssessment(scope, regenerate, Boolean(protectedRevision)); }, regenerate ? 'Nouvelle révision générée.' : 'Évaluation générée.');
  };
  const save = () => assessment && void run(() => saveWeeklyAssessmentEdits(currentSchool!.id, assessment.id, items, 'Corrections enregistrées à la demande de l’enseignant.', assessment), 'Corrections enregistrées à la demande de l’enseignant.');
  const validateTeacher = () => assessment && teacherStaffId && confirmedDeclaration && void run(() => recordWeeklyAssessmentTeacherValidation(currentSchool!.id, assessment.id, teacherStaffId, validationNote, assessment, validationSubject, confirmedDeclaration), 'Validation de l’enseignant enregistrée par la secrétaire.');
  const ready = () => assessment && void run(() => markWeeklyAssessmentReadyToPrint(currentSchool!.id, assessment.id, assessment), 'Évaluation prête à imprimer.');
  const print = (mode: 'student' | 'correction') => { setPrintMode(mode); window.setTimeout(() => window.print(), 50); };
  const total = items.reduce((sum, item) => sum + Number(item.points), 0);

  return <main className="pedagogy-page">
    <PedagogyHeader title="Évaluations du vendredi" description="Préparez les évaluations à partir des cours reçus, vérifiés et confirmés comme enseignés pour la semaine sélectionnée." />
    <PedagogyNav />
    {(message || preparations.error) && <div className={`pedagogy-alert${preparations.error ? ' pedagogy-alert--error' : ''}`}>{preparations.error || message}</div>}
    <section className="pedagogy-toolbar no-print">
      <label>Classe<select value={selectedClassId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
      <label>Semaine<select value={selectedWeek?.id || ''} onChange={event => setWeekId(event.target.value)}>{workspace.weeks.map(item => <option key={item.id} value={item.id}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
      <button className="pedagogy-button" disabled={preschool || !scope || !validated.length || busy} onClick={() => generate(false)}>Générer maintenant</button>
      {(assessment?.generationVersion || 0) > 0 && <button className="pedagogy-button pedagogy-button--secondary" disabled={preschool || busy} onClick={() => generate(true)}>Régénérer brouillon</button>}
    </section>
    {preschool && <p className="pedagogy-alert">Cette classe suit un parcours sans note ni classement. <Link to="/pedagogy/observations">Ouvrir les activités et observations</Link>.</p>}
    <section className="pedagogy-card no-print">
      <h2>Couverture des préparations</h2>
      <p><strong>{validated.length}/{expected.length}</strong> cours confirmé(s) exploitable(s) · {expected.length ? Math.round(validated.length * 100 / expected.length) : 0}% des préparations attendues. Un cours partiellement enseigné ne couvre pas toute sa matière.</p>
      <div className="assessment-coverage">{covered.map(([id, name]) => <span className="assessment-chip" key={id}>{name}</span>)}{missing.map(([id, name]) => <span className="assessment-chip assessment-chip--missing" key={id}>{name} manquante</span>)}</div>
      {validated.length < expected.length && <div className="assessment-warning"><strong>Évaluation partielle</strong><br />{expected.filter(item => !validated.some(source => source.id === item.id)).map(item => `${item.subjectName} — ${item.lessonTitle || 'Leçon à préciser'}`).join(', ')} : cours exclus faute de confirmation exploitable.</div>}
      {validated.some(item => item.teachingConfirmation?.status === 'partially_taught') && <p>Enseignements partiels : seules les portions confirmées sont incluses.</p>}
      {sourceChanged && <div className="assessment-warning"><strong>Les cours confirmés ont changé.</strong><br />Le brouillon n’a pas été modifié automatiquement. Il peut être actualisé par une régénération explicite.</div>}
      {!validated.length && <p>Aucun cours confirmé exploitable</p>}
    </section>
    {assessment && <section className="pedagogy-card no-print">
      <div className="pedagogy-card-title"><div><h2>{assessment.title || 'Évaluation hebdomadaire'}</h2><p>Version {assessment.generationVersion} · <span className={`pedagogy-status pedagogy-status--${assessment.status}`}>{labels[assessment.status]}</span></p></div><strong>{total}/{assessment.totalPoints}</strong></div>
      {assessment.generationError && <div className="pedagogy-alert pedagogy-alert--error">Génération impossible : {assessment.generationError}. Le brouillon et ses sources sont conservés ; vous pouvez réessayer.</div>}
      <div className="assessment-editor">{items.map((item, index) => <article key={item.id}>
        <strong>Question {index + 1} · {item.questionType}</strong>
        <label>Question<textarea value={item.questionText} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, questionText: event.target.value } : row))} /></label>
        <label>Instructions<textarea value={item.instructions} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, instructions: event.target.value } : row))} /></label>
        <label>Réponse attendue<textarea value={item.expectedAnswer} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, expectedAnswer: event.target.value } : row))} /></label>
        <label>Consignes de correction<textarea value={item.correctionGuide} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, correctionGuide: event.target.value } : row))} /></label>
        <label>Points<input type="number" min="0.5" step="0.5" value={item.points} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, points: Number(event.target.value) } : row))} /></label>
        <label>Ordre<input type="number" min="1" step="1" value={item.order} onChange={event => setItems(current => current.map(row => row.id === item.id ? { ...row, order: Number(event.target.value) } : row))} /></label>
      </article>)}</div>
      {items.length > 0 && ['needs_review', 'teacher_validated', 'ready_to_print'].includes(assessment.status) && <><p>Toute correction du sujet, barème ou corrigé annule les visas de cette version.</p><button className="pedagogy-button" disabled={busy || Math.abs(total - assessment.totalPoints) > .001} onClick={save}>Enregistrer les corrections</button></>}
      {assessment.status === 'needs_review' && <div className="pedagogy-actions">
        <label>Matière à valider<select value={validationSubject} onChange={event => { setValidationSubject(event.target.value); setDeclarationReceived(false); }}><option value="">Toutes — uniquement si le même enseignant est affecté à chacune</option>{assessment.coveredSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
        <label>Enseignant<select value={teacherStaffId} onChange={event => { setTeacherStaffId(event.target.value); setDeclarationReceived(false); }}><option value="">Sélectionner</option>{teachers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Note<input value={validationNote} onChange={event => setValidationNote(event.target.value)} /></label>
        <label><input type="checkbox" checked={confirmedDeclaration} onChange={event => { setDeclarationReceived(event.target.checked); setDeclarationScope(reviewScopeKey); }} /> Accord enseignant reçu pour cette version et ces matières</label>
        <button className="pedagogy-button" disabled={!teacherStaffId || !validationNote.trim() || !confirmedDeclaration || busy} onClick={validateTeacher}>Enregistrer validation enseignant</button>
      </div>}
      {!!assessment.teacherValidations?.length && <p>{assessment.teacherValidations.length}/{assessment.coveredSubjects.length} visa(s) par matière enregistrés pour cette version.</p>}
      {assessment.teacherValidated && <p className="assessment-validation">Validation de l’enseignant enregistrée par la secrétaire</p>}
      {assessment.status === 'teacher_validated' && <button className="pedagogy-button" disabled={busy || sourceChanged} onClick={ready}>Passer prête à imprimer</button>}
      <div className="pedagogy-actions"><button className="pedagogy-button pedagogy-button--secondary" onClick={() => print('student')}>{assessment.status === 'ready_to_print' && !sourceChanged ? 'Imprimer version finale' : 'Imprimer brouillon'}</button><button className="pedagogy-button pedagogy-button--secondary" onClick={() => print('correction')}>Corrigé / Guide de correction</button></div>
    </section>}
    {assessment && items.length > 0 && <section id="weekly-assessment-print" className="pedagogy-a4">
      <SchoolDocumentHeader school={currentSchool} documentTitle={printMode === 'correction' ? 'Corrigé / Guide de correction' : 'Évaluation'} />
      {printMode === 'student' && (assessment.status !== 'ready_to_print' || sourceChanged) && <div className="assessment-watermark">BROUILLON — À VALIDER PAR L’ENSEIGNANT</div>}
      <h2>{printMode === 'correction' ? 'CORRIGÉ / GUIDE DE CORRECTION' : 'ÉVALUATION HEBDOMADAIRE'}</h2>
      <div className="assessment-meta"><span>Classe<br /><strong>{assessment.className}</strong></span><span>Date<br /><strong>{assessment.fridayDate}</strong></span><span>Durée<br /><strong>{assessment.durationMinutes} min</strong></span><span>Barème<br /><strong>/{assessment.totalPoints}</strong></span></div>
      {printMode === 'student' && <p>Nom et prénom de l’élève : ______________________________________________</p>}
      <p>{assessment.instructions}</p>
      {items.map(item => <article className="assessment-question" key={item.id}><h3>{item.order}. {item.questionText} <small>({item.points} pt{item.points > 1 ? 's' : ''})</small></h3><p>{item.instructions}</p>{printMode === 'correction' ? <><strong>Réponse attendue</strong><p>{item.expectedAnswer}</p><strong>Consignes de correction</strong><p>{item.correctionGuide}</p></> : <div className="assessment-answer-lines" />}</article>)}
      <p className="assessment-total">Total : {total}/{assessment.totalPoints}</p><footer className="assessment-footer"><span>Semaine du {assessment.weekStartDate}</span><span>Page 1</span></footer>
    </section>}
  </main>;
}
