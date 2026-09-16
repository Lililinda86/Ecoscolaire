import { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../db/firebase';
import type { SubjectDecision, SubjectReviewRow } from './SubjectMappingReview';
import { useSubjectReview } from '../hooks/useSubjectReview';
import type { SubjectMatch } from '../services/subjectMapping';
import { documentaryRelationsFor } from '../services/subjectMapping';

const keyOf = (row: SubjectReviewRow, m: SubjectMatch) => JSON.stringify([row.classId, row.mappingVersion, m.officialSubject]);
const currentSubjectDecision = (decisions: SubjectDecision[], row: SubjectReviewRow, m: SubjectMatch) => decisions.find(d => d.classId === row.classId && d.officialSubject === m.officialSubject && d.sourceVersion === row.source.sourceVersion && d.mappingVersion === row.mappingVersion);
const decisionLabels: Record<string, string> = { APPROVED: 'Correspondance approuvée', LINK: 'Reliée par décision owner', KEEP_DISTINCT: 'Matière ITALO conservée distincte', NOT_APPLICABLE: 'Non applicable', DEFER: 'À revoir plus tard' };
interface Choice { decision: string; subjectId: string; note: string }
interface Item { row: SubjectReviewRow; mapping: SubjectMatch; choice: Choice }

export function PrimarySubjectSteps({ approvedLevels, levelsAvailable, levelsLoading }: { approvedLevels: string[]; levelsAvailable: number; levelsLoading: boolean }) {
  const scope = useSubjectReview();
  const submitting = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Choice>>({});
  const [confirmation, setConfirmation] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('');
  if (!scope) return null;
  if (scope.loading || levelsLoading) return <p role="status">Chargement de la progression primaire…</p>;
  if (scope.error) return <p role="alert">Revue des matières indisponible : {scope.error}</p>;
  const decisions = scope.decisions || [];
  const safe = scope.rows.flatMap(row => row.mappings.filter(m => m.status === 'EXACT' || m.status === 'SAFE_ALIAS').map(mapping => ({ row, mapping })));
  const ambiguous = scope.rows.flatMap(row => row.mappings.filter(m => m.status === 'AMBIGUOUS').map(mapping => ({ row, mapping })));
  const documentaryDecision = (row: SubjectReviewRow, mapping: SubjectMatch) => (scope.documentaryDecisions || []).find(d => d.classId === row.classId && d.officialSubject === mapping.officialSubject && d.sourceVersion === row.source.sourceVersion && d.mappingVersion === row.mappingVersion && d.decision === 'DOCUMENTARILY_VERIFIED');
  const documentarilyResolved = ambiguous.filter(({ row, mapping }) => {
    const stored = documentaryDecision(row, mapping), relations = documentaryRelationsFor(row.catalogLevelId, mapping);
    return stored && relations.length > 0 && relations.every(r => r.type === 'COMPONENT_OF_OFFICIAL_DOMAIN' && stored.relations.some(s => s.subjectId === r.subjectId && s.type === r.type && s.evidenceVersion === r.evidenceVersion));
  });
  const toReview = ambiguous.filter(item => !documentarilyResolved.includes(item));
  const clarified = ambiguous.filter(({ row, mapping }) => documentaryRelationsFor(row.catalogLevelId, mapping).some(r => r.type === 'COMPONENT_OF_OFFICIAL_DOMAIN')).length;
  const approved = safe.filter(({ row, mapping }) => currentSubjectDecision(decisions, row, mapping)?.decision === 'APPROVED').length;
  const resolved = ambiguous.filter(({ row, mapping }) => ['LINK', 'KEEP_DISTINCT', 'NOT_APPLICABLE'].includes(currentSubjectDecision(decisions, row, mapping)?.decision || '')).length;
  const relationContractReady = scope.rows.every(row => row.mappings.every(mapping => Array.isArray(mapping.documentaryRelations) && mapping.documentaryRelations.every(relation => relation.evidenceVersion === 'primary-documentary-relations-v1')));
  const locked = busy || uncertain || !scope.owner || !scope.schoolId || !scope.yearId || !relationContractReady;
  const submit = async () => {
    if (locked || submitting.current || !confirmation?.length) return;
    submitting.current = true;
    setBusy(true);
    try {
      await httpsCallable(functions, 'reviewCurriculumSubjectMappings')({ action: 'decide', schoolId: scope.schoolId, academicYearId: scope.yearId, confirmed: true,
        items: confirmation.map(({ row, mapping, choice }) => ({ classId: row.classId, officialSubject: mapping.officialSubject, sourceVersion: row.source.sourceVersion, mappingVersion: row.mappingVersion, expectedRevision: currentSubjectDecision(decisions, row, mapping)?.revision || 0, decision: choice.decision, subjectId: choice.subjectId || null, decisionNote: choice.note })) });
      setConfirmation(null); setSelected([]); setDrafts({}); await scope.refresh(); setMessage('Décisions documentaires enregistrées. Aucune adoption ni matière déclarée enseignée.');
    } catch (error) { setUncertain(true); setMessage((error instanceof Error ? error.message : 'Enregistrement non confirmé.') + ' Rechargez et vérifiez les décisions avant de poursuivre.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const details = (row: SubjectReviewRow) => <details><summary>Voir les détails</summary><p>Édition {row.source.edition} · PDF p. {row.source.pdfPages.join(', ')}.</p><p>sourceVersion / checksum SHA-256 : {row.source.sourceVersion}</p><p>mappingVersion : {row.mappingVersion}</p></details>;
  return <div className="primary-owner-review">
    {!relationContractReady && <p role="alert">La version documentaire du serveur n’est pas encore disponible. Consultation seule ; rechargez après la fin du déploiement.</p>}
    <div className="curriculum-review-summary" aria-label="Progression primaire" aria-live="polite"><span>NIVEAUX : {approvedLevels.length}/{levelsAvailable} validés</span><span>MAPPINGS SÛRS : {approved}/{safe.length} validés</span><span>AMBIGUÏTÉS : {resolved}/{ambiguous.length} résolues</span></div>
    <p>Secondaire : {scope.secondaryRows.reduce((total, row) => total + row.mappings.length, 0)} correspondances partielles préparées, exclues de cette revue primaire.</p>
    <section aria-label="Étape 2 — Correspondances de matières sûres"><h3>Étape 2 — CONFIRMER LES MATIÈRES ÉVIDENTES</h3>
      <p>{safe.length} correspondances documentaires sûres. Aucune sélection automatique. L’approbation ne crée ni adoption, matière enseignée, horaire, coefficient ou affectation enseignant.</p>
      {['fr-', 'en-'].map(prefix => <section key={prefix} aria-label={prefix === 'fr-' ? 'Matières sûres primaire FR' : 'Matières sûres primaire EN'}><h4>{prefix === 'fr-' ? 'Primaire FR' : 'Primaire EN'}</h4>{scope.rows.filter(row => row.catalogLevelId.startsWith(prefix)).map(row => {
        const mappings = row.mappings.filter(m => m.status === 'EXACT' || m.status === 'SAFE_ALIAS');
        return <article key={row.classId} aria-label={'Correspondances sûres — ' + row.className}><h4>{row.className}</h4><p><a href={row.source.sourceUrl} target="_blank" rel="noopener noreferrer">Source MINEDUB</a> · {mappings.length} correspondances sûres</p>
          {scope.owner && <label><input type="checkbox" aria-label={'Sélectionner les mappings sûrs — ' + row.className} disabled={locked || Boolean(confirmation)} checked={Boolean(mappings.length) && mappings.every(m => selected.includes(keyOf(row, m)))} onChange={e => setSelected(old => e.target.checked ? [...new Set([...old, ...mappings.map(m => keyOf(row, m))])] : old.filter(k => !mappings.some(m => keyOf(row, m) === k)))} />Sélectionner les correspondances de cette classe</label>}
          <p><a href={'#primary-cases-' + row.classId} onClick={event => { event.preventDefault(); document.getElementById('primary-cases-' + row.classId)?.scrollIntoView({ block: 'start' }); }}>Voir les {toReview.filter(item => item.row.classId === row.classId).length} cas à examiner — {row.className}</a></p>
          <details><summary>Voir les {mappings.length} correspondances sûres — {row.className}</summary><ul>{mappings.map(mapping => { const key = keyOf(row, mapping), existing = currentSubjectDecision(decisions, row, mapping); return <li key={key} data-testid="primary-safe-mapping">
            {scope.owner && <input type="checkbox" aria-label={'Sélectionner mapping — ' + row.className + ' — ' + mapping.officialSubject} checked={selected.includes(key)} disabled={locked || Boolean(confirmation)} onChange={e => setSelected(old => e.target.checked ? [...old, key] : old.filter(k => k !== key))} />}
            {mapping.localMatch!.name} → {mapping.officialSubject} — Forte confiance
            <details><summary>Voir les détails de la correspondance</summary>{mapping.status} — {mapping.reason}</details>
            {existing?.decision === 'APPROVED' && <p>{approvedLevels.includes(row.classId) ? 'MAPPING VALIDÉ' : 'Correspondance approuvée — validation du niveau en attente'}. Pas une matière déclarée enseignée.</p>}
          </li>; })}</ul></details>{details(row)}</article>;
      })}</section>)}
      {scope.owner && <button type="button" disabled={locked || !selected.length || Boolean(confirmation)} onClick={() => setConfirmation(safe.filter(({ row, mapping }) => selected.includes(keyOf(row, mapping))).map(item => ({ ...item, choice: { decision: 'APPROVED', subjectId: '', note: '' } })))}>APPLIQUER LES CORRESPONDANCES SÛRES SÉLECTIONNÉES</button>}
    </section>
    <section aria-label="Étape 3 — Décisions nécessaires"><h3>Étape 3 — RÉSOUDRE LES CAS À EXAMINER</h3><p>{ambiguous.length} cas initiaux : {clarified} avec une relation de composante documentée. {documentarilyResolved.length} dossiers documentaires enregistrés sans question locale supplémentaire ; {toReview.length} situations restent à examiner. « À revoir plus tard » reste en attente. Aucune option n’est préchoisie.</p>
      {documentarilyResolved.length > 0 && <details><summary>Relations documentaires enregistrées — {documentarilyResolved.length} dossiers</summary><p>Composantes démontrées, pas équivalences EXACT ni matières déclarées enseignées. Enregistrement système sous autorisation explicite de la propriétaire.</p>{documentarilyResolved.map(({ row, mapping }) => <article key={keyOf(row, mapping)}><h4>{row.className} — {mapping.officialSubject}</h4><ul>{documentaryDecision(row, mapping)!.relations.map(r => <li key={r.subjectId}>{r.subjectName} → {mapping.officialSubject} — COMPONENT_OF_OFFICIAL_DOMAIN · PDF p. {r.pdfPages.join(', ')}</li>)}</ul>{details(row)}</article>)}</details>}
      {toReview.map(({ row, mapping }) => {
        const key = keyOf(row, mapping), choice = drafts[key] || { decision: '', subjectId: '', note: '' }, existing = currentSubjectDecision(decisions, row, mapping);
        const change = (patch: Partial<Choice>) => setDrafts(old => ({ ...old, [key]: { ...choice, ...patch } }));
        return <article key={key} id={toReview.find(item => item.row.classId === row.classId)?.mapping === mapping ? 'primary-cases-' + row.classId : undefined} data-testid="primary-ambiguous-mapping" aria-label={'Décision nécessaire — ' + row.className + ' — ' + mapping.officialSubject}>
          <h4>{row.className} — {mapping.officialSubject}</h4><p>Matière ITALO : {mapping.candidates.map(c => c.name).join(' / ') || 'À établir'}</p><p>Domaine officiel : {mapping.officialSubject}</p>
          <ul>{documentaryRelationsFor(row.catalogLevelId, mapping).map(relation => <li key={relation.subjectId}><strong>{relation.subjectName}</strong> — {relation.type === 'COMPONENT_OF_OFFICIAL_DOMAIN' ? documentaryDecision(row, mapping)?.relations.some(r => r.subjectId === relation.subjectId) ? 'Composante documentaire enregistrée ; aucune déclaration d’enseignement' : 'Composante documentée, enregistrement en attente' : 'Périmètre ITALO à préciser'}<p>{relation.explanation}</p><details><summary>Voir les détails de cette relation</summary>{relation.type} · PDF p. {relation.pdfPages.join(', ')} · {relation.evidenceVersion}</details></li>)}</ul><p>Options : relier une matière candidate si son périmètre convient ; sinon la conserver distincte, déclarer le domaine non applicable ou reporter. Aucun choix proposé n’est une validation.</p>
          <p><a href={row.source.sourceUrl} target="_blank" rel="noopener noreferrer">Source MINEDUB — {row.source.title}</a></p>
          <p>Décision actuelle : {existing ? decisionLabels[existing.decision] : 'En attente'}</p>{existing?.decisionNote && <p>{existing.decisionNote}</p>}
          {existing?.decision === 'LINK' && approvedLevels.includes(row.classId) && <p>MAPPING VALIDÉ — lien documentaire limité à la relation décidée, pas une matière déclarée enseignée.</p>}
          {scope.owner && <fieldset disabled={locked || Boolean(confirmation)}><legend>Votre décision — {row.className} — {mapping.officialSubject}</legend>
            <label>Décision<select aria-label={'Décision ambiguë — ' + row.className + ' — ' + mapping.officialSubject} value={choice.decision} onChange={e => change({ decision: e.target.value, subjectId: '' })}><option value="">Choisir…</option><option value="LINK">A. RELIER À CE DOMAINE</option><option value="KEEP_DISTINCT">B. CONSERVER COMME MATIÈRE ITALO DISTINCTE</option><option value="NOT_APPLICABLE">C. NON APPLICABLE</option><option value="DEFER">D. À REVOIR PLUS TARD</option></select></label>
            {['LINK', 'KEEP_DISTINCT'].includes(choice.decision) && <label>Matière ITALO concernée<select aria-label={'Matière candidate — ' + row.className + ' — ' + mapping.officialSubject} value={choice.subjectId} onChange={e => change({ subjectId: e.target.value })}><option value="">Choisir la matière…</option>{mapping.candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            <label>Justification<textarea aria-label={'Justification ambiguë — ' + row.className + ' — ' + mapping.officialSubject} maxLength={2000} value={choice.note} onChange={e => change({ note: e.target.value })} /></label>
            <button type="button" disabled={!choice.decision || !choice.note.trim() || ['LINK', 'KEEP_DISTINCT'].includes(choice.decision) && !choice.subjectId} onClick={() => setConfirmation([{ row, mapping, choice: { ...choice, note: choice.note.trim() } }])}>Examiner et confirmer la décision</button>
          </fieldset>}{details(row)}
        </article>;
      })}
    </section>
    {!scope.owner && <p>Consultation seule : décisions réservées au rôle owner.</p>}
    {message && <p role="status">{message}</p>}
    {confirmation && <div role="dialog" aria-modal="true" aria-label="Confirmer les correspondances sélectionnées" className="curriculum-review-confirm"><h3>Récapitulatif</h3><p>{new Set(confirmation.map(i => i.row.classId)).size} classe(s) · {confirmation.length} correspondance(s)</p>
      <ul>{confirmation.map(({ row, mapping, choice }) => <li key={keyOf(row, mapping)}>{row.className} — {mapping.officialSubject} → {choice.subjectId ? mapping.candidates.find(c => c.id === choice.subjectId)?.name : mapping.localMatch?.name || 'Sans lien local'} — {decisionLabels[choice.decision]}{choice.note && <p>{choice.note}</p>}{details(row)}</li>)}</ul>
      {confirmation.every(item => item.choice.decision === 'APPROVED') && <p>0 ambiguïté incluse · 0 horaire · 0 coefficient · 0 adoption automatique.</p>}
      <p>Correspondance documentaire uniquement. Aucune adoption, matière enseignée, affectation, horaire ou coefficient.</p><button type="button" disabled={locked} onClick={() => void submit()}>CONFIRMER LES DÉCISIONS DE MATIÈRES</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button>
    </div>}
  </div>;
}
