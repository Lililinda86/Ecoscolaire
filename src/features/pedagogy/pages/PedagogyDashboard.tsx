import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { StatusBadge } from '../components/StatusBadge';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { loadWeeklyAssessments } from '../services/pedagogyService';
import type { WeeklyAssessment } from '../types';
import { useScopedResource } from '../hooks/useScopedResource';
import { dashboardAssessmentCoverage } from '../services/dashboardCoverage';
const emptyAssessments: WeeklyAssessment[] = [];

function useDashboardAssessments(scope: string | null) {
  const load = useCallback(() => {
    if (!scope) return Promise.resolve(emptyAssessments);
    const [schoolId, academicYearId, weekId] = JSON.parse(scope) as [string, string, string];
    return loadWeeklyAssessments(schoolId, academicYearId, weekId);
  }, [scope]);
  return useScopedResource(scope, emptyAssessments, load, 'Évaluations indisponibles.');
}

export default function PedagogyDashboard() {
  const { db, currentSchool, currentUser } = useAppContext();
  const years = (db?.academicYears || []).filter(item => item.schoolId === currentSchool?.id);
  const year = years.find(item => item.id === currentSchool?.activeAcademicYearId) || years.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const validated = workspace.plans.filter(plan => plan.status === 'teacher_validated').length;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala' }).format(new Date());
  const currentWeek = workspace.weeks.find(week => week.weekStartDate <= today && week.weekEndDate >= today);
  const preparationState = useLessonPreparations(currentUser?.role === 'boardViewer' ? undefined : currentSchool?.id, year?.id, currentWeek?.weekStartDate);
  const assessmentScope = currentSchool?.id && year?.id && currentWeek?.id && currentUser?.role !== 'boardViewer'
    ? JSON.stringify([currentSchool.id, year.id, currentWeek.id]) : null;
  const assessmentState = useDashboardAssessments(assessmentScope);
  const visibleAssessments = assessmentState.data;
  const coverage = dashboardAssessmentCoverage(db?.classes || [], visibleAssessments, currentSchool?.id || '', year?.id || '', currentWeek?.id || '');
  const assessmentsKnown = Boolean(assessmentScope) && !assessmentState.loading && !assessmentState.error;
  const preparationsKnown = Boolean(currentWeek) && !preparationState.loading && !preparationState.error;
  const missingPreparations = preparationState.preparations.filter(item => item.status === 'expected').length;
  const reviewPreparations = preparationState.preparations.filter(item => item.status === 'needs_review').length;
  const validatedPreparations = preparationState.preparations.filter(item => item.status === 'validated').length;
  const pending = workspace.plans.filter(plan => ['proposed', 'needs_adjustment', 'adjusted'].includes(plan.status)).length;
  return <main className="pedagogy-page">
    <PedagogyHeader title="Pilotage pédagogique" description="Une vue opérationnelle des semaines, propositions et validations enregistrées par le secrétariat." />
    <PedagogyNav />
    {!year && <div className="pedagogy-alert">Activez une année scolaire pour commencer.</div>}
    {workspace.error && <div className="pedagogy-alert pedagogy-alert--error">{workspace.error}</div>}
    {(assessmentState.error || preparationState.error) && <p role="alert">{assessmentState.error || preparationState.error} Les compteurs concernés ne sont pas disponibles.</p>}
    <section className="pedagogy-kpis" aria-busy={workspace.loading}>
      <article><strong>{currentWeek ? `S${currentWeek.weekNumber}` : '—'}</strong><span>semaine actuelle</span></article>
      <article><strong>Toutes</strong><span>classes sélectionnées</span></article>
      <article><strong>{workspace.weeks.length}</strong><span>semaines préparées</span></article>
      <article><strong>{workspace.plans.length}</strong><span>planifications</span></article>
      <article><strong>{pending}</strong><span>validations à suivre</span></article>
      <article><strong>{validated}</strong><span>validées enseignant</span></article>
      {currentUser?.role !== 'boardViewer' && <>
        <article><strong>{preparationsKnown ? missingPreparations : '—'}</strong><span>préparations attendues sans document</span></article>
        <article><strong>{preparationsKnown ? reviewPreparations : '—'}</strong><span>préparations à relire</span></article>
        <article><strong>{preparationsKnown ? validatedPreparations : '—'}</strong><span>documents de préparation validés</span></article>
        <article><strong>{assessmentsKnown ? coverage.classesWithoutAssessment : '—'}</strong><span>classes primaire/collège sans évaluation chargée</span></article>
        <article><strong>{assessmentsKnown ? visibleAssessments.filter(item => item.partial).length : '—'}</strong><span>évaluations partielles</span></article>
        <article><strong>{assessmentsKnown ? visibleAssessments.filter(item => item.status === 'needs_review').length : '—'}</strong><span>à faire valider</span></article>
        <article><strong>{assessmentsKnown ? visibleAssessments.filter(item => item.status === 'ready_to_print').length : '—'}</strong><span>prêtes à imprimer</span></article>
        <article><strong>{preparationsKnown && preparationState.preparations.length ? Math.round(validatedPreparations * 100 / preparationState.preparations.length) + '%' : '—'}</strong><span>documents validés parmi les préparations chargées</span></article>
      </>}
    </section>
    <p>Évaluations : {coverage.configuredNumericClasses} classes actives configurées du primaire/collège dans cet établissement ; préscolaire et niveaux non identifiés exclus de ce compteur numérique. Les documents validés ne prouvent pas que les cours ont été enseignés. « — » indique un chargement, une absence de périmètre ou des données indisponibles, pas zéro.</p>
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
