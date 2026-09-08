import { useCallback, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../db/firebase';
import { useScopedResource } from '../hooks/useScopedResource';
import { readBoundedDocuments } from '../services/boundedQuery';

interface Watch {
  id: string; slot: number; title: string; url: string; intervalMinutes: number;
  enabled: boolean; version: number; status?: string; lastError?: string;
  pendingReview?: boolean; fingerprint?: { sha256: string; finalUrl: string } | null;
  lastSuccessAt?: { toDate: () => Date } | null;
  lastReview?: { note: string };
}
const empty: Watch[] = [];
const statusLabel: Record<string, string> = {
  not_checked: 'Jamais vérifiée', baseline: 'Première empreinte enregistrée',
  unchanged: 'Empreinte inchangée lors du dernier contrôle', file_changed: 'Fichier modifié : examen humain nécessaire',
  failed: 'Dernier contrôle en échec : fraîcheur non vérifiée',
};
export function SourceWatchConfiguration({ schoolId, canEdit }: { schoolId: string; canEdit: boolean }) {
  const load = useCallback(() => readBoundedDocuments<Watch>(query(collection(db, 'pedagogySourceWatches'), where('schoolId', '==', schoolId)), 10, 'Sources surveillées'), [schoolId]);
  const resource = useScopedResource(schoolId, empty, load, 'Veille indisponible.');
  const [slot, setSlot] = useState(1), [dirty, setDirty] = useState(false), [reloadVersion, setReloadVersion] = useState(0);
  const reload = async () => { await resource.refresh(); setReloadVersion(value => value + 1); };
  const watch = resource.data.find(item => item.slot === slot);
  return <section className="pedagogy-card">
    <h2>Veille des sources documentaires</h2>
    <p>Une empreinte détecte un changement de fichier, pas un nouveau programme officiel. Aucun contenu n’est adopté ou publié automatiquement. La provenance, les droits et la validation pédagogique restent à vérifier.</p>
    {resource.error && <p role="alert">{resource.error}</p>}
    <label>Emplacement de veille<select aria-label="Emplacement de veille" disabled={dirty || resource.loading} value={slot} onChange={event => setSlot(Number(event.target.value))}>
      {Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} - {resource.data.find(item => item.slot === value)?.title || 'Non configuré'}</option>)}
    </select></label>
    {!resource.loading && !resource.error && <WatchEditor key={schoolId + ':' + slot + ':' + (watch?.version || 0) + ':' + reloadVersion} schoolId={schoolId} slot={slot} watch={watch} canEdit={canEdit} onDirty={setDirty} onSaved={reload} />}
  </section>;
}
function WatchEditor({ schoolId, slot, watch, canEdit, onDirty, onSaved }: {
  schoolId: string; slot: number; watch?: Watch; canEdit: boolean; onDirty: (value: boolean) => void; onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(watch?.title || ''), [url, setUrl] = useState(watch?.url || '');
  const [enabled, setEnabled] = useState(watch?.enabled || false), [intervalMinutes, setInterval] = useState(watch?.intervalMinutes || 1440);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('');
  const [reviewNote, setReviewNote] = useState(''), [reviewReceived, setReviewReceived] = useState(false);
  const [configurationDirty, setConfigurationDirty] = useState(false);
  const changed = () => { setConfigurationDirty(true); onDirty(true); };
  const save = async () => {
    if (busy || !canEdit || uncertain || reviewNote || reviewReceived) return;
    setBusy(true); onDirty(true);
    try {
      await httpsCallable(functions, 'savePedagogySourceWatch')({ schoolId, slot, title, url, enabled, intervalMinutes, expectedVersion: watch?.version || 0 });
      onDirty(false); await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé.');
      setUncertain(true);
    } finally { setBusy(false); }
  };
  const reload = async () => { if (busy) return; onDirty(false); await onSaved(); };
  const recordReview = async () => {
    if (!watch || !canEdit || busy || uncertain || configurationDirty || !reviewReceived || !reviewNote.trim()) return;
    setBusy(true); onDirty(true);
    try {
      await httpsCallable(functions, 'recordPedagogySourceWatchReview')({ schoolId, slot, expectedVersion: watch.version, expectedSha256: watch.fingerprint?.sha256, declarationReceived: true, note: reviewNote });
      onDirty(false); await onSaved();
    } catch { setMessage('Examen non confirmé.'); setUncertain(true); }
    finally { setBusy(false); }
  };
  return <div>
    <p>{watch ? statusLabel[watch.status || 'not_checked'] || 'État à vérifier' : 'Aucune source configurée.'}</p>
    {watch && <p>Veille {watch.enabled ? 'activée' : 'désactivée'} - version {watch.version}. Dernier contrôle réussi : {watch.lastSuccessAt?.toDate ? watch.lastSuccessAt.toDate().toLocaleString('fr-FR') : 'aucun'}.</p>}
    {watch?.pendingReview && <p role="status">Un changement reste à examiner. Une empreinte ultérieure inchangée ne vaut pas validation de ce changement.</p>}
    {watch?.lastReview && <p>Dernier examen consigné : {watch.lastReview.note}. Aucune publication ni adoption de curriculum effectuée.</p>}
    {canEdit && watch?.pendingReview && watch.fingerprint && watch.status !== 'failed' && <fieldset disabled={busy || uncertain}>
      <legend>Consigner l’examen du changement de fichier</legend>
      <p>Cette trace ne certifie ni la source, ni ses droits, ni une validation pédagogique. Publication et adoption restent des décisions séparées.</p>
      <label>Note d’examen<textarea aria-label="Note d’examen" maxLength={1000} value={reviewNote} onChange={event => { setReviewNote(event.target.value); onDirty(true); }} /></label>
      <label><input type="checkbox" checked={reviewReceived} onChange={event => { setReviewReceived(event.target.checked); onDirty(true); }} /> L’examen de cette version du fichier a effectivement été reçu.</label>
      {configurationDirty && <p>Enregistrez ou rechargez la configuration avant de consigner l’examen.</p>}
      <button className="pedagogy-button" disabled={configurationDirty || !reviewReceived || !reviewNote.trim() || busy || uncertain} onClick={() => void recordReview()}>Consigner l’examen du fichier</button>
    </fieldset>}
    {watch?.lastError && <p role="alert">Contrôle impossible : {watch.lastError}. La source n’est pas déclarée à jour.</p>}
    {watch?.fingerprint && <details><summary>Empreinte du dernier contrôle réussi</summary><code style={{ overflowWrap: 'anywhere' }}>{watch.fingerprint.sha256}</code></details>}
    {!canEdit && <p>Consultation secrétaire ; configuration réservée à la direction.</p>}
    <fieldset disabled={!canEdit || busy || uncertain}>
      <label>Titre de la source<input aria-label="Titre de la source" maxLength={150} value={title} onChange={event => { setTitle(event.target.value); changed(); }} /></label>
      <label>Adresse publique HTTPS<input aria-label="Adresse publique HTTPS" type="url" value={url} onChange={event => { setUrl(event.target.value); changed(); }} /></label>
      <p>Domaines autorisés : MINEDUB, MINESEC et CEDUC. Leur présence dans cette liste ne certifie ni l’authenticité du document ni un droit de réutilisation.</p>
      <label>Intervalle en minutes<input aria-label="Intervalle de veille en minutes" type="number" min={360} max={10080} value={intervalMinutes} onChange={event => { setInterval(Number(event.target.value)); changed(); }} /></label>
      <label><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); changed(); }} /> Activer les contrôles automatiques de cette adresse publique</label>
    </fieldset>
    {canEdit && <div className="pedagogy-actions"><button className="pedagogy-button" disabled={busy || uncertain || Boolean(reviewNote) || reviewReceived || !title.trim() || !url.trim()} onClick={() => void save()}>Enregistrer la veille</button><button className="pedagogy-button pedagogy-button--secondary" disabled={busy} onClick={() => void reload()}>Recharger la configuration enregistrée</button></div>}
    {message && <p role="status">{message} Rechargez l’état enregistré avant de reprendre ; aucun nouvel envoi automatique.</p>}
  </div>;
}
