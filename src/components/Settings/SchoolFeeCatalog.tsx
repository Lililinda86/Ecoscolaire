import { feeTargetClasses, feeTargetStudents } from '../../../functions/src/feeTargeting';
import { getClassOptionLabel } from '../../utils/classCatalog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../db/firebase';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from '../../utils/paymentReceipt';
import './SchoolFeeCatalog.css';

interface Fee { id: string; label: string; amount: number; category?: string; mandatory?: boolean; active?: boolean; academicYear?: string; dueDate?: string | null; schemaVersion?: number; versionId?: string; description?: string; recurrence?: string; classIds?: string[]; cycles?: string[]; studentIds?: string[] }
interface FeeType { key: string; label: string; category: string; suggestedLabel: string }
interface FeeTypeGroup { key: string; label: string; categories: string[]; types: FeeType[] }
const feeCategories = { uniform: 'Tenue scolaire', sports_uniform: 'Tenue de sport', books: 'Livres', supplies: 'Fournitures', exam: "Frais d’examen", canteen: 'Cantine', childcare: 'Garderie', activity: 'Activité scolaire', excursion: 'Excursion', event: 'Fête / événement', photo: 'Photo scolaire', contribution: 'Contribution', exceptional: 'Frais exceptionnel', other: 'Autre' };
const feeTypeGroups: FeeTypeGroup[] = [
  { key: 'uniforms', label: 'Tenues', categories: ['uniform', 'sports_uniform'], types: [
    { key: 'uniform', label: 'Tenue scolaire', category: 'uniform', suggestedLabel: 'Tenue scolaire' },
    { key: 'sports_uniform', label: 'Tenue de sport', category: 'sports_uniform', suggestedLabel: 'Tenue de sport' },
    { key: 'ceremony_uniform', label: 'Tenue de cérémonie', category: 'uniform', suggestedLabel: 'Tenue de cérémonie' },
    { key: 'other_uniform', label: 'Autre type de tenue', category: 'uniform', suggestedLabel: '' }
  ] },
  { key: 'activities', label: 'Activités / événements', categories: ['activity', 'excursion', 'event'], types: [
    { key: 'activity_kit', label: "Kit d’activités", category: 'activity', suggestedLabel: "Kit d’activités" },
    { key: 'event', label: "Fête de l’école", category: 'event', suggestedLabel: "Fête de l’école" },
    { key: 'excursion', label: 'Excursion', category: 'excursion', suggestedLabel: 'Excursion' },
    { key: 'school_trip', label: 'Sortie pédagogique', category: 'excursion', suggestedLabel: 'Sortie pédagogique' },
    { key: 'cultural_activity', label: 'Activité culturelle', category: 'activity', suggestedLabel: 'Activité culturelle' },
    { key: 'activity', label: 'Autre activité scolaire', category: 'activity', suggestedLabel: '' }
  ] },
  { key: 'other', label: 'Autres frais', categories: ['photo', 'supplies', 'books', 'canteen', 'childcare', 'contribution', 'other'], types: [
    { key: 'photo', label: 'Photos scolaires', category: 'photo', suggestedLabel: 'Photos scolaires' },
    { key: 'supplies', label: 'Fournitures / supports', category: 'supplies', suggestedLabel: 'Fournitures / supports' },
    { key: 'books', label: 'Livres', category: 'books', suggestedLabel: 'Livres' },
    { key: 'canteen', label: 'Cantine', category: 'canteen', suggestedLabel: 'Cantine' },
    { key: 'childcare', label: 'Garderie', category: 'childcare', suggestedLabel: 'Garderie' },
    { key: 'contribution', label: 'Contribution', category: 'contribution', suggestedLabel: 'Contribution' },
    { key: 'other', label: 'Autre libellé libre', category: 'other', suggestedLabel: '' }
  ] },
  { key: 'one-off', label: 'Frais ponctuels', categories: ['exam', 'exceptional'], types: [
    { key: 'exam', label: "Frais d’examen", category: 'exam', suggestedLabel: "Frais d’examen" },
    { key: 'exceptional', label: 'Frais exceptionnel', category: 'exceptional', suggestedLabel: '' }
  ] }
] ;
const feeTypes = feeTypeGroups.flatMap(group => group.types);
const knownCategories = new Set(feeTypeGroups.flatMap(group => group.categories));
export function SchoolFeeCatalog() {
  const { db, currentUser } = useAppContext();
  const school = db.school;
  const editor = useRef<HTMLDetailsElement>(null);
  const [editing, setEditing] = useState<Fee | null>(null);
  const [editReason, setEditReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<Fee[]>([]);
  const [label, setLabel] = useState(''); const [feeType, setFeeType] = useState('uniform');
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [mandatory, setMandatory] = useState(true); const [dueDate, setDueDate] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]); const [cycles, setCycles] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [review, setReview] = useState(false);
  const [recurrence, setRecurrence] = useState('one_off');
  const [feeId, setFeeId] = useState<string>(() => crypto.randomUUID());
  const [assignFee, setAssignFee] = useState(''); const [studentId, setStudentId] = useState('');
  const [reviseFee, setReviseFee] = useState(''); const [reviseAmount, setReviseAmount] = useState(''); const [reviseReason, setReviseReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const canManage = ['owner', 'director', 'superAdmin'].includes(currentUser?.role || '');
  const load = useCallback(async () => {
    if (!school?.id) return;
    const result = await httpsCallable<{ schoolId: string }, { fees: Fee[] }>(functions, 'getSchoolFeeCatalog')({ schoolId: school.id });
    if (!Array.isArray(result.data.fees)) throw new Error('Réponse du catalogue invalide. Rechargez la page.');
    setFees(result.data.fees); setLoading(false);
    return result.data.fees;
  }, [school?.id]);
  useEffect(() => { void load().catch(e => { setLoading(false); setError(e instanceof Error ? e.message : 'Catalogue indisponible.'); }); }, [load]);
  const run = async (payload: Record<string, unknown>) => {
    if (!canManage || busy || !school) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      await httpsCallable(functions, 'manageSchoolFee')({ schoolId: school.id, ...payload });
      const persisted = await load();
      if (payload.action === 'create' || (payload.action === 'revise' && payload.fee)) {
        const expected = payload.fee as Record<string, unknown>;
        const saved = persisted?.find(f => f.id === payload.feeId);
        const matches = saved && Object.entries(expected).every(([key, value]) => {
          const actual = (saved as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) return Array.isArray(actual) && [...actual].sort().join('\0') === [...value].sort().join('\0');
          return actual === (typeof value === 'string' ? value.trim() : value);
        });
        if (!matches) throw new Error('Publication non confirmée par le serveur. Le formulaire est conservé ; réessayez sans créer un nouveau frais.');
      }
      setMessage(payload.action === 'create' || payload.action === 'revise' ? 'Frais publié avec succès' : 'Opération enregistrée. Le compte élève utilisera les montants validés par le serveur.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Opération refusée.'); return false; }
    finally { setBusy(false); }
  };
  if (!school) return null;
  const availableClasses = feeTargetClasses(db.classes, school.id, school.activeAcademicYearId, cycles);
  const selectedClasses = classIds.filter(id => availableClasses.some(c => c.id === id));
  const effectiveClasses = selectedClasses.length ? selectedClasses : availableClasses.map(c => c.id);
  const availableStudents = feeTargetStudents(db.students, school.id, school.activeAcademicYearId, effectiveClasses);
  const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const visibleClasses = availableClasses.filter(c => normalizeSearch(getClassOptionLabel(c, availableClasses)).includes(normalizeSearch(classSearch)));
  const selectedStudents = studentIds.filter(id => availableStudents.some(s => s.id === id));
  const search = studentSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const visibleStudents = availableStudents.filter(s => (s.name + ' ' + (s.matricule || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').includes(search));
  const changeCycles = (next: string[]) => {
    setCycles(next); setReview(false);
    const eligible = feeTargetClasses(db.classes, school.id, school.activeAcademicYearId, next);
    const nextClasses = classIds.filter(id => eligible.some(c => c.id === id));
    setClassIds(nextClasses);
    setStudentIds(old => old.filter(id => feeTargetStudents(db.students, school.id, school.activeAcademicYearId, nextClasses.length ? nextClasses : eligible.map(c => c.id)).some(s => s.id === id)));
  };
  const changeClasses = (next: string[]) => {
    setClassIds(next); setReview(false);
    setStudentIds(old => old.filter(id => feeTargetStudents(db.students, school.id, school.activeAcademicYearId, next.length ? next : availableClasses.map(c => c.id)).some(s => s.id === id)));
  };
  const openEditor = (fee?: Fee, revise = false, type = 'uniform') => {
    setEditing(revise && fee ? fee : null); setEditReason(''); setReview(false); setError(''); setMessage('');
    setFeeId(revise && fee ? fee.id : crypto.randomUUID());
    setFeeType(fee ? (feeTypes.find(t => t.category === fee.category)?.key || 'other') : type);
    setLabel(fee?.label || feeTypes.find(t => t.key === type)?.suggestedLabel || '');
    setAmount(fee ? String(fee.amount) : ''); setDescription(fee?.description || '');
    setDueDate(fee?.dueDate || ''); setMandatory(fee?.mandatory !== false); setRecurrence(fee?.recurrence || 'one_off');
    setCycles(fee?.cycles || []); setClassIds(fee?.classIds || []); setStudentIds(fee?.studentIds || []); setStudentSearch(''); setClassSearch('');
    if (editor.current) { editor.current.open = true; editor.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }
  };
  const assignedFee = fees.find(f => f.id === assignFee);
  const assignableClasses = feeTargetClasses(db.classes, school.id, school.activeAcademicYearId, assignedFee?.cycles?.length ? assignedFee.cycles : ['nursery', 'primary', 'secondary'])
    .filter(c => !assignedFee?.classIds?.length || assignedFee.classIds.includes(c.id));
  const assignableStudents = feeTargetStudents(db.students, school.id, school.activeAcademicYearId, assignableClasses.map(c => c.id))
    .filter(s => !assignedFee?.studentIds?.length || assignedFee.studentIds.includes(s.id));
  const feeActions = (fee: Fee) => canManage && <div className="fee-actions">
    {fee.active !== false && <>
      <button type="button" disabled={busy} onClick={() => openEditor(fee, true)}>Modifier le frais</button>
      <button disabled={busy} type="button" onClick={() => void run({ action: 'archive', feeId: fee.id })}>Désactiver les nouvelles affectations</button>
    </>}
    <button type="button" disabled={busy} onClick={() => openEditor(fee)}>Reprendre comme modèle</button>
    {fee.schemaVersion !== 2 && <p>Frais historique : Modifier conserve son identité et les dettes actuelles, puis publie une version pour les nouvelles obligations. Désactiver conserve les dettes et reçus. Reprendre comme modèle crée un frais supplémentaire.</p>}
  </div>;
  const feeDetails = (fee: Fee) => <>
    {fee.description && <span>{fee.description}</span>}
    <span>{fee.recurrence === 'recurring' ? 'Récurrent' : 'Ponctuel'} · {fee.classIds?.length ? fee.classIds.map(id => { const cls = db.classes.find(c => c.id === id); return cls ? getClassOptionLabel(cls, db.classes) : 'Classe historique'; }).join(', ') : 'Classes du périmètre'} · {fee.studentIds?.length ? `${fee.studentIds.length} élèves ciblés` : 'Tous les élèves du périmètre'}</span>
  </>;
  return <section className="school-fee-catalog" aria-labelledby="fee-catalog-title">
    <h2 id="fee-catalog-title">Frais &amp; tarifs — Catalogue</h2>
    <p>Scolarité et calendrier Transport : utilisez les sections existantes ci-dessous. Le catalogue complète les tenues, autres frais et frais ponctuels.</p>
    <p>Transport : consultez le barème actif dans Paramètres → Transport. PK désigne le quartier / point de ramassage ; le secondaire reste gratuit.</p>
    {canManage && <button type="button" onClick={() => openEditor()}>Ajouter un frais</button>}
    {loading && <p role="status">Chargement du catalogue…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {canManage && <details ref={editor}><summary>{editing ? `Modifier : ${editing.label}` : 'Créer un nouveau frais'}</summary>
      <form onChange={() => setReview(false)} onSubmit={async e => {
        e.preventDefault();
        if (!availableClasses.length || selectedClasses.length !== classIds.length || selectedStudents.length !== studentIds.length) { setError('Le périmètre a changé ou ne contient aucune classe éligible. Vérifiez les classes et élèves avant publication.'); return; }
        if (!review) { setError(''); setMessage(''); setReview(true); return; }
        const category = feeTypes.find(type => type.key === feeType)?.category || 'other';
        if (await run({ action: editing ? 'revise' : 'create', feeId, ...(editing ? { expectedAmount: editing.amount, expectedVersion: editing.versionId || null, reason: editReason } : {}), fee: { label, category, amount: Number(amount), description, mandatory, recurrence, dueDate: dueDate || null, academicYear: school.academicYear, classIds: selectedClasses, cycles, studentIds: selectedStudents } })) {
          setFeeId(crypto.randomUUID()); setLabel(''); setAmount(''); setReview(false); setEditing(null); if (editor.current) editor.current.open = false;
        }
      }}>
        {editing && <p>Modifiez les paramètres puis publiez une nouvelle version. Les obligations déjà établies conservent leur libellé, montant et échéance.</p>}
        <label>Réutiliser un libellé configuré<select value="" onChange={e => { const source = fees.find(f => f.id === e.target.value); if (source) { setLabel(source.label); setFeeType(feeTypes.find(t => t.category === source.category)?.key || 'other'); } }}><option value="">Choisir ou saisir un nouveau libellé</option>{fees.map(f => <option key={f.id} value={f.id}>{f.label} — libellé enregistré</option>)}</select></label>
        <div className="school-fee-grid">
          <label>{feeType === 'other' || feeType === 'other_uniform' ? 'Précisez le libellé du frais' : 'Libellé précis du frais'}<input required maxLength={120} value={label} onChange={e => setLabel(e.target.value)} placeholder={feeType === 'other' ? 'Ex. Cérémonie de fin d’année' : feeType === 'other_uniform' ? 'Ex. Blouse de laboratoire' : 'Ex. Excursion Kribi 2027'} /></label>
          <label>Type de frais<select value={feeType} onChange={e => { const next = e.target.value; setFeeType(next); const suggestion = feeTypes.find(type => type.key === next)?.suggestedLabel || ''; if (!label || feeTypes.some(type => type.suggestedLabel === label)) setLabel(suggestion); }}>{feeTypeGroups.map(group => <optgroup key={group.key} label={group.label}>{group.types.map(type => <option key={type.key} value={type.key}>{type.label}</option>)}</optgroup>)}</select></label>
          <label>Montant (FCFA)<input required type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Échéance éventuelle<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
          <label>Année scolaire<input readOnly value={school.academicYear} /></label>
          <label>Description<textarea maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /></label>
        </div>
        <label><input type="checkbox" checked={mandatory} onChange={e => setMandatory(e.target.checked)} />Obligatoire pour les élèves concernés</label>
        <p>{mandatory ? 'Affectation automatique aux élèves du périmètre sélectionné.' : 'Aucune dette sans affectation explicite à un élève.'}</p>
        <label>Périodicité<select value={recurrence} onChange={e => setRecurrence(e.target.value)}><option value="one_off">Ponctuel</option><option value="recurring">Récurrent</option></select></label>
        {recurrence === 'recurring' && <p>Chaque nouvelle échéance doit être publiée explicitement comme un frais distinct. Aucune mensualité n’est créée automatiquement.</p>}
        <fieldset><legend>Cycles concernés</legend><p>Aucun cycle coché : toutes les classes éligibles de l’établissement.</p><div className="fee-actions"><button type="button" onClick={() => changeCycles(['nursery', 'primary', 'secondary'])}>Tout sélectionner — cycles</button><button type="button" onClick={() => changeCycles([])}>Tout désélectionner — cycles</button></div>{Object.entries({ nursery: 'Maternelle', primary: 'Primaire', secondary: 'Secondaire' }).map(([key, text]) => <label key={key}><input type="checkbox" checked={cycles.includes(key)} onChange={e => changeCycles(e.target.checked ? [...cycles, key] : cycles.filter(c => c !== key))} />{text}</label>)}</fieldset>
        <fieldset><legend>Classes concernées</legend>
          <label><input type="checkbox" disabled={!availableClasses.length} checked={availableClasses.length > 0 && selectedClasses.length === availableClasses.length} onChange={e => changeClasses(e.target.checked ? availableClasses.map(c => c.id) : [])} />Tout sélectionner — classes</label>
          <button type="button" onClick={() => changeClasses([])}>Tout désélectionner — classes</button>
          <p>Aucune classe cochée : tous les élèves des classes éligibles du périmètre.</p>
          <label>Rechercher une classe<input type="search" value={classSearch} onChange={e => setClassSearch(e.target.value)} /></label>
          <div className="fee-target-list">{visibleClasses.map(c => <label key={c.id}><input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={e => changeClasses(e.target.checked ? [...selectedClasses, c.id] : selectedClasses.filter(id => id !== c.id))} />{getClassOptionLabel(c, availableClasses)}</label>)}</div>
        </fieldset>
        <fieldset><legend>Élèves concernés</legend>
          <p>Aucun élève coché : tous les élèves actifs du périmètre défini. Un frais facultatif exige ensuite une affectation explicite.</p>
          <label>Rechercher par nom, prénom ou matricule<input type="search" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} /></label>
          <label><input type="checkbox" disabled={!availableStudents.length} checked={availableStudents.length > 0 && selectedStudents.length === availableStudents.length} onChange={e => setStudentIds(e.target.checked ? availableStudents.map(s => s.id) : [])} />Tout sélectionner — élèves</label>
          <p role="status">{selectedStudents.length} élèves sélectionnés</p>
          <button type="button" onClick={() => { setStudentIds([]); setReview(false); }}>Tout désélectionner — élèves</button>
          <p>{selectedStudents.length || availableStudents.length} élèves concernés par le périmètre actuel.</p>
          <div className="fee-target-list">{visibleStudents.map(s => <label key={s.id}><input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={e => setStudentIds(e.target.checked ? [...selectedStudents, s.id] : selectedStudents.filter(id => id !== s.id))} />{s.name} — {s.matricule}</label>)}</div>
        </fieldset>
        {review && <section aria-label="Résumé avant publication" className="fee-publication-review">
          <p role="status">Brouillon non enregistré. Cliquez sur « Publier le frais » pour enregistrer ce tarif sur le serveur.</p><h3>Vérifier avant publication</h3><p><strong>{label}</strong> — {formatCurrency(Number(amount))}</p>
          <p>{mandatory ? 'Obligatoire' : 'Facultatif'} · {recurrence === 'one_off' ? 'Ponctuel' : 'Récurrent'} · {school.academicYear}</p>
          <p>Cycles : {cycles.map(c => ({ nursery: 'Maternelle', primary: 'Primaire', secondary: 'Secondaire' })[c]).join(', ') || 'Tous les cycles éligibles'}</p>
          <p>Classes : {availableClasses.filter(c => effectiveClasses.includes(c.id)).map(c => getClassOptionLabel(c, availableClasses)).join(', ')}</p>
          <p>Élèves concernés : {selectedStudents.length || availableStudents.length}</p><p>Échéance : {dueDate || 'Non définie'}</p>
          {!mandatory && <p>La publication ne crée aucune dette. Affectez ensuite le frais aux élèves inscrits.</p>}
        </section>}
        <p>Après publication, le tarif est figé. Un nouveau frais crée une obligation supplémentaire ; il ne remplace ni n’annule une dette existante. Désactiver arrête uniquement les nouvelles affectations.</p>
        {editing && <label>Motif de la modification du frais<textarea required maxLength={500} value={editReason} onChange={e => setEditReason(e.target.value)} /></label>}
        {error && <p role="alert">{error}</p>}
        {!availableClasses.length && <p role="alert">Aucune classe éligible pour l’année active. La publication est impossible.</p>}
        <button disabled={busy || !availableClasses.length} type="submit">{review ? (editing ? 'Publier les modifications' : 'Publier le frais') : 'Vérifier avant publication'}</button>
      </form>
    </details>}
    <div className="school-fee-groups">{feeTypeGroups.map(group => {
      const groupFees = fees.filter(fee => group.categories.some(category => category === fee.category));
      return <section key={group.key} className="school-fee-group" aria-labelledby={`fee-group-${group.key}`}>
        <h3 id={`fee-group-${group.key}`}>{group.label}</h3>
        {canManage && <button type="button" onClick={() => openEditor(undefined, false, group.types[0].key)}>Ajouter — {group.label}</button>}
        <p className="school-fee-types">Types disponibles : {group.types.map(type => type.label).join(' · ')}</p>
        {groupFees.length === 0 ? !loading && !error && <p className="school-fee-empty">Aucun tarif configuré dans cette section.</p> : <ul className="school-fee-list">{groupFees.map(fee => <li key={fee.id}><strong>{fee.label}</strong><span>{feeCategories[fee.category as keyof typeof feeCategories] || 'Catégorie historique'} · {formatCurrency(fee.amount)} · {fee.mandatory === false ? 'Facultatif' : 'Obligatoire'} · {fee.active === false ? 'INACTIF' : 'ACTIF'}{fee.academicYear ? ` · ${fee.academicYear}` : ' · historique'}</span>{fee.dueDate && <span>Échéance : {fee.dueDate}</span>}{feeDetails(fee)}{feeActions(fee)}</li>)}</ul>}
      </section>;
    })}
    {fees.some(fee => !knownCategories.has(fee.category || '')) && <section className="school-fee-group" aria-labelledby="fee-group-historical">
      <h3 id="fee-group-historical">Catalogue historique</h3>
      <ul className="school-fee-list">{fees.filter(fee => !knownCategories.has(fee.category || '')).map(fee => <li key={fee.id}><strong>{fee.label}</strong><span>{formatCurrency(fee.amount)} · {fee.mandatory === false ? 'Facultatif' : 'Obligatoire'} · {fee.active === false ? 'INACTIF' : 'ACTIF'}</span>{fee.dueDate && <span>Échéance : {fee.dueDate}</span>}{feeDetails(fee)}{feeActions(fee)}</li>)}</ul>
    </section>}
    </div>
    {canManage && <form onSubmit={e => { e.preventDefault(); void run({ action: 'assign', feeId: assignFee, studentId }); }}>
      <h3>Nouvelle version d’un tarif</h3>
      <p>Modifie uniquement les nouvelles obligations. Aucun supplément automatique pour les élèves déjà concernés par une obligation de ce frais.</p>
      <div className="school-fee-grid">
        <label>Frais à réviser<select value={reviseFee} onChange={e => { setReviseFee(e.target.value); setReviseAmount(String(fees.find(f => f.id === e.target.value)?.amount || '')); }}><option value="">Choisir</option>{fees.filter(f => f.schemaVersion === 2 && f.active !== false).map(f => <option key={f.id} value={f.id}>{f.label} — {formatCurrency(f.amount)}</option>)}</select></label>
        <label>Nouveau tarif (FCFA)<input type="number" min="1" step="1" value={reviseAmount} onChange={e => setReviseAmount(e.target.value)} /></label>
        <label>Motif de la révision<textarea maxLength={500} value={reviseReason} onChange={e => setReviseReason(e.target.value)} /></label>
      </div>
      <button type="button" disabled={busy || !reviseFee || !reviseReason.trim() || !reviseAmount} onClick={() => void run({ action: 'revise', feeId: reviseFee, amount: Number(reviseAmount), expectedAmount: fees.find(f => f.id === reviseFee)?.amount, reason: reviseReason })}>Publier la nouvelle version</button>
      <h3>Affecter un frais facultatif</h3><div className="school-fee-grid">
        <label>Frais facultatif<select required value={assignFee} onChange={e => { setAssignFee(e.target.value); setStudentId(''); }}><option value="">Choisir un frais</option>{fees.filter(f => f.schemaVersion === 2 && f.active !== false && !f.mandatory && f.academicYear === school.academicYear).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label>Élève concerné<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Choisir un élève</option>{assignableStudents.map(s => <option key={s.id} value={s.id}>{s.name} — {s.matricule}</option>)}</select></label>
      </div><button disabled={busy} type="submit">Affecter à l’élève</button>
    </form>}
  </section>;
}
