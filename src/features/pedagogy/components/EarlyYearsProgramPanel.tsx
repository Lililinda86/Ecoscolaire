import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../../context/AppContext';
import { earlyYearsActivities, earlyYearsLevels, earlyYearsTemplate, proposeEarlyYearsProgression } from '../resources/earlyYearsProgram';
import '../pedagogy-print.css';

export function EarlyYearsProgramPanel({ weeks = [] }: { weeks?: Array<{ id: string; weekStartDate: string }> }) {
  const { db, currentSchool } = useAppContext();
  const [levelId, setLevelId] = useState(''), [worked, setWorked] = useState<string[]>([]), [printId, setPrintId] = useState('');
  const classes = (db?.classes || []).filter(c => c.schoolId === currentSchool?.id && c.isActive !== false && earlyYearsLevels.some(l => l.id === c.catalogLevelId));
  const selected = classes.find(c => c.catalogLevelId === levelId);
  const activities = earlyYearsActivities(selected?.catalogLevelId || '');
  const progression = proposeEarlyYearsProgression(selected?.catalogLevelId || '', weeks, worked);
  const printActivity = activities.find(a => a.id === printId);
  const exportTemplate = (activity: typeof activities[number]) => {
    const text = earlyYearsTemplate(activity).map(([label, value]) => label + '\n' + value).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = activity.id + '-template.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="pedagogy-card" data-testid="early-years-program">
    <div className="no-print">
      <h2>Préscolaire — domaines, activités et acquis observables</h2>
      <p><strong>ITALO_EARLY_YEARS_PROGRAM · proposition locale à relire</strong></p>
      <p>Les domaines sont référencés aux curricula MINEDUB FR et EN. Les activités et la progression sont des propositions originales ITALO, pas un programme ministériel adopté ni des activités déjà réalisées. Aucune équivalence officielle de niveau n’est déduite.</p>
      <label>Niveau préscolaire ITALO<select value={selected ? levelId : ''} onChange={e => { setLevelId(e.target.value); setWorked([]); setPrintId(''); }}><option value="">Choisir une classe configurée</option>{classes.map(c => <option key={c.id} value={c.catalogLevelId}>{c.name}</option>)}</select></label>
      {!classes.length && <p>Aucun niveau préscolaire actif dans cet établissement. Aucune classe créée automatiquement.</p>}
      {selected && <>
        <p>{activities.length} domaines / propositions pour {selected.name}. {levelId.endsWith('-pre') ? 'Découverte et développement, sans attentes de fin de maternelle.' : levelId.endsWith('-ps') || levelId.endsWith('-1') ? 'Acquisition initiale par le jeu et la répétition.' : levelId.endsWith('-ms') || levelId.endsWith('-2') ? 'Consolidation et extension des expériences.' : 'Consolidation et transition progressive vers le primaire, sans notation imposée.'}</p>
        {activities.map(activity => <details key={activity.id} className="pedagogy-template-section" lang={activity.language}>
          <summary>{activity.domain} — {activity.title}</summary>
          <dl><dt>Objectif</dt><dd>{activity.objective}</dd><dt>Acquis observable</dt><dd>{activity.observable}</dd><dt>Activité</dt><dd>{activity.activity}</dd><dt>Matériel</dt><dd>{activity.materials}</dd><dt>Consolidation / remédiation proposée</dt><dd>{activity.support}</dd></dl>
          <p>{activity.safety}</p>
          <p><a href={activity.domainReference.url} target="_blank" rel="noopener noreferrer">Domaine MINEDUB {activity.language.toUpperCase()} — édition 2018, PDF pp. 5–6</a>. Cette référence ne certifie pas l’activité locale.</p>
          <details><summary>Modèle de préparation préscolaire complet</summary>{earlyYearsTemplate(activity).map(([label, value]) => <p key={label}><strong>{label}</strong><br />{value}</p>)}</details>
          <div className="pedagogy-actions"><button onClick={() => exportTemplate(activity)}>Exporter le modèle {activity.language.toUpperCase()}</button><button onClick={() => { setPrintId(activity.id); window.setTimeout(() => window.print(), 100); }}>Imprimer le modèle A4</button></div>
          <details><summary>Voir les détails de provenance</summary><p>Version ITALO {activity.version} · {activity.verificationStatus} · {activity.humanReviewStatus}</p><p style={{ overflowWrap: 'anywhere' }}>SHA-256 source : {activity.domainReference.checksum}</p><p>Équivalence de niveau officiel : non établie. Durée : à définir par l’enseignant. Aucun horaire, coefficient ou enseignant affecté.</p></details>
        </details>)}
        <details><summary>Proposer une progression selon les semaines disponibles</summary>
          <p>Simulation locale, non enregistrée comme enseignement. Répéter et consolider ; adapter aux observations, au rythme de la classe et à l’accord enseignant. Les cases ci-dessous ne créent aucune preuve d’activité réalisée.</p>
          {activities.map(activity => <label key={activity.id}><input type="checkbox" checked={worked.includes(activity.id)} onChange={e => setWorked(current => e.target.checked ? [...current, activity.id] : current.filter(id => id !== activity.id))} /> À reprendre pour consolidation dans cette simulation : {activity.title}</label>)}
          {!weeks.length && <p>Ouvrir la planification avec une année et ses semaines configurées pour situer ces propositions dans le calendrier.</p>}
          {progression.length > 0 && <ol>{progression.map(item => <li key={item.id}>{item.weekStartDate} — {item.activity.title} — {item.mode === 'DISCOVER' ? 'découverte proposée' : 'reprise et consolidation proposées'}</li>)}</ol>}
        </details>
        <p>L’enseignant prépare et remet sa fiche ; la secrétaire importe PDF/JPEG/PNG, relit et valide. La réalisation reste une déclaration distincte. <Link to="/pedagogy/preparations/import">Importer la préparation reçue</Link> · <Link to="/pedagogy/assessments">Bilan hebdomadaire</Link> · <Link to="/pedagogy/observations">Observations</Link> · <Link to="/pedagogy/follow-up">Acquis et remédiation</Link></p>
      </>}
    </div>
    {printActivity && <section className="pedagogy-a4 assessment-paper" lang={printActivity.language}>
      <h2>{printActivity.title}</h2><p>{selected?.name} · ITALO_EARLY_YEARS_PROGRAM</p>
      <p className="assessment-watermark">{printActivity.language === 'fr' ? 'PROPOSITION — À ADAPTER ET RELIRE PAR L’ENSEIGNANT' : 'PROPOSAL — TEACHER ADAPTATION AND REVIEW REQUIRED'}</p>
      {earlyYearsTemplate(printActivity).map(([label, value]) => <article className="assessment-question" key={label}><h3>{label}</h3><p>{value}</p></article>)}
    </section>}
  </section>;
}
