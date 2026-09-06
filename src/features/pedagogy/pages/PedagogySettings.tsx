import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db as firestore, functions } from '../../../db/firebase';
import { useAppContext } from '../../../context/AppContext';
import { getClassOptionLabel } from '../../../utils/classCatalog';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { defaultPedagogyPolicy, type PedagogyPolicy } from '../../../../functions/src/pedagogy/pedagogyPolicy';

export default function PedagogySettings() {
  const { db, currentSchool, currentUser } = useAppContext();
  const classes = useMemo(() => (db?.classes || []).filter(item => item.isActive !== false), [db?.classes]);
  const [classId, setClassId] = useState('');
  const classroom = classes.find(item => item.id === classId) || classes[0];
  const year = db?.academicYears?.find(item => item.id === currentSchool?.activeAcademicYearId);
  const canEdit = ['superAdmin', 'owner', 'director'].includes(currentUser?.role || '');
  return <main className="pedagogy-page">
    <PedagogyHeader title="Paramètres pédagogiques" description="La direction définit le format et les seuils futurs. Chaque document conserve sa politique d’origine." /><PedagogyNav />
    <section className="pedagogy-toolbar"><label>Classe<select value={classroom?.id || ''} onChange={event => setClassId(event.target.value)}>{classes.map(item => <option value={item.id} key={item.id}>{getClassOptionLabel(item, classes)}</option>)}</select></label></section>
    {currentSchool && year && classroom ? <ClassPolicyEditor key={`${currentSchool.id}:${year.id}:${classroom.id}`} schoolId={currentSchool.id} academicYearId={year.id} classId={classroom.id} initial={defaultPedagogyPolicy(classroom)} canEdit={canEdit} /> : <p>Une classe et une année active configurée sont nécessaires.</p>}
  </main>;
}

function ClassPolicyEditor({ schoolId, academicYearId, classId, initial, canEdit }: { schoolId: string; academicYearId: string; classId: string; initial: PedagogyPolicy; canEdit: boolean }) {
  const [policy, setPolicy] = useState(initial), [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const saving = useRef(false);
  useEffect(() => {
    let alive = true;
    void getDocs(query(collection(firestore, 'pedagogyClassPolicies'), where('schoolId', '==', schoolId), where('academicYearId', '==', academicYearId), where('classId', '==', classId), limit(2))).then(result => {
      if (!alive) return;
      if (result.size > 1) throw new Error('Configuration ambiguë : plusieurs politiques pour cette classe.');
      if (!result.empty) { setPolicy(result.docs[0].data().policy as PedagogyPolicy); setVersion(Number(result.docs[0].data().version)); }
      setLoaded(true);
    }).catch(error => { if (alive) setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); });
    return () => { alive = false; };
  }, [schoolId, academicYearId, classId]);
  const preschool = ['pre_nursery', 'preschool'].includes(policy.stage);
  const setStage = (stage: PedagogyPolicy['stage']) => setPolicy(current => ({ ...current, stage, ...(['pre_nursery', 'preschool'].includes(stage) ? { assessmentMode: 'observation', totalPoints: null } : {}) }));
  const setMastery = (field: keyof PedagogyPolicy['mastery'], value: number) => setPolicy(current => ({ ...current, mastery: { ...current.mastery, [field]: value } }));
  const save = async () => {
    if (saving.current || !loaded || !canEdit) return;
    saving.current = true; setBusy(true);
    try {
      const result = await httpsCallable<unknown, { version: number }>(functions, 'savePedagogyClassPolicy')({ schoolId, academicYearId, classId, expectedVersion: version, policy });
      setVersion(result.data.version); setMessage('Nouvelle politique enregistrée. Les évaluations et observations antérieures restent inchangées.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé. Rechargez avant de reprendre.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="pedagogy-card">
    <p>{version ? `Politique enregistrée — version ${version}` : 'Valeurs proposées par le logiciel — aucune politique scolaire encore enregistrée.'} Le classement local des niveaux ne certifie aucune équivalence avec un curriculum officiel.</p>
    {!canEdit && <p>Consultation seule : la modification relève de la direction.</p>}
    {message && <p role="status" className="pedagogy-alert">{message}</p>}
    <fieldset disabled={!loaded || !canEdit || busy}>
      <label>Cycle pédagogique<select value={policy.stage} disabled={initial.stage !== 'unknown'} onChange={event => setStage(event.target.value as PedagogyPolicy['stage'])}><option value="unknown">À préciser</option><option value="pre_nursery">Prématernelle / Pre-Nursery</option><option value="preschool">Maternelle / Nursery</option><option value="primary">Primaire / Primary</option><option value="secondary">Secondaire / Secondary</option></select></label>
      <label>Langue du contenu<select value={policy.language} onChange={event => setPolicy(current => ({ ...current, language: event.target.value as 'fr' | 'en' }))}><option value="fr">Français</option><option value="en">English</option></select></label>
      <label>Format<select value={policy.assessmentMode} disabled={preschool} onChange={event => { const assessmentMode = event.target.value as PedagogyPolicy['assessmentMode']; setPolicy(current => ({ ...current, assessmentMode, totalPoints: assessmentMode === 'observation' ? null : 20 })); }}><option value="observation">Observations sans note</option><option value="numeric">Évaluation avec barème</option></select></label>
      {policy.assessmentMode === 'numeric' && <label>Total du barème<input type="number" min="1" max="100" step="0.01" value={policy.totalPoints ?? 20} onChange={event => setPolicy(current => ({ ...current, totalPoints: Number(event.target.value) }))} /></label>}
      <label>Durée proposée (minutes)<input type="number" min="10" max="300" value={policy.durationMinutes} onChange={event => setPolicy(current => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label>
      <h2>Prudence des synthèses de progression</h2>
      <p>Aucune maîtrise n’est déduite d’une seule note, d’un classement global ou d’un objectif sans rattachement explicite à une compétence.</p>
      <label>Nombre minimal de preuves indépendantes<input type="number" min="2" max="20" value={policy.mastery.minimumEvidence} onChange={event => setMastery('minimumEvidence', Number(event.target.value))} /></label>
      <label>Nombre minimal de dates distinctes<input type="number" min="2" max="20" value={policy.mastery.minimumDistinctDates} onChange={event => setMastery('minimumDistinctDates', Number(event.target.value))} /></label>
      {policy.assessmentMode === 'numeric' && <><label>Seuil acquis (%)<input type="number" min="1" max="100" value={policy.mastery.acquiredThreshold} onChange={event => setMastery('acquiredThreshold', Number(event.target.value))} /></label><label>Seuil en cours (%)<input type="number" min="0" max="99" value={policy.mastery.developingThreshold} onChange={event => setMastery('developingThreshold', Number(event.target.value))} /></label></>}
      {canEdit && <button className="pedagogy-button" disabled={policy.stage === 'unknown'} onClick={() => void save()}>Enregistrer une nouvelle version</button>}
    </fieldset>
  </section>;
}
