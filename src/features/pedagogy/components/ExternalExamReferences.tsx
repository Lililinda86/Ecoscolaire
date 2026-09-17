import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { materialCatalog } from '../resources/materialCatalog';

/** References are not tenant assessments, teacher decisions or answer keys. */
export function ExternalExamReferences() {
  const { db, currentSchool } = useAppContext();
  const [classId, setClassId] = useState(''), [subject, setSubject] = useState('');
  const [session, setSession] = useState(''), [kind, setKind] = useState('');
  const [language, setLanguage] = useState(''), [source, setSource] = useState('');
  const all = materialCatalog.filter(d => d.authority === 'GCE BOARD');
  const classes = (db?.classes || []).filter(c => c.schoolId === currentSchool?.id && c.isActive !== false && c.catalogLevelId?.includes('secondary'));
  const classroom = classes.find(c => c.id === classId);
  // A copyright or edition year is NOT an examination-session year.
  const sessionOf = (d: typeof all[number]) => d.type === 'Rapport d’examinateurs' ? d.edition.replace('Session ', '') : 'Non précisée';
  const rows = all.filter(d => (!classId || !!classroom?.catalogLevelId && d.levels.includes(classroom.catalogLevelId)) && (!subject || d.subjects.includes(subject)) && (!session || sessionOf(d) === session) && (!kind || d.type === kind) && (!language || d.language === language) && (!source || d.authority === source));
  const options = (values: string[]) => [...new Set(values)].sort().map(v => <option key={v}>{v}</option>);
  return <section className="pedagogy-card" data-testid="external-exam-references">
    <h2>Références d’examen externes — liens autorisés à consulter</h2>
    <p>Fonds distinct des évaluations internes : syllabus, spécimen et rapports d’examinateurs. Un rapport n’est ni un sujet ni un corrigé intégral. Aucun rattachement à une classe n’est inventé.</p>
    <div className="pedagogy-form-grid">
      <label>Classe ITALO<select aria-label="Classe des références externes" value={classId} onChange={e => setClassId(e.target.value)}><option value="">Toutes — y compris les références non rattachées</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Matière<select aria-label="Matière des références externes" value={subject} onChange={e => setSubject(e.target.value)}><option value="">Toutes</option>{options(all.flatMap(d => d.subjects))}</select></label>
      <label>Session documentée<select aria-label="Session des références externes" value={session} onChange={e => setSession(e.target.value)}><option value="">Toutes</option>{options(all.map(sessionOf))}</select></label>
      <label>Type<select aria-label="Type des références externes" value={kind} onChange={e => setKind(e.target.value)}><option value="">Tous</option>{options(all.map(d => d.type))}</select></label>
      <label>Langue<select aria-label="Langue des références externes" value={language} onChange={e => setLanguage(e.target.value)}><option value="">Toutes</option>{options(all.map(d => d.language))}</select></label>
      <label>Source<select aria-label="Source des références externes" value={source} onChange={e => setSource(e.target.value)}><option value="">Toutes</option>{options(all.map(d => d.authority))}</select></label>
    </div>
    <p role="status">{rows.length} référence(s) externe(s).</p>
    {rows.map(d => <details key={d.id}><summary>{d.title}</summary><p>{d.note}</p><p>{d.edition} · {d.rights} · {d.applicability}</p><a href={d.url!} target="_blank" rel="noopener noreferrer">Consulter le document sur le site GCE Board</a></details>)}
    {!rows.length && <p>Aucune référence dans ce périmètre. Choisir « Toutes » les classes permet de consulter les documents dont le rattachement ITALO reste à confirmer.</p>}
  </section>;
}
