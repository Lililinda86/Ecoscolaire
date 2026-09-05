import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { PreparationStatus } from '../components/PreparationStatus';
import { useLessonPreparations } from '../hooks/useLessonPreparations';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';

export default function PedagogyMissingPreparations() {
  const { db, currentSchool } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const [classId, setClassId] = useState('');
  const [weekStartDate, setWeekStartDate] = useState('');
  const selectedClassId = classId || classes[0]?.id || '';
  const selectedWeekStartDate = weekStartDate || workspace.weeks[0]?.weekStartDate || '';
  const state = useLessonPreparations(currentSchool?.id, year?.id, selectedWeekStartDate, selectedClassId);
  const missing = state.preparations.filter(item => item.status === 'expected');
  return <main className="pedagogy-page">
    <PedagogyHeader title="Préparations manquantes" description="Liste bornée par année, classe et semaine des séances attendues sans document déposé." />
    <PedagogyNav />
    {state.error && <div className="pedagogy-alert pedagogy-alert--error">{state.error}</div>}
    <section className="pedagogy-toolbar">
      <label>Classe<select value={selectedClassId} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Semaine<select value={selectedWeekStartDate} onChange={event => setWeekStartDate(event.target.value)}>{workspace.weeks.map(item => <option key={item.id} value={item.weekStartDate}>S{item.weekNumber} · {item.weekStartDate}</option>)}</select></label>
      <Link className="pedagogy-button pedagogy-button--secondary" to="/pedagogy/preparations">Retour au suivi</Link>
    </section>
    <section className="pedagogy-card" aria-busy={state.loading}>
      <div className="pedagogy-card-title"><div><h2>{missing.length} document(s) manquant(s)</h2><p>Une préparation est manquante tant qu’aucun original immuable n’a été déposé.</p></div></div>
      {missing.map(item => <div className="pedagogy-list-row" key={item.id}><div><strong>{item.subjectName}</strong><small>{item.lessonTitle || 'Leçon à préciser'} · créneau {item.slotIndex || '—'}</small></div><div className="pedagogy-row-actions"><PreparationStatus status={item.status} /><Link to={`/pedagogy/preparations/import?id=${encodeURIComponent(item.id)}`}>Déposer</Link></div></div>)}
      {!state.loading && !missing.length && <p className="pedagogy-empty">Aucune préparation manquante sur ce périmètre.</p>}
    </section>
  </main>;
}
