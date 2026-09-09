import { useCallback, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db as firestore, functions } from '../../../db/firebase';
import { useAppContext } from '../../../context/AppContext';
import { useScopedResource } from '../hooks/useScopedResource';
import { readBoundedDocuments } from '../services/boundedQuery';
import { curriculumReviewProposals } from '../resources/curriculumReviewManifest';
import './curriculumProposalReview.css';
import { SubjectMappingProvider, SubjectMappingReview, OtherSubjectReferences } from './SubjectMappingReview';
import { PrimarySubjectSteps } from './PrimarySubjectSteps';

type Proposal = typeof curriculumReviewProposals[number];
type Decision = 'APPROVED' | 'REQUEST_CHANGE' | 'NOT_APPLICABLE';
export interface ProposalDecision { id: string; schoolId: string; academicYearId: string; classId: string; proposalId: string; sourceVersion: string; mappingVersion: string; revision: number; decision: Decision; decidedBy: string; decidedAt?: { seconds: number }; decisionNote: string }
interface Row { classId: string; className: string; proposal: Proposal }
const empty: ProposalDecision[] = [];
const labels = { APPROVED: 'APPROUVÉE', REQUEST_CHANGE: 'CORRECTION DEMANDÉE', NOT_APPLICABLE: 'NON APPLICABLE' };
const currentProposalDecision = (decisions: ProposalDecision[], row: Row) => decisions.find(d => d.classId === row.classId && d.proposalId === row.proposal.id && d.sourceVersion === row.proposal.sourceVersion && d.mappingVersion === row.proposal.mappingVersion);

export function CurriculumProposalReview({ yearId }: { yearId?: string }) {
  const { db, currentSchool, currentUser } = useAppContext();
  const schoolId = currentSchool?.id;
  return <SubjectMappingProvider key={JSON.stringify([schoolId, yearId, currentUser?.id, currentUser?.role])} schoolId={schoolId} yearId={yearId} owner={currentUser?.role === 'owner'}><ReviewScope schoolId={schoolId} yearId={yearId} owner={currentUser?.role === 'owner'} rows={(db?.classes || []).filter(c => c.schoolId === schoolId && c.isActive !== false).flatMap(c => {
    const proposal = curriculumReviewProposals.find(p => p.catalogLevelId === c.catalogLevelId);
    return proposal ? [{ classId: c.id, className: c.name, proposal }] : [];
  })} /></SubjectMappingProvider>;
}

export function ReviewScope({ schoolId, yearId, owner, rows }: { schoolId?: string; yearId?: string; owner: boolean; rows: Row[] }) {
  const load = useCallback(() => schoolId && yearId ? readBoundedDocuments<ProposalDecision>(query(collection(firestore, 'curriculumProposalReviews'), where('schoolId', '==', schoolId)), 2000, 'Décisions documentaires').then(data => data.filter(d => d.schoolId === schoolId && d.academicYearId === yearId)) : Promise.resolve(empty), [schoolId, yearId]);
  const resource = useScopedResource(schoolId && yearId ? JSON.stringify([schoolId, yearId]) : null, empty, load, 'Lecture des décisions impossible.');
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, '' | Decision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<Array<{ row: Row; decision: Decision; note: string }> | null>(null);
  const [groupNote, setGroupNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const decisions = rows.map(row => currentProposalDecision(resource.data, row));
  const primary = rows.filter(row => row.proposal.highConfidence);
  const approvedLevels = resource.error || resource.loading ? [] : primary.filter(row => currentProposalDecision(resource.data, row)?.decision === 'APPROVED').map(row => row.classId);
  const locked = !owner || busy || resource.loading || Boolean(resource.error) || uncertain || !yearId || !schoolId;
  const submit = async () => {
    if (locked || !confirmation?.length) return;
    setBusy(true);
    try {
      await httpsCallable(functions, 'recordCurriculumProposalDecisions')({ schoolId, academicYearId: yearId, requestId: crypto.randomUUID(), confirmed: true,
        items: confirmation.map(({ row, decision, note }) => ({ classId: row.classId, proposalId: row.proposal.id, sourceVersion: row.proposal.sourceVersion, mappingVersion: row.proposal.mappingVersion, expectedRevision: currentProposalDecision(resource.data, row)?.revision || 0, decision, decisionNote: note })) });
      setConfirmation(null); setSelected([]); setDrafts({}); setNotes({}); setGroupNote('');
      await resource.refresh(); setMessage('Décision enregistrée. Correspondance uniquement : aucune adoption ni authentification modifiée.');
    } catch (error) { setUncertain(true); setMessage((error instanceof Error ? error.message : 'Échec de la décision.') + ' Rechargez cette page et vérifiez les décisions avant toute nouvelle saisie.'); }
    finally { setBusy(false); }
  };
  return <section aria-label="Validation du référentiel" className="curriculum-review pedagogy-card">
    <h2>Validation du référentiel</h2>
    <p>Revue des correspondances documentaires, pas adoption globale d’un curriculum. Une approbation ne certifie ni l’applicabilité actuelle ni les matières locales. Aucune décision n’est précochée.</p>
    <div className="curriculum-review-summary" aria-label="Synthèse des propositions" aria-live="polite">
      <span>{rows.length} classes actives</span><span>{rows.filter(r => r.proposal.highConfidence).length} propositions forte confiance</span><span>{rows.filter(r => !r.proposal.highConfidence).length} à examiner</span>
      {!resource.loading && !resource.error && schoolId && yearId ? <><span>{decisions.filter(d => d?.decision === 'APPROVED').length} approuvées</span><span>{decisions.filter(d => d?.decision === 'REQUEST_CHANGE').length} corrections demandées</span><span>{decisions.filter(d => d?.decision === 'NOT_APPLICABLE').length} non applicables</span><span>{decisions.filter(d => !d).length} décisions en attente</span>
      <span>{rows.filter((r, i) => r.proposal.missingSource && decisions[i]?.decision !== 'NOT_APPLICABLE').length} en attente de source officielle suffisante</span></> : <span>Compteurs de décisions indisponibles jusqu’à lecture confirmée.</span>}
    </div>
    <p>Les cas à examiner incluent les rattachements préscolaires conditionnels. L’attente de source suffisante inclut les dossiers partiels et programmes locaux, pas uniquement l’absence de PDF.</p>
    {resource.loading && <p role="status">Chargement des décisions…</p>}
    {(resource.error || message) && <p role="status">{resource.error || message}</p>}
    {!owner && <p>Consultation seule : les décisions sont réservées à la propriétaire (owner).</p>}
    <section aria-label="Étape 1 — Valider les niveaux"><h3>Étape 1 — Valider les niveaux</h3>
      <p>{primary.length} rattachements primaires à forte confiance. Sélectionnez uniquement les niveaux que vous souhaitez approuver.</p>
      {primary.map(row => <article key={row.classId} data-testid="primary-level-review"><h4>{row.className} → {row.proposal.program}</h4><p>Forte confiance — {row.proposal.rationale}</p>
        <p>{row.proposal.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title} </a>)}</p>
        <p>État : {resource.loading || resource.error ? 'Lecture non confirmée' : currentProposalDecision(resource.data, row)?.decision === 'APPROVED' ? 'NIVEAU VALIDÉ' : 'À valider'}</p>
        {owner && <label><input type="checkbox" aria-label={'Sélectionner niveau — ' + row.className} checked={selected.includes(row.classId)} disabled={locked || Boolean(confirmation)} onChange={e => setSelected(v => e.target.checked ? [...new Set([...v, row.classId])] : v.filter(id => id !== row.classId))} />Sélectionner ce niveau</label>}
        <details><summary>Voir les détails</summary><p>{row.proposal.sources.map(s => s.detail).join(' ; ')}</p><p>sourceVersion : {row.proposal.sourceVersion}</p><p>mappingVersion : {row.proposal.mappingVersion}</p></details>
      </article>)}
    {owner && <fieldset disabled={locked}><legend>Approbation des niveaux sélectionnés</legend>
      <p>{selected.length} sélectionnée(s). Aucune sélection automatique.</p>
      <label>Note de décision groupée<textarea maxLength={2000} value={groupNote} onChange={e => setGroupNote(e.target.value)} /></label>
      <button type="button" disabled={!selected.length || !groupNote.trim()} onClick={() => setConfirmation(rows.filter(r => r.proposal.highConfidence && selected.includes(r.classId)).map(row => ({ row, decision: 'APPROVED', note: groupNote.trim() })))}>APPROUVER LES NIVEAUX SÉLECTIONNÉS</button>
    </fieldset>}
    </section>
    <PrimarySubjectSteps approvedLevels={approvedLevels} levelsAvailable={primary.length} levelsLoading={resource.loading || Boolean(resource.error)} />
    <p>Préscolaire : {rows.filter(r => /preschool|nursery/.test(r.proposal.catalogLevelId)).length} niveaux, prochaine revue séparée avec les réserves existantes. Secondaire : correspondances partielles conservées, aucune application groupée.</p>
    {confirmation && <div role="dialog" aria-modal="true" aria-label="Confirmer les décisions" className="curriculum-review-confirm">
      <h3>Confirmer les décisions</h3><p>Vérifiez chaque classe et la version avant enregistrement. Les anciennes décisions restent dans l’historique.</p>
      <p>{confirmation.length} niveau(x) sélectionné(s).</p><ul>{confirmation.map(({ row, decision, note }) => <li key={row.classId}>{row.proposal.name} — {labels[decision]} — {note}<details><summary>Voir les détails</summary>Source : {row.proposal.sourceVersion}<br />Correspondance : {row.proposal.mappingVersion}</details></li>)}</ul>
      <button type="button" disabled={locked} onClick={() => void submit()}>CONFIRMER L’ENREGISTREMENT</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button>
    </div>}
    <details><summary>Dossiers documentaires complets — 34 niveaux et revues séparées</summary>
    {[...new Set(curriculumReviewProposals.map(p => p.group))].map(group => <section key={group} aria-label={group}><h3>{group}</h3>
      {rows.filter(r => r.proposal.group === group).sort((a, b) => Number(b.proposal.highConfidence) - Number(a.proposal.highConfidence) || Number(a.proposal.missingSource) - Number(b.proposal.missingSource) || a.proposal.id.localeCompare(b.proposal.id)).map(row => {
        const p = row.proposal, existing = currentProposalDecision(resource.data, row);
        return <article key={row.classId} data-testid={'proposal-' + p.id} className="curriculum-review-proposal">
          <h4>{p.id} — {p.name}</h4><p>RECOMMANDATION : <strong>{p.recommendation}</strong></p>
          <p>{p.highConfidence ? 'Forte confiance — correspondance classe/niveau uniquement.' : p.missingSource ? 'À examiner — approbation indisponible tant que la source est insuffisante.' : 'À examiner individuellement — document présent, équivalence locale conditionnelle à confirmer par la propriétaire.'}</p>
          {owner && p.highConfidence && <label><input type="checkbox" aria-label={'Sélectionner ' + p.id} checked={selected.includes(row.classId)} disabled={locked || Boolean(confirmation)} onChange={e => setSelected(v => e.target.checked ? [...v, row.classId] : v.filter(id => id !== row.classId))} />Sélectionner pour approbation groupée</label>}
          <dl><dt>CLASSE ITALO</dt><dd>{row.className}</dd><dt>SECTION</dt><dd>{p.section}</dd><dt>SOUS-SYSTÈME</dt><dd>{p.subsystem}</dd><dt>NIVEAU LOCAL</dt><dd>{p.localLevel}</dd><dt>PROGRAMME PROPOSÉ</dt><dd>{p.program}</dd><dt>AUTORITÉ</dt><dd>{p.authority}</dd><dt>STATUT D’AUTHENTIFICATION</dt><dd>{p.sources.length ? p.authentication : 'Aucune source officielle suffisante pour ce rattachement local.'}</dd></dl>
          <details><summary>Documents, couverture et justification — {p.id}</summary>
            <h5>DOCUMENT / VERSION / SOURCE</h5>{p.sources.map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a><br />{s.detail}</p>)}{!p.sources.length && <p>Source officielle manquante pour le programme proposé.</p>}
            <dl><dt>MATIÈRES / DOMAINES COUVERTS</dt><dd>{p.covered}</dd><dt>MATIÈRES / DOMAINES MANQUANTS</dt><dd>{p.missing}</dd><dt>CORRESPONDANCES CERTAINES</dt><dd>{p.certain}</dd><dt>CORRESPONDANCES À CONFIRMER</dt><dd>{p.uncertain}</dd><dt>JUSTIFICATION</dt><dd>{p.rationale}</dd><dt>DATE DOCUMENTAIRE</dt><dd>{p.sourceDate} — constats locaux historiques ITALO, pas inventaire en temps réel.</dd><dt>sourceVersion</dt><dd>{p.sourceVersion}</dd><dt>mappingVersion</dt><dd>{p.mappingVersion}</dd></dl>
          </details>
          {p.highConfidence && <SubjectMappingReview classId={row.classId} />}
          {!p.highConfidence && <OtherSubjectReferences classId={row.classId} levelId={p.catalogLevelId} />}
          <p>Décision humaine actuelle : <strong>{resource.loading || resource.error || !yearId ? 'LECTURE NON CONFIRMÉE' : existing ? labels[existing.decision] : 'EN ATTENTE'}</strong></p>
          {existing && <p>Par {existing.decidedBy} — {existing.decidedAt ? new Date(existing.decidedAt.seconds * 1000).toLocaleString() : 'date serveur en cours'} — {existing.decisionNote} (révision {existing.revision})</p>}
          {resource.data.some(d => d.classId === row.classId && d.mappingVersion !== p.mappingVersion) && <p>Une décision existe sur une ancienne version ; elle ne vaut pas validation de cette proposition.</p>}
          {owner && <fieldset disabled={locked || Boolean(confirmation)}><legend>Décision humaine — {p.id}</legend>
            <label>Choix — {p.id}<select aria-label={'Choix — ' + p.id} value={drafts[row.classId] || ''} onChange={e => setDrafts(v => ({ ...v, [row.classId]: e.target.value as Decision | '' }))}><option value="">Choisir une décision…</option><option value="APPROVED" disabled={p.missingSource || !p.sources.length}>APPROUVER</option><option value="REQUEST_CHANGE">DEMANDER CORRECTION</option><option value="NOT_APPLICABLE">NON APPLICABLE</option></select></label>
            <label>Note — {p.id}<textarea aria-label={'Note — ' + p.id} maxLength={2000} value={notes[row.classId] || ''} onChange={e => setNotes(v => ({ ...v, [row.classId]: e.target.value }))} /></label>
            <button type="button" disabled={!drafts[row.classId] || !notes[row.classId]?.trim()} onClick={() => setConfirmation([{ row, decision: drafts[row.classId] as Decision, note: notes[row.classId].trim() }])}>Enregistrer la décision — {p.id}</button>
          </fieldset>}
        </article>;
      })}
    </section>)}
    </details>
  </section>;
}
