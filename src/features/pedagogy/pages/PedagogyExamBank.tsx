import { useCallback, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { AssessmentPrint } from '../components/AssessmentPrint';
import { useScopedResource } from '../hooks/useScopedResource';
import { loadInternalExamBank } from '../services/examBank';
import { loadAssessmentItems } from '../services/pedagogyService';
import { localEducationStage } from '../../../../functions/src/pedagogy/pedagogyPolicy';
import type { AssessmentItem, WeeklyAssessment } from '../types';
const emptyEntries: WeeklyAssessment[] = [], emptyItems: AssessmentItem[] = [];

function Entry({ assessment, language, yearLabel }: { assessment: WeeklyAssessment; language: 'fr' | 'en'; yearLabel: string }) {
  const { currentSchool } = useAppContext();
  const load = useCallback(() => loadAssessmentItems(assessment.schoolId, assessment.id, assessment.generationVersion), [assessment]);
  const state = useScopedResource(JSON.stringify([assessment.schoolId, assessment.id, assessment.generationVersion, assessment.contentRevision]), emptyItems, load, 'Questions indisponibles.');
  const [mode, setMode] = useState<'student' | 'correction'>('student');
  const items = state.data.filter(item => item.schoolId === assessment.schoolId && item.weeklyAssessmentId === assessment.id && item.generationVersion === assessment.generationVersion);
  const printable = !state.loading && !state.error && items.length > 0 && items.reduce((sum, item) => sum + item.points, 0) === assessment.totalPoints;
  return <section className="pedagogy-card">
    <h2>{assessment.title || assessment.className} — {assessment.fridayDate}</h2>
    <p>Création interne de cet établissement ; validation enregistrée pour la révision {assessment.generationVersion}.{assessment.contentRevision || 0}. Ni examen officiel, ni corrigé authentifié d’un organisme externe. Une nouvelle utilisation exige une nouvelle vérification de la classe, du programme et des notions enseignées.</p>
    <p>Provenance : {assessment.sourcePreparationIds?.length || 0} préparation(s) référencée(s). {assessment.partial ? 'Couverture partielle enregistrée.' : 'La couverture affichée concerne uniquement les sources de cette évaluation.'}</p>
    <label>Exemplaire<select aria-label="Exemplaire de la banque" value={mode} onChange={event => setMode(event.target.value as 'student' | 'correction')}><option value="student">Sujet élève</option><option value="correction">Corrigé interne — réservé au personnel habilité</option></select></label>
    <button disabled={!printable} onClick={() => window.print()}>Imprimer / enregistrer en PDF A4</button>
    {state.error && <p role="alert">{state.error}</p>}
    {state.loading && <p role="status">Chargement des questions…</p>}
    {!state.loading && !state.error && !printable && <p role="alert">Questions absentes ou barème incohérent : impression indisponible.</p>}
    {printable && <AssessmentPrint school={currentSchool} assessment={assessment} items={items} mode={mode} sourceChanged={true} language={language} academicYearLabel={yearLabel} />}
  </section>;
}

function BankScope({ schoolId, yearId, classId, language, yearLabel }: { schoolId: string; yearId: string; classId: string; language: 'fr' | 'en'; yearLabel: string }) {
  const load = useCallback(() => loadInternalExamBank(schoolId, yearId, classId), [schoolId, yearId, classId]);
  const state = useScopedResource(JSON.stringify([schoolId, yearId, classId]), emptyEntries, load, 'Banque indisponible.');
  const [search, setSearch] = useState(''), [subject, setSubject] = useState(''), [page, setPage] = useState(0), [selectedId, setSelectedId] = useState('');
  const subjects = [...new Map(state.data.flatMap(item => item.coveredSubjects || []).map(item => [item.id, item.name])).entries()];
  const filtered = state.data.filter(item => (!subject || item.coveredSubjects.some(value => value.id === subject)) &&
    [item.title, item.fridayDate, ...item.coveredSubjects.map(value => value.name)].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selected = filtered.find(item => item.id === selectedId);
  return <>
    <section className="pedagogy-card">
      <label>Recherche titre, matière ou date<input aria-label="Recherche banque" value={search} onChange={event => { setSearch(event.target.value); setPage(0); setSelectedId(''); }} /></label>
      <label>Matière<select aria-label="Matière banque" value={subject} onChange={event => { setSubject(event.target.value); setPage(0); setSelectedId(''); }}><option value="">Toutes</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      {state.loading ? <p role="status">Chargement de la banque…</p> : state.error ? <p role="alert">{state.error}</p> : <p role="status">{filtered.length} épreuve(s) interne(s) validée(s), {language.toUpperCase()}. Les brouillons et révisions invalidées sont exclus.</p>}
      {filtered.slice(page * 25, (page + 1) * 25).map(item => <div className="pedagogy-list-row" key={item.id}><span>{item.title || item.className} · {item.fridayDate} · v{item.generationVersion}.{item.contentRevision || 0}</span><button onClick={() => setSelectedId(item.id)}>Consulter</button></div>)}
      <div className="pedagogy-row-actions"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button><span>Page {page + 1}</span><button disabled={(page + 1) * 25 >= filtered.length} onClick={() => setPage(page + 1)}>Suivant</button></div>
      {!state.loading && !state.error && !filtered.length && <p>Aucune épreuve interne validée dans ce périmètre. Aucune épreuve ni validation ne sera inventée pour remplir la banque.</p>}
    </section>
    {selected && <Entry key={selected.id + ':' + selected.generationVersion + ':' + selected.contentRevision} assessment={selected} language={language} yearLabel={yearLabel} />}
  </>;
}

export default function PedagogyExamBank() {
  const { db, currentSchool } = useAppContext();
  const [yearId, setYearId] = useState(''), [classId, setClassId] = useState('');
  const years = (db?.academicYears || []).filter(item => item.schoolId === currentSchool?.id);
  const classes = (db?.classes || []).filter(item => item.schoolId === currentSchool?.id && ['primary', 'secondary'].includes(localEducationStage(item)));
  const year = years.find(item => item.id === yearId) || years.find(item => item.id === currentSchool?.activeAcademicYearId) || years[0];
  const classroom = classes.find(item => item.id === classId) || classes[0];
  return <main className="pedagogy-page">
    <PedagogyHeader title="Banque d’épreuves internes" description="Consulter les évaluations validées de l’établissement, par année, classe et matière. Aucun appel IA, aucune modification ni validation automatique." /><PedagogyNav />
    <p>Cette banque ne contient pas d’annales officielles intégrées. Les droits des sujets externes restent à vérifier. Le préscolaire utilise les activités et observations, sans épreuves numériques imposées.</p>
    <section className="pedagogy-card pedagogy-filters"><label>Année<select aria-label="Année banque" value={year?.id || ''} onChange={event => setYearId(event.target.value)}>{years.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Classe / section<select aria-label="Classe banque" value={classroom?.id || ''} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label></section>
    {currentSchool && year && classroom ? <BankScope key={JSON.stringify([currentSchool.id, year.id, classroom.id])} schoolId={currentSchool.id} yearId={year.id} classId={classroom.id} language={classroom.type === 'anglophone' ? 'en' : 'fr'} yearLabel={year.name} /> : <p>Sélectionnez un établissement disposant d’une année et d’une classe primaire/collège.</p>}
  </main>;
}
