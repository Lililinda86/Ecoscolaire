import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { StatusBadge } from '../components/StatusBadge';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { loadWeeklyAssessments } from '../services/pedagogyService';
import type { WeeklyAssessment } from '../types';

export default function PedagogyDashboard() {
  const { db, currentSchool, currentUser } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const validated = workspace.plans.filter(plan => plan.status === 'teacher_validated').length;
  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = workspace.weeks.find(week => week.weekStartDate <= today && week.weekEndDate >= today);
  const preparationState = useLessonPreparations(currentUser?.role === 'boardViewer' ? undefined : currentSchool?.id, year?.id, currentWeek?.weekStartDate);
  const [assessments, setAssessments] = useState<WeeklyAssessment[]>([]);
  useEffect(() => {
    if (!currentSchool?.id || !year?.id || !currentWeek?.id || currentUser?.role === 'boardViewer') return;
    void loadWeeklyAssessments(currentSchool.id, year.id, currentWeek.id).then(setAssessments).catch(() => setAssessments([]));
  }, [currentSchool?.id, year?.id, currentWeek?.id, currentUser?.role]);
  const visibleAssessments = currentUser?.role === 'boardViewer' ? [] : assessments;
  const missingPreparations = preparationState.preparations.filter(item => item.status === 'expected').length;
  const reviewPreparations = preparationState.preparations.filter(item => item.status === 'needs_review').length;
  const validatedPreparations = preparationState.preparations.filter(item => item.status === 'validated').length;
  const pending = workspace.plans.filter(plan => ['proposed', 'needs_adjustment', 'adjusted'].includes(plan.status)).length;
  return <main className="pedagogy-page">
    <PedagogyHeader title="Pilotage pédagogique" description="Une vue opérationnelle des semaines, propositions et validations enregistrées par le secrétariat." />
    <PedagogyNav />
    {!year && <div className="pedagogy-alert">Activez une année scolaire pour commencer.</div>}
    {workspace.error && <div className="pedagogy-alert pedagogy-alert--error">{workspace.error}</div>}
    <section className="pedagogy-kpis" aria-busy={workspace.loading}>
      <article><strong>{currentWeek ? `S${currentWeek.weekNumber}` : '—'}</strong><span>semaine actuelle</span></article>
      <article><strong>Toutes</strong><span>classes sélectionnées</span></article>
      <article><strong>{workspace.weeks.length}</strong><span>semaines préparées</span></article>
      <article><strong>{workspace.plans.length}</strong><span>planifications</span></article>
      <article><strong>{pending}</strong><span>validations à suivre</span></article>
      <article><strong>{validated}</strong><span>validées enseignant</span></article>
      {currentUser?.role !== 'boardViewer' && <>
        <article><strong>{missingPreparations}</strong><span>préparations manquantes</span></article>
        <article><strong>{reviewPreparations}</strong><span>préparations à relire</span></article>
        <article><strong>{validatedPreparations}</strong><span>préparations validées</span></article>
        <article><strong>{Math.max(0, (db?.classes || []).filter(item => item.isActive !== false).length - visibleAssessments.length)}</strong><span>évaluations à générer</span></article>
        <article><strong>{visibleAssessments.filter(item => item.partial).length}</strong><span>évaluations partielles</span></article>
        <article><strong>{visibleAssessments.filter(item => item.status === 'needs_review').length}</strong><span>à faire valider</span></article>
        <article><strong>{visibleAssessments.filter(item => item.status === 'ready_to_print').length}</strong><span>prêtes à imprimer</span></article>
        <article><strong>{preparationState.preparations.length ? Math.round(validatedPreparations * 100 / preparationState.preparations.length) : 0}%</strong><span>couverture des préparations</span></article>
      </>}
    </section>
    <section className="pedagogy-card">
      <div className="pedagogy-card-title"><div><h2>À traiter</h2><p>Les planifications récentes qui attendent une action.</p></div><div className="pedagogy-row-actions"><Link className="pedagogy-button pedagogy-button--secondary" to="/pedagogy/assessments">Évaluations du vendredi</Link><Link className="pedagogy-button" to="/pedagogy/planning">Ouvrir la semaine</Link></div></div>
      <div className="pedagogy-list">
        {workspace.plans.filter(plan => plan.status !== 'archived').slice(0, 6).map(plan => <div className="pedagogy-list-row" key={plan.id}>
          <div><strong>{db?.classes.find(item => item.id === plan.classId)?.name || plan.classId}</strong><small>Semaine {plan.weekNumber} · {plan.weekStartDate}</small></div>
          <StatusBadge status={plan.status} />
        </div>)}
        {!workspace.loading && !workspace.plans.length && <p className="pedagogy-empty">Aucune planification. Initialisez les semaines puis créez une proposition.</p>}
      </div>
    </section>
  </main>;
}
