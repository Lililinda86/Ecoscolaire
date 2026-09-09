import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../db/firebase';
import { useScopedResource } from '../hooks/useScopedResource';
import type { SubjectMatch, proposeDocumentaryProgression } from '../services/subjectMapping';
import type { StructuredReviewExcerpt } from '../resources/minedubVerified';
import { minedubSubjectIndex } from '../resources/minedubSubjectIndex';

interface Row {
  classId: string; className: string; catalogLevelId: string; mappings: SubjectMatch[]; safeCount: number;
  ambiguousCount: number; missingCount: number; mappingVersion: string; status: string;
  progressionSuggestions: ReturnType<typeof proposeDocumentaryProgression>;
  source: { title: string; sourceUrl: string; pdfPages: number[]; edition: string; sourceVersion: string; units: (StructuredReviewExcerpt & { catalogLevelId: string })[] };
}
interface SecondaryRow { classId: string; className: string; coverage: string; mappings: SubjectMatch[]; sources: { officialSubject: string; sources: { documentId: string; title: string; sourceUrl: string; sourceVersion: string; locator: string; note: string }[] }[] }
interface State { rows: Row[]; secondaryRows: SecondaryRow[]; loading: boolean; error: string | null; refresh: () => Promise<void>; schoolId?: string; yearId?: string; owner: boolean }
const Context = createContext<State | null>(null);
const empty: { rows: Row[]; secondaryRows: SecondaryRow[] } = { rows: [], secondaryRows: [] };
export function SubjectMappingProvider({ schoolId, yearId, owner, children }: { schoolId?: string; yearId?: string; owner: boolean; children: ReactNode }) {
  const load = useCallback(async () => {
    if (!schoolId || !yearId) return empty;
    const response = await httpsCallable<unknown, typeof empty>(functions, 'reviewCurriculumSubjectMappings')({ action: 'preview', schoolId, academicYearId: yearId });
    if (!Array.isArray(response.data?.rows) || !Array.isArray(response.data?.secondaryRows)) throw new Error('Réponse de propositions invalide.');
    return response.data;
  }, [schoolId, yearId]);
  const resource = useScopedResource(schoolId && yearId ? JSON.stringify([schoolId, yearId]) : null, empty, load, 'Lecture des propositions de matières impossible.');
  return <Context.Provider value={{ ...resource.data, loading: resource.loading, error: resource.error, refresh: resource.refresh, schoolId, yearId, owner }}>{children}</Context.Provider>;
}

export function OtherSubjectReferences({ classId, levelId }: { classId: string; levelId: string }) {
  const scope = useContext(Context);
  if (!scope) return null;
  const nursery = /preschool|nursery/.test(levelId);
  if (nursery) {
    const source = minedubSubjectIndex.find(s => s.documentId === (levelId.startsWith('fr-') ? 'minedub-fr-nursery' : 'minedub-en-nursery'))!;
    return <details><summary>Domaines MINEDUB — repères pour un programme local</summary><p>Domaines disponibles, sans établir une équivalence officielle de ce niveau ITALO. Les propositions conditionnelles et ITALO_EARLY_YEARS_PROGRAM restent inchangés.</p><ul>{source.names.map(name => <li key={name}>{name}</li>)}</ul><p>Source : {source.documentId}, sommaire PDF {source.pdfPages.join(', ')}. Aucune application automatique.</p></details>;
  }
  if (scope.loading) return <p>Chargement des correspondances disciplinaires partielles…</p>;
  if (scope.error) return <p>{scope.error}</p>;
  const row = scope.secondaryRows.find(r => r.classId === classId);
  if (!row) return null;
  return <details><summary>Matières secondaires documentées — couverture partielle</summary><p>PARTIAL_OFFICIAL_COVERAGE — aucune application autorisée tant que le corpus et les séries/options locales sont incomplets.</p>
    {!row.mappings.length && <p>Aucun corpus disciplinaire authentifié suffisant pour ce niveau.</p>}
    <ul>{row.mappings.map(m => <li key={m.officialSubject}><strong>{m.officialSubject}</strong> → {m.localMatch?.name || m.candidates.map(c => c.name).join(' / ') || 'Matière locale non établie'}<br />{m.status} — application désactivée
      {row.sources.find(s => s.officialSubject === m.officialSubject)?.sources.map(s => <p key={s.documentId}><a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{s.title}</a><br />{s.locator}<br />{s.note}<br />SHA-256 : {s.sourceVersion}</p>)}
    </li>)}</ul>
  </details>;
}

export function SubjectMappingReview({ classId }: { classId: string }) {
  const scope = useContext(Context);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  if (!scope) return null;
  const row = scope.rows.find(r => r.classId === classId);
  if (scope.loading) return <p>Chargement des matières proposées…</p>;
  if (scope.error) return <p role="status">{scope.error}</p>;
  if (!row) return null;
  const locked = busy || uncertain || !scope.owner || !scope.schoolId || !scope.yearId;
  const apply = async () => {
    if (locked) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'reviewCurriculumSubjectMappings')({ action: 'apply', schoolId: scope.schoolId, academicYearId: scope.yearId, classId, expectedVersion: row.mappingVersion, confirmed: true });
      setConfirm(false); await scope.refresh(); setMessage('Correspondances sûres enregistrées comme propositions. Aucune adoption ni publication de programme.');
    } catch (error) { setUncertain(true); setMessage((error instanceof Error ? error.message : 'Échec.') + ' Rechargez avant de réessayer.'); }
    finally { setBusy(false); }
  };
  return <section id={'subject-mapping-' + classId} aria-label={'Matières proposées — ' + row.className} className="subject-mapping-review">
    <h5>MATIÈRES PROPOSÉES POUR ITALO</h5>
    <p>{row.source.title} — édition {row.source.edition}</p>
    <p>{row.mappings.length} matières/domaines officiels identifiés · {row.safeCount} correspondances sûres · {row.ambiguousCount} à confirmer · {row.missingCount} sans matière locale</p>
    <p>Catalogue documentaire ≠ matières enseignées. Ces propositions ne changent ni la décision de niveau, ni l’adoption, ni les programmes publiés.</p>
    <details><summary>Voir les matières — {row.className}</summary>
      <ul>{row.mappings.map(m => <li key={m.officialSubject}>
        <strong>{m.officialSubject}</strong><br />
        → {m.localMatch?.name || (m.candidates.length ? m.candidates.map(c => c.name).join(' / ') : 'Aucune matière locale établie')}
        <br />{m.status} — {m.action}<br />{m.reason}
        {m.referenceCandidates.length > 0 && <p>Entrée de référence déjà disponible : ne pas créer de doublon. Son utilisation locale reste à valider.</p>}
      </li>)}</ul>
      <p><a href={row.source.sourceUrl} target="_blank" rel="noopener noreferrer">Source MINEDUB</a> — sommaire PDF {row.source.pdfPages.join(', ')}</p>
      <p>Version source : {row.source.sourceVersion}<br />Version mapping : {row.mappingVersion}</p>
      <h6>Unités structurées disponibles — couverture partielle</h6>
      <ul>{row.source.units.filter(u => u.catalogLevelId === row.catalogLevelId).map(u => <li key={u.id}><strong>{u.subject} — {u.officialLesson || u.officialUnit || u.domain}</strong><br />{u.objectiveParaphrase}<br />{u.competencyParaphrase}<br />PDF p. {u.sourcePdfPage} — {u.sourceLocator}<br />Validation pédagogique requise. Aucun horaire attribué.</li>)}</ul>
    </details>
    <p>État : {row.status === 'proposed' ? 'PROPOSÉ — non adopté, non publié' : row.status === 'not_applied' ? 'NON APPLIQUÉ' : row.status}</p>
    {row.progressionSuggestions.length > 0 && <details><summary>Progression proposée — extraits partiels uniquement</summary><p>Suggestion à ajuster par l’enseignant, pas progression annuelle complète. Aucun cours déclaré enseigné ni créneau horaire créé.</p><ul>{row.progressionSuggestions.map(u => <li key={u.curriculumUnitId}>{u.weekStartDate || 'Calendrier ITALO requis'} — {u.objective} — PDF p. {u.sourcePage}</li>)}</ul></details>}
    {message && <p role="status">{message}</p>}
    {scope.owner ? <button type="button" disabled={locked || !row.safeCount || row.status !== 'not_applied'} onClick={() => setConfirm(true)}>APPLIQUER LES CORRESPONDANCES SÛRES — {row.className}</button> : <p>Consultation seule : application réservée au rôle owner.</p>}
    {confirm && <div role="dialog" aria-modal="true" aria-label={'Confirmer les matières — ' + row.className} className="curriculum-review-confirm">
      <h5>{row.className} — récapitulatif</h5>
      <ul>{row.mappings.filter(m => m.localMatch).map(m => <li key={m.officialSubject}>{m.officialSubject} → {m.localMatch!.name}</li>)}</ul>
      <p>{row.ambiguousCount + row.missingCount} matières exclues. Enregistrement de propositions uniquement : aucun horaire, coefficient, caractère obligatoire ou adoption.</p>
      <button type="button" disabled={locked} onClick={() => void apply()}>CONFIRMER LES CORRESPONDANCES SÛRES</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>Annuler</button>
    </div>}
  </section>;
}
