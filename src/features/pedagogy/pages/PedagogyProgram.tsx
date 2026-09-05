import { useMemo, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { adoptCurriculumProgram } from '../services/pedagogyService';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';

export default function PedagogyProgram() {
  const { db, currentSchool, currentUser } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId) || db?.academicYears?.find(item => item.status === 'active');
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const levels = useMemo(() => [...new Set((db?.classes || []).map(item => item.catalogLevelId).filter((value): value is string => Boolean(value)))], [db?.classes]);
  const [levelId, setLevelId] = useState('');
  const [programId, setProgramId] = useState('');
  const [message, setMessage] = useState('');
  const readOnly = currentUser?.role === 'boardViewer';
  const adopt = async () => {
    if (!currentSchool?.id || !year?.id || !levelId || !programId) return;
    setMessage('Enregistrement…');
    try { await adoptCurriculumProgram({ schoolId: currentSchool.id, academicYearId: year.id, catalogLevelId: levelId, curriculumProgramId: programId }); await workspace.refresh(); setMessage('Programme adopté pour ce niveau.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Adoption impossible.'); }
  };
  return <main className="pedagogy-page">
    <PedagogyHeader title="Programme de référence" description="Adoptez une version publiée pour chaque niveau avant de générer les semaines." />
    <PedagogyNav />
    {workspace.error && <div className="pedagogy-alert pedagogy-alert--error">{workspace.error}</div>}
    <section className="pedagogy-grid">
      <article className="pedagogy-card">
        <h2>Adoption par niveau</h2><p>Année : <strong>{year?.name || 'non configurée'}</strong></p>
        <label>Niveau<select value={levelId} onChange={event => setLevelId(event.target.value)}><option value="">Choisir…</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
        <label>Programme<select value={programId} onChange={event => setProgramId(event.target.value)}><option value="">Choisir…</option>{workspace.programs.map(program => <option key={program.id} value={program.id}>{program.title} · {program.version}</option>)}</select></label>
        <button className="pedagogy-button" disabled={readOnly || !levelId || !programId} onClick={() => void adopt()}>Adopter ce programme</button>
        {readOnly && <small>Consultation seule pour le Conseil.</small>}{message && <p>{message}</p>}
      </article>
      <article className="pedagogy-card"><h2>Adoptions actives</h2>{workspace.adoptions.map(item => <div className="pedagogy-list-row" key={item.id}><div><strong>{item.catalogLevelId}</strong><small>{workspace.programs.find(program => program.id === item.curriculumProgramId)?.title || item.curriculumProgramId}</small></div><span className="pedagogy-status pedagogy-status--teacher_validated">Actif</span></div>)}{!workspace.adoptions.length && <p className="pedagogy-empty">Aucune adoption pour cette année.</p>}</article>
    </section>
    <section className="pedagogy-card"><h2>Catalogue disponible</h2>{workspace.programs.map(program => <div className="pedagogy-list-row" key={program.id}><div><strong>{program.title}</strong><small>{program.countryCode} · {program.section} · {program.sourceType === 'mock' ? 'démonstration non homologuée' : 'source officielle'}</small></div><code>{program.checksum?.slice(0, 10) || program.version}</code></div>)}</section>
  </main>;
}
