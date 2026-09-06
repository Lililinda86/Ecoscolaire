import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../db/firebase';
import { useAppContext } from '../../context/AppContext';
import { formatCurrency } from '../../utils/paymentReceipt';
import './SchoolFeeCatalog.css';

interface Fee { id: string; label: string; amount: number; category?: string; mandatory?: boolean; active?: boolean; academicYear?: string; dueDate?: string | null; schemaVersion?: number }
const categories = { uniform: 'Tenue scolaire', sports_uniform: 'Tenue de sport', books: 'Livres', supplies: 'Fournitures', exam: "Frais d’examen", canteen: 'Cantine', activity: 'Activité', excursion: 'Excursion', event: 'Fête / événement', photo: 'Photo scolaire', contribution: 'Contribution', exceptional: 'Frais exceptionnel', other: 'Autre' };
export function SchoolFeeCatalog() {
  const { db, currentUser } = useAppContext();
  const school = db.school;
  const [fees, setFees] = useState<Fee[]>([]);
  const [label, setLabel] = useState(''); const [category, setCategory] = useState('uniform');
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState('');
  const [mandatory, setMandatory] = useState(true); const [dueDate, setDueDate] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]); const [cycles, setCycles] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [feeId, setFeeId] = useState(() => crypto.randomUUID());
  const [assignFee, setAssignFee] = useState(''); const [studentId, setStudentId] = useState('');
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
      <form onSubmit={async e => { e.preventDefault(); if (await run({ action: 'create', feeId, fee: { label, category, amount: Number(amount), description, mandatory, dueDate: dueDate || null, academicYear: school.academicYear, classIds, cycles, studentIds } })) { setFeeId(crypto.randomUUID()); setLabel(''); setAmount(''); } }}>
        <div className="school-fee-grid">
          <label>Nom du frais<input required maxLength={120} value={label} onChange={e => setLabel(e.target.value)} /></label>
          <label>Catégorie<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
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
    <ul className="school-fee-list">{fees.map(fee => <li key={fee.id}><strong>{fee.label}</strong><span>{formatCurrency(fee.amount)} · {fee.mandatory === false ? 'Facultatif' : 'Obligatoire'} · {fee.active === false ? 'INACTIF' : 'ACTIF'}{fee.academicYear ? ` · ${fee.academicYear}` : ' · historique'}</span>{fee.dueDate && <span>Échéance : {fee.dueDate}</span>}{canManage && fee.schemaVersion === 2 && fee.active !== false && <button disabled={busy} type="button" onClick={() => void run({ action: 'archive', feeId: fee.id })}>Désactiver les nouvelles affectations</button>}</li>)}</ul>
    {canManage && <form onSubmit={e => { e.preventDefault(); void run({ action: 'assign', feeId: assignFee, studentId }); }}>
      <h3>Affecter un frais facultatif</h3><div className="school-fee-grid">
        <label>Frais facultatif<select required value={assignFee} onChange={e => setAssignFee(e.target.value)}><option value="">Choisir un frais</option>{fees.filter(f => f.schemaVersion === 2 && f.active !== false && !f.mandatory && f.academicYear === school.academicYear).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <label>Élève concerné<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Choisir un élève</option>{db.students.filter(s => s.schoolId === school.id).map(s => <option key={s.id} value={s.id}>{s.name} — {s.matricule}</option>)}</select></label>
      </div><button disabled={busy} type="submit">Affecter à l’élève</button>
    </form>}
  </section>;
}
