import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SchoolDocumentHeader from '../../../components/SchoolDocumentHeader';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { PreparationStatus } from '../components/PreparationStatus';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { ensureExpectedLessonPreparations } from '../services/pedagogyService';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { TeachingConfirmationForm } from '../components/TeachingConfirmationForm';

export default function PedagogyPreparations() {
  const { db, currentSchool } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const [classId, setClassId] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [message, setMessage] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const today = new Date().toISOString().slice(0, 10);
  const selectedWeekStartDate = weekStartDate || workspace.weeks.find(item => item.weekStartDate <= today && item.weekEndDate >= today)?.weekStartDate || workspace.weeks[0]?.weekStartDate || '';
  const state = useLessonPreparations(currentSchool?.id, year?.id, selectedWeekStartDate, selectedClassId);
  const plan = workspace.plans.find(item => item.classId === selectedClassId && item.weekStartDate === selectedWeekStartDate);
  const selectedClass = classes.find(item => item.id === selectedClassId);
  const first = state.preparations[0];
  const selectedWeek = workspace.weeks.find(item => item.weekStartDate === selectedWeekStartDate);
  const counters = {
    expected: state.preparations.filter(item => item.status === 'expected').length,
    review: state.preparations.filter(item => item.status === 'needs_review').length,
    validated: state.preparations.filter(item => item.status === 'validated').length
  };
  const generate = async () => {
    if (!currentSchool?.id || !plan) return;
    setMessage('Génération des attentes…');
    try {
      const result = await ensureExpectedLessonPreparations(currentSchool.id, plan.id);
      await state.refresh();
      setMessage(`${result.expectedCount} préparation(s) attendue(s), ${result.createdCount} créée(s).`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Génération impossible.'); }
  };
  return <main className="pedagogy-page">
    <PedagogyHeader title="Préparations de cours" description="Transformez les séances planifiées en préparations attendues, déposez les originaux puis contrôlez leur analyse." />
    <PedagogyNav />
    {(message || state.error) && <div className={`pedagogy-alert${state.error ? ' pedagogy-alert--error' : ''}`}>{state.error || message}</div>}
    <section className="pedagogy-toolbar no-print">
      <label>Classe<select value={selectedClassId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
      <label>Semaine<select value={selectedWeekStartDate} onChange={event => setWeekStartDate(event.target.value)}>{workspace.weeks.map(item => <option key={item.id} value={item.weekStartDate}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
      <button className="pedagogy-button" disabled={!plan} onClick={() => void generate()}>Générer les préparations attendues</button>
      <Link className="pedagogy-button pedagogy-button--secondary" to="/pedagogy/preparations/import">Importer une préparation</Link>
    </section>
    {!plan && selectedClassId && selectedWeekStartDate && <div className="pedagogy-alert">Aucune planification Lot A pour ce périmètre : seul un dépôt manuel non planifié est possible.</div>}
    <section className="pedagogy-kpis no-print">
      <article><strong>{state.preparations.length}</strong><span>attendues au total</span></article>
      <article><strong>{counters.expected}</strong><span>encore manquantes</span></article>
      <article><strong>{counters.review}</strong><span>à relire</span></article>
      <article><strong>{counters.validated}</strong><span>validées</span></article>
    </section>
    <section className="pedagogy-card no-print" aria-busy={state.loading}>
      <div className="pedagogy-card-title"><div><h2>Suivi hebdomadaire</h2><p>{selectedClass?.name || 'Classe'} · {selectedWeekStartDate || 'semaine'}</p></div><Link to="/pedagogy/preparations/missing">Voir uniquement les manquantes</Link></div>
      {state.preparations.map(item => <div className="pedagogy-list-row" key={item.id}><div><strong>{item.subjectName} — {item.lessonTitle || 'Leçon à préciser'}</strong><small>{item.source === 'planned' ? `Séance Lot A · créneau ${item.slotIndex || '—'}` : 'Préparation manuelle non planifiée'}</small></div><div className="pedagogy-row-actions"><PreparationStatus status={item.status} analysisStatus={item.analysisStatus} /><Link to={`/pedagogy/preparations/import?id=${encodeURIComponent(item.id)}`}>{item.status === 'expected' ? 'Déposer' : 'Relire'}</Link></div></div>)}
      {!state.loading && !state.preparations.length && <p className="pedagogy-empty">Générez les attentes depuis une planification, ou importez une préparation non planifiée.</p>}
    </section>
    {currentSchool && year && selectedWeek && <TeachingConfirmationForm
      key={`${currentSchool.id}:${year.id}:${selectedClassId}:${selectedWeek.id}`}
      schoolId={currentSchool.id} academicYearId={year.id} classId={selectedClassId} weekId={selectedWeek.id}
      preparations={state.preparations} teachers={(db?.staff || []).filter(item => item.role === 'teacher' && item.active !== false && item.status !== 'inactive')}
      onSaved={state.refresh}
    />}
    <section className="pedagogy-card pedagogy-a4" id="preparation-template">
      <SchoolDocumentHeader school={currentSchool} documentTitle="Fiche de préparation" />
      <div className="pedagogy-card-title"><div><h2>{first?.subjectName || 'Matière'} — {first?.lessonTitle || 'Titre de la leçon'}</h2><p>{selectedClass?.name || 'Classe'} · Semaine du {selectedWeekStartDate || '____-__-__'}</p></div><button className="pedagogy-button no-print" onClick={() => window.print()}>Imprimer en A4</button></div>
      {['Objectif et prérequis', 'Matériel et supports', 'Déroulement de la séance', 'Évaluation', 'Différenciation et remédiation'].map(title => <div className="pedagogy-template-section" key={title}><h3>{title}</h3><div /></div>)}
      <footer>Modèle structuré v1 · les zones non renseignées restent explicitement vides.</footer>
    </section>
  </main>;
}
