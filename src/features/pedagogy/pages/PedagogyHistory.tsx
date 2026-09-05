import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { StatusBadge } from '../components/StatusBadge';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { archiveTeachingPlan } from '../services/pedagogyService';
import { canArchiveTeachingPlan } from '../validators';

export default function PedagogyHistory() {
  const { db, currentSchool, currentUser } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const [status, setStatus] = useState('all');
  const [message, setMessage] = useState('');
  const plans = workspace.plans.filter(plan => status === 'all' || plan.status === status);
  const archive = async (planId: string) => {
    if (!currentSchool?.id) return;
    try { await archiveTeachingPlan(currentSchool.id, planId); await workspace.refresh(); setMessage('Planification archivée.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Archivage impossible.'); }
  };
  return <main className="pedagogy-page">
    <PedagogyHeader title="Historique des planifications" description="Retrouvez les versions hebdomadaires et archivez uniquement celles déjà validées." />
    <PedagogyNav />
    {(workspace.error || message) && <div className={`pedagogy-alert${workspace.error ? ' pedagogy-alert--error' : ''}`}>{workspace.error || message}</div>}
    <section className="pedagogy-card">
      <div className="pedagogy-card-title"><div><h2>{year?.name || 'Année non active'}</h2><p>{plans.length} planification(s)</p></div><label>Statut<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tous</option><option value="draft">Brouillon</option><option value="proposed">Proposé</option><option value="adjusted">Ajusté</option><option value="teacher_validated">Validé</option><option value="archived">Archivé</option></select></label></div>
      {plans.map(plan => <div className="pedagogy-list-row" key={plan.id}><div><strong>{db?.classes.find(item => item.id === plan.classId)?.name || plan.classId}</strong><small>Semaine {plan.weekNumber} · {plan.weekStartDate} · version {plan.version}</small></div><div className="pedagogy-row-actions"><StatusBadge status={plan.status} />{currentUser?.role !== 'boardViewer' && canArchiveTeachingPlan(plan.status) && <button className="pedagogy-link-button" onClick={() => void archive(plan.id)}>Archiver</button>}</div></div>)}
      {!plans.length && <p className="pedagogy-empty">Aucune planification pour ce filtre.</p>}
    </section>
  </main>;
}
