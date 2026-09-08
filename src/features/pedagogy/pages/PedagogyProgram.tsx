import { useMemo, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { adoptCurriculumProgram } from '../services/pedagogyService';
import { usePedagogyWorkspace } from '../hooks/usePedagogyWorkspace';
import { curriculumProvenanceLabel, curriculumProvenanceLink } from '../services/curriculumProvenance';
import { CurriculumCoverage } from '../components/CurriculumCoverage';

export default function PedagogyProgram() {
  const { db, currentSchool } = useAppContext();
  const years = db?.academicYears?.filter(item => item.schoolId === currentSchool?.id) || [];
  const year = years.find(item => item.id === currentSchool?.activeAcademicYearId) || years.find(item => item.status === 'active');
  return <ProgramScope key={JSON.stringify([currentSchool?.id, year?.id])} yearId={year?.id} />;
}

function ProgramScope({ yearId }: { yearId?: string }) {
  const { db, currentSchool, currentUser } = useAppContext();
  const year = db?.academicYears?.find(item => item.id === yearId && item.schoolId === currentSchool?.id);
  const workspace = usePedagogyWorkspace(currentSchool?.id, year?.id);
  const levels = useMemo(() => [...new Set((db?.classes || []).filter(item => item.schoolId === currentSchool?.id && item.isActive !== false).map(item => item.catalogLevelId).filter((value): value is string => Boolean(value)))], [db?.classes, currentSchool?.id]);
  const [levelId, setLevelId] = useState('');
  const [programId, setProgramId] = useState('');
  const [message, setMessage] = useState('');
  const [decisionBy, setDecisionBy] = useState('');
  const [decisionDate, setDecisionDate] = useState('');
  const [decisionReference, setDecisionReference] = useState('');
  const [received, setReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const readOnly = currentUser?.role === 'boardViewer';
  const selectedProgram = workspace.programs.find(program => program.id === programId);
  const adopt = async () => {
    if (!currentSchool?.id || !year?.id || !levels.includes(levelId) || !selectedProgram || busy || uncertain || !received || readOnly) return;
    setBusy(true);
    setMessage('Enregistrement…');
    try {
      await adoptCurriculumProgram({ schoolId: currentSchool.id, academicYearId: year.id, catalogLevelId: levelId, curriculumProgramId: programId,
        expectedRevision: workspace.adoptions.find(item => item.catalogLevelId === levelId)?.revision || 0,
        expectedProgramVersion: selectedProgram.version, declarationReceived: received, decisionBy, decisionDate, decisionReference });
      setReceived(false); await workspace.refresh(); setMessage('Décision reçue enregistrée. Cette adoption ne certifie pas la source documentaire.');
    } catch (error) { setUncertain(true); setMessage((error instanceof Error ? error.message : 'Adoption impossible.') + ' Rechargez et vérifiez l’état avant toute nouvelle saisie.'); }
    finally { setBusy(false); }
  };
  return <main className="pedagogy-page">
    <PedagogyHeader title="Programme de référence" description="Consignez la décision reçue pour une version du catalogue. Publication et adoption ne prouvent pas son authenticité." />
    <PedagogyNav />
    <CurriculumCoverage yearId={yearId} programs={workspace.programs} adoptions={workspace.adoptions} unavailable={workspace.loading || Boolean(workspace.error)} />
    {workspace.error && <div className="pedagogy-alert pedagogy-alert--error">{workspace.error}</div>}
    <section className="pedagogy-grid">
      <article className="pedagogy-card">
        <h2>Adoption par niveau</h2><p>Année : <strong>{year?.name || 'non configurée'}</strong></p>
        <fieldset disabled={readOnly || busy || uncertain || workspace.loading || Boolean(workspace.error)}>
        <label>Niveau<select value={levelId} onChange={event => { setLevelId(event.target.value); setReceived(false); }}><option value="">Choisir…</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
        <label>Programme<select value={programId} onChange={event => { setProgramId(event.target.value); setReceived(false); }}><option value="">Choisir…</option>{workspace.programs.map(program => <option key={program.id} value={program.id}>{program.title} · {program.version}</option>)}</select></label>
        <label>Auteur de la décision reçue<input value={decisionBy} maxLength={150} onChange={event => { setDecisionBy(event.target.value); setReceived(false); }} /></label>
        <label>Date de la décision<input type="date" value={decisionDate} onChange={event => { setDecisionDate(event.target.value); setReceived(false); }} /></label>
        <label>Référence ou note de transmission<textarea value={decisionReference} maxLength={1000} onChange={event => { setDecisionReference(event.target.value); setReceived(false); }} /></label>
        <label><input type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} />Je confirme avoir reçu cette décision pour ce niveau et cette version.</label>
        <button className="pedagogy-button" disabled={!year || !levels.includes(levelId) || !selectedProgram || !received || !decisionBy.trim() || !decisionDate || !decisionReference.trim()} onClick={() => void adopt()}>Enregistrer la décision d’adoption</button>
        </fieldset>
        {uncertain && <button className="pedagogy-button" onClick={() => window.location.reload()}>Recharger et vérifier l’état</button>}
        {readOnly && <small>Consultation seule pour le Conseil.</small>}{message && <p>{message}</p>}
      </article>
      <article className="pedagogy-card"><h2>Adoptions actives</h2>{workspace.adoptions.filter(item => item.status === 'active').map(item => <div className="pedagogy-list-row" key={item.id}><div><strong>{item.catalogLevelId}</strong><small>{workspace.programs.find(program => program.id === item.curriculumProgramId)?.title || item.curriculumProgramId}</small><small>{item.decision ? `Décision déclarée : ${item.decision.declaredBy} · ${item.decision.effectiveDate} · révision ${item.revision}` : 'Adoption historique : décision reçue non documentée dans ce format.'}</small></div><span className="pedagogy-status">Actif — pas un visa de source</span></div>)}{!workspace.adoptions.length && !workspace.loading && !workspace.error && <p className="pedagogy-empty">Aucune adoption pour cette année.</p>}</article>
    </section>
    <section className="pedagogy-card"><h2>Catalogue disponible</h2><p>La publication dans le catalogue ne certifie pas à elle seule l’authenticité documentaire, les droits de réutilisation ou la couverture du programme.</p>{workspace.programs.map(program => <div className="pedagogy-list-row" key={program.id}><div><strong>{program.title}</strong><small>{program.countryCode} · {program.section} · {curriculumProvenanceLabel(program.sourceType)}</small>{curriculumProvenanceLink(program.provenance?.sourceUrl) && <a href={curriculumProvenanceLink(program.provenance?.sourceUrl)!} target="_blank" rel="noopener noreferrer">Voir la provenance déclarée</a>}</div><code>{program.checksum?.slice(0, 10) || program.version}</code></div>)}</section>
  </main>;
}
