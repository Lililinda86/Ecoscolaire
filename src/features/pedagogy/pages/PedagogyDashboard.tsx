import { Link } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { StatusBadge } from '../components/StatusBadge';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';

export default function PedagogyDashboard() {
  const { db, currentSchool } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const validated = workspace.plans.filter(plan => plan.status === 'teacher_validated').length;
  const today = new Date().toISOString().slice(0, 10);
  const currentWeek = workspace.weeks.find(week => week.weekStartDate <= today && week.weekEndDate >= today);
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
    </section>
    <section className="pedagogy-card">
      <div className="pedagogy-card-title"><div><h2>À traiter</h2><p>Les planifications récentes qui attendent une action.</p></div><Link className="pedagogy-button" to="/pedagogy/planning">Ouvrir la semaine</Link></div>
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
