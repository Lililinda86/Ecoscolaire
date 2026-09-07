import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../db/firebase';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from '../../utils/paymentReceipt';
import './SchoolFeeCatalog.css';

interface Fee { id: string; label: string; amount: number; category?: string; mandatory?: boolean; active?: boolean; academicYear?: string; dueDate?: string | null; schemaVersion?: number; versionId?: string }
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
  const [fees, setFees] = useState<Fee[]>([]);
  const [label, setLabel] = useState(''); const [feeType, setFeeType] = useState('uniform');
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [mandatory, setMandatory] = useState(true); const [dueDate, setDueDate] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]); const [cycles, setCycles] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [feeId, setFeeId] = useState(() => crypto.randomUUID());
  const [assignFee, setAssignFee] = useState(''); const [studentId, setStudentId] = useState('');
  const [reviseFee, setReviseFee] = useState(''); const [reviseAmount, setReviseAmount] = useState(''); const [reviseReason, setReviseReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const canManage = ['owner', 'director', 'superAdmin'].includes(currentUser?.role || '');
  const load = useCallback(async () => {
    if (!school?.id) return;
    const result = await httpsCallable<{ schoolId: string }, { fees: Fee[] }>(functions, 'getSchoolFeeCatalog')({ schoolId: school.id });
    setFees(result.data.fees);
  }, [school?.id]);
  useEffect(() => { void load().catch(e => setError(e instanceof Error ? e.message : 'Catalogue indisponible.')); }, [load]);
  const run = async (payload: Record<string, unknown>) => {
    if (!canManage || busy || !school) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      await httpsCallable(functions, 'manageSchoolFee')({ schoolId: school.id, ...payload });
      await load(); setMessage('Opération enregistrée. Le compte élève utilisera les montants validés par le serveur.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Opération refusée.'); return false; }
    finally { setBusy(false); }
  };
  if (!school) return null;
  return <section className="school-fee-catalog" aria-labelledby="fee-catalog-title">
    <h2 id="fee-catalog-title">Frais &amp; tarifs — Catalogue</h2>
    <p>Scolarité et calendrier Transport : utilisez les sections existantes ci-dessous. Le catalogue complète les tenues, autres frais et frais ponctuels.</p>
    <p>Transport : consultez le barème actif dans Paramètres → Transport. PK désigne le quartier / point de ramassage ; le secondaire reste gratuit.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {canManage && <details><summary>Créer un nouveau frais</summary>
      <form onSubmit={async e => { e.preventDefault(); const category = feeTypes.find(type => type.key === feeType)?.category || 'other'; if (await run({ action: 'create', feeId, fee: { label, category, amount: Number(amount), description, mandatory, dueDate: dueDate || null, academicYear: school.academicYear, classIds, cycles, studentIds } })) { setFeeId(crypto.randomUUID()); setLabel(''); setAmount(''); } }}>
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
        <fieldset><legend>Cycles concernés — aucun filtre = tous</legend>{Object.entries({ nursery: 'Maternelle', primary: 'Primaire', secondary: 'Secondaire' }).map(([key, text]) => <label key={key}><input type="checkbox" checked={cycles.includes(key)} onChange={e => setCycles(old => e.target.checked ? [...old, key] : old.filter(c => c !== key))} />{text}</label>)}</fieldset>
        <label>Classes concernées — aucune sélection = toutes<select multiple value={classIds} onChange={e => setClassIds(Array.from(e.target.selectedOptions, o => o.value))}>{db.classes.filter(c => c.schoolId === school.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Élèves concernés — aucune sélection = tous<select multiple value={studentIds} onChange={e => setStudentIds(Array.from(e.target.selectedOptions, o => o.value))}>{db.students.filter(s => s.schoolId === school.id).map(s => <option key={s.id} value={s.id}>{s.name} — {s.matricule}</option>)}</select></label>
        <p>Après publication, le tarif est figé. Un nouveau frais crée une obligation supplémentaire ; il ne remplace ni n’annule une dette existante. Désactiver arrête uniquement les nouvelles affectations.</p>
        <button disabled={busy} type="submit">Publier le frais</button>
      </form>
    </details>}
    <div className="school-fee-groups">{feeTypeGroups.map(group => {
      const groupFees = fees.filter(fee => group.categories.some(category => category === fee.category));
      return <section key={group.key} className="school-fee-group" aria-labelledby={`fee-group-${group.key}`}>
        <h3 id={`fee-group-${group.key}`}>{group.label}</h3>
        <p className="school-fee-types">Types disponibles : {group.types.map(type => type.label).join(' · ')}</p>
        {groupFees.length === 0 ? <p className="school-fee-empty">Aucun tarif configuré dans cette section.</p> : <ul className="school-fee-list">{groupFees.map(fee => <li key={fee.id}><strong>{fee.label}</strong><span>{feeCategories[fee.category as keyof typeof feeCategories] || 'Catégorie historique'} · {formatCurrency(fee.amount)} · {fee.mandatory === false ? 'Facultatif' : 'Obligatoire'} · {fee.active === false ? 'INACTIF' : 'ACTIF'}{fee.academicYear ? ` · ${fee.academicYear}` : ' · historique'}</span>{fee.dueDate && <span>Échéance : {fee.dueDate}</span>}{canManage && fee.schemaVersion === 2 && fee.active !== false && <button disabled={busy} type="button" onClick={() => void run({ action: 'archive', feeId: fee.id })}>Désactiver les nouvelles affectations</button>}</li>)}</ul>}
      </section>;
    })}
    {fees.some(fee => !knownCategories.has(fee.category || '')) && <section className="school-fee-group" aria-labelledby="fee-group-historical">
      <h3 id="fee-group-historical">Catalogue historique</h3>
      <ul className="school-fee-list">{fees.filter(fee => !knownCategories.has(fee.category || '')).map(fee => <li key={fee.id}><strong>{fee.label}</strong><span>{formatCurrency(fee.amount)} · {fee.mandatory === false ? 'Facultatif' : 'Obligatoire'} · {fee.active === false ? 'INACTIF' : 'ACTIF'}</span>{fee.dueDate && <span>Échéance : {fee.dueDate}</span>}</li>)}</ul>
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
        <label>Frais facultatif<select required value={assignFee} onChange={e => setAssignFee(e.target.value)}><option value="">Choisir un frais</option>{fees.filter(f => f.schemaVersion === 2 && f.active !== false && !f.mandatory && f.academicYear === school.academicYear).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label>Élève concerné<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Choisir un élève</option>{db.students.filter(s => s.schoolId === school.id).map(s => <option key={s.id} value={s.id}>{s.name} — {s.matricule}</option>)}</select></label>
      </div><button disabled={busy} type="submit">Affecter à l’élève</button>
    </form>}
  </section>;
}
