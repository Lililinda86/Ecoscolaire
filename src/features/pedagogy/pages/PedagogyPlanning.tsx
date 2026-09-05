import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { StatusBadge } from '../components/StatusBadge';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import {
  ensureTeachingPlanDraft, ensureTeachingWeeks, generateTeachingPlanProposal, loadTeachingPlanItems,
  recordTeacherPlanValidation, saveTeachingPlanAdjustments
} from '../services/pedagogyService';
import type { TeachingPlanItem } from '../types';
import { canEditTeachingPlan, canValidateTeachingPlan } from '../validators';
import { getClassOptionLabel } from '../../../utils/classCatalog';

export default function PedagogyPlanning() {
  const { db, currentSchool, currentUser } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const [classId, setClassId] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const [items, setItems] = useState<TeachingPlanItem[]>([]);
  const [teacherStaffId, setTeacherStaffId] = useState('');
  const [message, setMessage] = useState('');
  const readOnly = currentUser?.role === 'boardViewer';
  const plan = workspace.plans.find(item => item.classId === classId && item.weekStartDate === weekStartDate);
  const planId = plan?.id || '';
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const teachers = useMemo(() => (db?.staff || []).filter(item => item.active !== false && item.status !== 'inactive'), [db?.staff]);

  useEffect(() => {
    if (!currentSchool?.id || !planId) return;
    void loadTeachingPlanItems(currentSchool.id, planId).then(setItems).catch(error => setMessage(error instanceof Error ? error.message : 'Séances indisponibles.'));
  }, [currentSchool?.id, planId]);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage('Traitement…');
    try { await task(); await workspace.refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Opération impossible.'); }
  };
  const initialize = () => currentSchool?.id && year?.id && run(() => ensureTeachingWeeks(currentSchool.id, year.id), 'Semaines prêtes.');
  const createProposal = async () => {
    if (!currentSchool?.id || !year?.id || !classId || !weekStartDate) return;
    const draft = await ensureTeachingPlanDraft({ schoolId: currentSchool.id, academicYearId: year.id, classId, weekStartDate });
    await generateTeachingPlanProposal(currentSchool.id, draft.planId);
  };
  const save = () => currentSchool?.id && plan && run(
    () => saveTeachingPlanAdjustments(currentSchool.id, plan.id, items.map(({ id, lessonTitle, objective, note }) => ({ id, lessonTitle, objective, note }))),
    'Ajustements enregistrés.'
  );
  const validate = () => currentSchool?.id && plan && teacherStaffId && run(
    () => recordTeacherPlanValidation(currentSchool.id, plan.id, teacherStaffId, 'Déclaration de validation enseignant enregistrée par le secrétariat.'),
    'Validation enseignant enregistrée.'
  );

  return <main className="pedagogy-page">
    <PedagogyHeader title="Planification hebdomadaire" description="Générez une proposition déterministe, ajustez les séances puis consignez la validation de l’enseignant." />
    <PedagogyNav />
    {(workspace.error || message) && <div className={`pedagogy-alert${workspace.error ? ' pedagogy-alert--error' : ''}`}>{workspace.error || message}</div>}
    <section className="pedagogy-toolbar">
      <label>Classe<select value={classId} onChange={event => { setClassId(event.target.value); setItems([]); }}><option value="">Choisir…</option>{classes.map(item => <option key={item.id} value={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label>
      <label>Semaine<select value={weekStartDate} onChange={event => { setWeekStartDate(event.target.value); setItems([]); }}><option value="">Choisir…</option>{workspace.weeks.map(item => <option key={item.id} value={item.weekStartDate}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
      <button className="pedagogy-button pedagogy-button--secondary" disabled={readOnly || !year} onClick={() => void initialize()}>Initialiser les semaines</button>
      <button className="pedagogy-button" disabled={readOnly || !classId || !weekStartDate} onClick={() => void run(createProposal, 'Proposition générée.')}>{plan ? 'Regénérer la proposition' : 'Créer la proposition'}</button>
    </section>
    <div className="pedagogy-alert">Progression planifiée uniquement — la progression réalisée sera alimentée par le Lot B.</div>
    {plan && <section className="pedagogy-card">
      <div className="pedagogy-card-title"><div><h2>{classes.find(item => item.id === plan.classId)?.name || plan.classId}</h2><p>Semaine {plan.weekNumber}, du {plan.weekStartDate} au {plan.weekEndDate}</p></div><StatusBadge status={plan.status} /></div>
      {plan.teacherValidated && <p className="pedagogy-alert">Validation de l’enseignant enregistrée par la secrétaire</p>}
      <div className="pedagogy-schedule">
        {items.map((item, index) => <article key={item.id}>
          <div className="pedagogy-slot">{['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'][item.dayIndex]} · Créneau {item.slotIndex}</div><strong>{item.subjectName}</strong>
          <input aria-label={`Leçon ${item.subjectName}`} disabled={readOnly || !canEditTeachingPlan(plan.status)} value={item.lessonTitle} onChange={event => setItems(current => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, lessonTitle: event.target.value } : candidate))} />
          <textarea aria-label={`Objectif ${item.subjectName}`} disabled={readOnly || !canEditTeachingPlan(plan.status)} value={item.objective} onChange={event => setItems(current => current.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, objective: event.target.value } : candidate))} />
        </article>)}
      </div>
      <div className="pedagogy-actions">
        <button className="pedagogy-button pedagogy-button--secondary" disabled={readOnly || !items.length || !canEditTeachingPlan(plan.status)} onClick={() => void save()}>Enregistrer les ajustements</button>
        <label>Enseignant ayant validé<select value={teacherStaffId} onChange={event => setTeacherStaffId(event.target.value)}><option value="">Choisir…</option>{teachers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="pedagogy-button" disabled={readOnly || !teacherStaffId || !canValidateTeachingPlan(plan.status)} onClick={() => void validate()}>Consigner sa validation</button>
      </div>
    </section>}
    {!plan && classId && weekStartDate && <div className="pedagogy-empty pedagogy-card">Aucune planification pour cette classe et cette semaine.</div>}
  </main>;
}
