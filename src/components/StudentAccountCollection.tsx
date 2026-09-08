import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccountFeeGroups, type AccountFeeGroup } from './AccountFeeGroups';
import { httpsCallable } from 'firebase/functions';
import { jsPDF } from 'jspdf';
import { CheckCircle, FileDown, Plus, Printer, RefreshCw, Search } from 'lucide-react';
import { functions } from '../db/firebase';
import type { GlobalRole, School, Student } from '../types';
import { formatCurrency } from '../utils/paymentReceipt';
import StudentAccountBenefitsDrawer from './StudentAccountBenefitsDrawer';
import './StudentAccountCollection.css';

type AccountStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface AccountLine {
  key: string;
  type: 'registration_fee' | 'tuition' | 'transport' | 'uniforms' | 'other';
  label: string;
  installment: 'T1' | 'T2' | 'T3' | null;
  period: string | null;
  feeId: string | null;
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
  previousPaid: number;
  remainingBalance: number;
  status: AccountStatus;
  benefits: Array<{ benefitId: string; benefitType: string; discountAmount: number; reference?: string | null }>;
  originalDueDate: string | null;
  moratoriumStatus: 'NONE' | 'ACTIVE' | 'EXPIRED';
  effectiveDueDate: string | null;
  nextDueDate?: string | null;
  overdue: boolean;
  dueStatus: string;
  selectable: boolean;
}

interface StudentAccount {
  groups?: AccountFeeGroup[];
  student: { id: string; name: string; matricule: string; classId: string; className: string };
  school: { id: string; name: string };
  academicYear: string;
  totals: { totalBilled: number; totalBenefits: number; totalPaid: number; totalRemaining: number; overdueAmount: number };
  lines: AccountLine[];
}

interface CollectionResult {
  receipt?: { schoolName: string; studentName: string; matricule: string; className: string; academicYear: string; issuedAt: string; cashier: string; accountRemainingBalance: number | null };
  collectionId: string;
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  amount: number;
  remainingBalance: number;
  idempotentReplay: boolean;
  lineItems: Array<{ key: string; label: string; amount: number; remainingBalance: number; grossExpectedAmount?: number; netExpectedAmount?: number; discountAmount?: number }>;
}

interface Props {
  students: Student[];
  school: School;
  initialStudentId?: string;
  classNamesById?: Record<string, string>;
  currentRole?: GlobalRole;
  onClose: () => void;
  onCompleted?: (result: CollectionResult) => void;
}

const errorMessage = (error: unknown): string => {
  const candidate = error as { code?: string; message?: string; details?: { businessCode?: string } };
  const businessCode = candidate.details?.businessCode;
  const messages: Record<string, string> = {
    OVERPAYMENT_DENIED: 'Un montant dépasse le reste à payer. Rechargez le compte puis réessayez.',
    NO_REMAINING_BALANCE: 'Un frais sélectionné vient d’être soldé. Le compte a été rechargé.',
    IDEMPOTENCY_CONFLICT: 'Cette référence correspond déjà à un autre encaissement.',
    FEE_NOT_APPLICABLE: 'Un frais sélectionné ne s’applique plus à cet élève.',
    CASH_DAY_CLOSED: 'La caisse du jour est clôturée. Aucun encaissement supplémentaire n’est autorisé.'
  };
  return (businessCode && messages[businessCode]) || candidate.message || 'L’encaissement n’a pas pu être confirmé.';
};

const statusLabel = (line: AccountLine): string => {
  if (line.status === 'PAID') return 'SOLDÉ';
  if (line.moratoriumStatus === 'ACTIVE') return 'MORATOIRE';
  if (line.overdue) return 'EN RETARD';
  if (line.dueStatus === 'NOT_DUE') return 'À VENIR';
  return 'À PAYER';
};

const statusDueDate = (line: AccountLine): string | null => line.moratoriumStatus === 'ACTIVE'
  ? line.effectiveDueDate
  : line.effectiveDueDate || line.originalDueDate;

const statusDueLabel = (line: AccountLine): string => line.moratoriumStatus === 'ACTIVE' ? 'Nouvelle échéance' : 'Échéance';

const normalizeAmount = (value: string): number => {
  if (!/^\d+$/.test(value.trim())) return 0;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : 0;
};

const benefitTypeLabel = (type: string): string => ({
  scholarship: 'Bourse',
  family_discount: 'Réduction familiale',
  voucher: 'Bon de réduction',
  exceptional_discount: 'Remise exceptionnelle',
  discount: 'Réduction'
}[type.toLocaleLowerCase('fr')] || type.replace(/_/g, ' '));

const formatSchoolYear = (value: string): string => value.replace('-', '–');

const formatDueDate = (value: string | null): string => {
  if (!value) return 'échéance approuvée';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const StudentAccountCollection: React.FC<Props> = ({
  students,
  school,
  initialStudentId,
  classNamesById = {},
  currentRole = 'secretary',
  onClose,
  onCompleted
}) => {
  const [studentId, setStudentId] = useState(initialStudentId || '');
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState<CollectionResult | null>(null);
  const attemptRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const loadSequenceRef = useRef(0);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return students
      .filter(student => (!student.schoolId || student.schoolId === school.id)
        && student.schoolingStatus !== 'inactive'
        && (!school.activeAcademicYearId || !student.academicYearId
          || student.academicYearId === school.activeAcademicYearId))
      .filter(student => student.id === studentId || !query
        || `${student.name} ${student.studentLastName || ''} ${student.studentFirstName || ''} ${student.matricule || ''}`
        .toLocaleLowerCase('fr').includes(query))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }));
  }, [school.activeAcademicYearId, school.id, search, studentId, students]);

  const loadAccount = async (selectedId = studentId) => {
    const sequence = ++loadSequenceRef.current;
    if (!selectedId) {
      setAccount(null);
      setLoading(false);
      setLoadFailed(false);
      setError('');
      return;
    }
    setLoading(true);
    setAccount(null);
    setLoadFailed(false);
    setError('');
    try {
      const call = httpsCallable<Record<string, string | boolean>, StudentAccount>(functions, 'getStudentFinancialAccount');
      const response = await call({ schoolId: school.id, studentId: selectedId, academicYear: school.academicYear, monthlyTransport: true });
      if (sequence !== loadSequenceRef.current) return;
      setAccount(response.data);
      setAmounts(previous => Object.fromEntries(response.data.lines.map(line => [line.key,
        previous[line.key] && normalizeAmount(previous[line.key]) <= line.remainingBalance ? previous[line.key] : ''])));
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current) return;
      setAccount(null);
      setLoadFailed(true);
      setError(`Impossible de charger la situation financière. ${errorMessage(loadError)}`);
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccount(studentId);
    // The school/year inputs are immutable while this modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, school.id, school.academicYear]);

  const selectedLines = useMemo(() => account?.lines.flatMap(line => {
    const amount = normalizeAmount(amounts[line.key] || '');
    return amount > 0 ? [{ ...line, amount }] : [];
  }) || [], [account, amounts]);
  const total = selectedLines.reduce((sum, line) => sum + line.amount, 0);

  const payableLines = useMemo(() => account?.lines.filter(line => line.selectable && line.remainingBalance > 0) || [], [account]);
  const settledLines = useMemo(() => account?.lines.filter(line => !line.selectable || line.remainingBalance <= 0) || [], [account]);
  const activeBenefits = useMemo(() => account?.lines.flatMap(line => line.benefits.map(benefit => ({
    ...benefit,
    lineKey: line.key,
    lineLabel: line.label
  }))).filter((benefit, index, entries) => entries.findIndex(candidate =>
    candidate.benefitId === benefit.benefitId && candidate.lineKey === benefit.lineKey) === index) || [], [account]);
  const moratoriumLines = useMemo(() => account?.lines.filter(line => line.moratoriumStatus === 'ACTIVE') || [], [account]);
  const nextDueLine = useMemo(() => account?.lines
    .filter(line => !line.overdue)
    .filter(line => line.remainingBalance > 0 && Boolean(line.nextDueDate || line.effectiveDueDate || line.originalDueDate))
    .map(line => ({ line, date: line.nextDueDate || line.effectiveDueDate || line.originalDueDate || '' }))
    .sort((left, right) => left.date.localeCompare(right.date))[0] || null, [account]);

  const selectStudent = (nextStudentId: string) => {
    loadSequenceRef.current += 1;
    setStudentId(nextStudentId);
    setAccount(null);
    setAmounts({});
    setResult(null);
    setError('');
    setLoadFailed(false);
    attemptRef.current = null;
    setBenefitsOpen(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || saving || total <= 0) return;
    setSaving(true);
    setError('');
    const allocations = selectedLines.map(line => ({ type: line.type, installment: line.installment,
      period: line.period, feeId: line.feeId, amount: line.amount }));
    const fingerprint = JSON.stringify([school.id, studentId, school.academicYear, allocations]);
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, requestId: crypto.randomUUID() };
    }
    try {
      const call = httpsCallable<Record<string, unknown>, CollectionResult>(functions, 'recordCashCollection');
      const response = await call({ requestId: attemptRef.current.requestId, schoolId: school.id,
        studentId, academicYear: school.academicYear, allocations });
      attemptRef.current = null;
      setResult(response.data);
      onCompleted?.(response.data);
      await loadAccount(studentId);
    } catch (saveError) {
      setError(errorMessage(saveError));
      await loadAccount(studentId);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = () => {
    if (!result || !account) return;
    const pdf = new jsPDF();
    const rows = [result.receipt?.schoolName || account.school.name, `Reçu ${result.receiptNumber}`, `${result.receipt?.studentName || account.student.name} — ${result.receipt?.className || account.student.className}`,
      `Année scolaire ${result.receipt?.academicYear || account.academicYear}`,
      `Matricule : ${result.receipt?.matricule || account.student.matricule}`,
      `Date serveur : ${result.receipt?.issuedAt || 'Voir reçu enregistré'}`,
      `Caissier : ${result.receipt?.cashier || 'Voir reçu enregistré'}`, '',
      ...result.lineItems.flatMap(line => [line.label, ...(line.netExpectedAmount === undefined ? [] : [`Montant attendu : ${formatCurrency(line.netExpectedAmount)}`]), `Versé : ${formatCurrency(line.amount)} — Reste : ${formatCurrency(line.remainingBalance)}`]),
      '', `TOTAL: ${formatCurrency(result.amount)}`, 'Mode: Espèces', `Reste sur les frais du reçu: ${formatCurrency(result.remainingBalance)}`,
      `Opération: ${result.collectionId}`];
    pdf.setFont('helvetica', 'normal');
    let y = 20;
    for (const row of rows) {
      const wrapped = pdf.splitTextToSize(row, 172) as string[];
      for (const text of wrapped) {
        if (y > 275) { pdf.addPage(); y = 20; }
        pdf.text(text, 18, y); y += 8;
      }
    }
    pdf.save(`${result.receiptNumber}.pdf`);
  };

  const startNew = () => {
    setResult(null);
    setAmounts({});
    setError('');
    void loadAccount(studentId);
  };

  if (result && account) return (
    <section className="student-account-success" aria-live="polite">
      <CheckCircle size={44} aria-hidden="true" />
      <h2>Encaissement enregistré ✓</h2>
      <p>Le reçu <strong>{result.receiptNumber}</strong> a été généré automatiquement.</p>
      {result.idempotentReplay && <p className="account-notice">Cette demande avait déjà été traitée : aucun doublon n’a été créé.</p>}
      <div className="student-account-receipt">
        <h3>{account.school.name}</h3>
        <p>{result.receipt?.studentName || account.student.name} · {result.receipt?.className || account.student.className} · {formatSchoolYear(result.receipt?.academicYear || account.academicYear)}</p>
        <p>Matricule : {result.receipt?.matricule || account.student.matricule}</p>
        {result.receipt && <p>Date serveur : {result.receipt.issuedAt} · Caissier : {result.receipt.cashier}</p>}
        {result.lineItems.map(line => <div className="receipt-line" key={line.key}><span>{line.label}{line.netExpectedAmount !== undefined && <small> · Attendu : {formatCurrency(line.netExpectedAmount)}</small>}<small> · Reste : {formatCurrency(line.remainingBalance)}</small>{!!line.discountAmount && <small> · Avantage : {formatCurrency(line.discountAmount)}</small>}</span><strong>Versé : {formatCurrency(line.amount)}</strong></div>)}
        <div className="receipt-total"><span>Total reçu — Espèces</span><strong>{formatCurrency(result.amount)}</strong></div>
        <small>Opération : {result.collectionId}</small>
      </div>
      <div className="account-actions">
        <button type="button" className="secondary" onClick={() => window.print()}><Printer size={18} /> Imprimer</button>
        <button type="button" className="secondary" onClick={downloadPdf}><FileDown size={18} /> Télécharger PDF</button>
        <button type="button" onClick={startNew}><RefreshCw size={18} /> Nouvel encaissement</button>
        <button type="button" className="secondary" onClick={onClose}>Fermer</button>
      </div>
    </section>
  );

  return (
    <form className="student-account-collection" onSubmit={submit}>
      <div className="student-account-header">
        <div>
          <label htmlFor="cash-payment-student">Élève</label>
          <select id="cash-payment-student" data-testid="cash-payment-student" required value={studentId}
            onChange={event => selectStudent(event.target.value)}>
            <option value="">-- Choisir un élève --</option>
            {visibleStudents.map(student => <option key={student.id} value={student.id}>
              {student.name} — {classNamesById[student.classId || ''] || 'Classe non renseignée'} — {student.matricule || 'Sans matricule'}
            </option>)}
          </select>
        </div>
        <div>
          <label htmlFor="student-account-search">Filtrer la liste <span>(facultatif)</span></label>
          <div className="student-search"><Search size={18} aria-hidden="true" />
            <input id="student-account-search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Nom, prénom ou matricule" autoComplete="off" /></div>
        </div>
      </div>

      {!studentId && <p className="account-empty">Choisissez un élève pour afficher immédiatement sa situation financière.</p>}
      {loading && <p className="account-loading" role="status">Chargement de la situation financière...</p>}
      {error && <div className="account-error" role="alert"><p>{error}</p>
        {loadFailed && <button type="button" className="secondary" onClick={() => void loadAccount(studentId)}>Réessayer</button>}
      </div>}
      {account && !loading && <>
        <div className="student-identity">
          <div><strong>{account.student.name}</strong><span>{account.student.matricule || 'Sans matricule'}</span></div>
          <div><span>Classe</span><strong>{account.student.className || 'Non renseignée'}</strong></div>
          <div><span>Année scolaire</span><strong>{formatSchoolYear(account.academicYear)}</strong></div>
        </div>
        <h3 className="account-section-title">Situation financière</h3>
        <div className="account-summary" aria-label="Résumé financier">
          <div><span>Total facturé</span><strong>{formatCurrency(account.totals.totalBilled)}</strong></div>
          <div><span>Avantages</span><strong>{account.totals.totalBenefits > 0
            ? `- ${formatCurrency(account.totals.totalBenefits)}`
            : formatCurrency(0)}</strong></div>
          <div><span>Déjà payé</span><strong>{formatCurrency(account.totals.totalPaid)}</strong></div>
          <div className="summary-remaining"><span>Reste total</span><strong>{formatCurrency(account.totals.totalRemaining)}</strong></div>
          {nextDueLine && <div className="summary-next-due"><span>Prochaine échéance</span>
            <strong>{formatDueDate(nextDueLine.date)}</strong><small>{nextDueLine.line.label}</small></div>}
          {account.totals.overdueAmount > 0 && <div className="summary-overdue"><span>En retard</span><strong>{formatCurrency(account.totals.overdueAmount)}</strong></div>}
        </div>
        <section className="account-benefits" aria-labelledby="benefits-title">
          {['owner', 'director', 'secretary', 'superAdmin'].includes(currentRole) && (
            <div className="account-benefits-actions">
              <button type="button" className="secondary" onClick={() => setBenefitsOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                {activeBenefits.length === 0 && moratoriumLines.length === 0
                  ? 'Ajouter un avantage / aménagement' : 'Ajouter'}
              </button>
              {(activeBenefits.length > 0 || moratoriumLines.length > 0) && (
                <button type="button" className="secondary" onClick={() => setBenefitsOpen(true)}>Voir / gérer</button>
              )}
            </div>
          )}
          <div><h3 id="benefits-title">Avantages &amp; aménagements</h3>
            {activeBenefits.length === 0 && moratoriumLines.length === 0
              ? <p>Aucun avantage financier actif.</p>
              : <div className="benefit-list">
                {activeBenefits.map(benefit => <p key={`${benefit.benefitId}-${benefit.lineKey}`}>
                  <CheckCircle size={16} aria-hidden="true" /> <strong>{benefitTypeLabel(benefit.benefitType)}</strong>
                  <span>{benefit.lineLabel} · - {formatCurrency(benefit.discountAmount)}</span>
                </p>)}
                {moratoriumLines.map(line => <p key={`moratorium-${line.key}`}>
                  <strong>Moratoire actif</strong><span>{line.label} · Nouvelle échéance : {formatDueDate(line.effectiveDueDate)}</span>
                </p>)}
              </div>}
          </div>
        </section>
        <div className="account-workspace">
          <section className="obligations" aria-labelledby="obligations-title">
            <h3 id="obligations-title">Frais à régler</h3>
            <div className="obligation-list">
              {payableLines.length === 0 && <p className="no-fees">Aucun frais à régler pour cet élève.</p>}
              <AccountFeeGroups key={studentId} groups={account.groups} lines={account.groups ? account.lines : payableLines} renderLine={line => <article className="obligation-row" key={line.key}>
                <div className="obligation-main">
                  <strong>{line.label}</strong>
                  <div className="obligation-status-group">
                    <span className={`account-status status-${statusLabel(line).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(line)}</span>
                    {line.status === 'PARTIAL' && <span className="account-status">PARTIELLEMENT PAYÉ</span>}
                    {statusDueDate(line) && <span className="status-due-date">
                      {statusDueLabel(line)} : <strong>{formatDueDate(statusDueDate(line))}</strong>
                    </span>}
                  </div>
                </div>
                <div className="obligation-values">
                  <span>Tarif de référence <b>{formatCurrency(line.grossExpectedAmount)}</b></span>
                  {line.discountAmount > 0 && <span className="line-discount">Avantage <b>- {formatCurrency(line.discountAmount)}</b></span>}
                  <span>Montant dû <b>{formatCurrency(line.netExpectedAmount)}</b></span>
                  <span>Déjà payé <b>{formatCurrency(line.previousPaid)}</b></span>
                  {line.moratoriumStatus === 'ACTIVE' && <span>Échéance initiale <b>{line.originalDueDate ? formatDueDate(line.originalDueDate) : 'Non configurée'}</b></span>}
                  {line.moratoriumStatus === 'ACTIVE' && <span className="line-effective-due">Échéance effective <b>{line.effectiveDueDate ? formatDueDate(line.effectiveDueDate) : 'Non configurée'}</b></span>}
                  <span className="line-remaining">Reste à payer <b>{formatCurrency(line.remainingBalance)}</b></span>
                </div>
                {line.benefits.length > 0 && <details><summary>Détails du calcul</summary>
                  {line.benefits.map(benefit => <p key={benefit.benefitId}>{benefitTypeLabel(benefit.benefitType)} : - {formatCurrency(benefit.discountAmount)} {benefit.reference ? `(${benefit.reference})` : ''}</p>)}</details>}
                <div className="allocation-control"><label className="allocation-input">Montant reçu
                  <input type="number" min="1" max={line.type === 'transport' ? undefined : line.remainingBalance} step="1"
                    disabled={!line.selectable} value={amounts[line.key] || ''}
                    onChange={event => setAmounts(previous => ({ ...previous, [line.key]: event.target.value }))}
                    aria-label={`Montant reçu pour ${line.label}`} placeholder="0" /></label>
                  <button type="button" className="secondary settle-button" disabled={!line.selectable}
                    onClick={() => setAmounts(previous => ({ ...previous, [line.key]: String(line.remainingBalance) }))}>
                    Solder {formatCurrency(line.remainingBalance)}
                  </button></div>
              </article>} />
            </div>
            {!account.groups && settledLines.length > 0 && <details className="settled-fees"><summary>Frais soldés ({settledLines.length})</summary>
              <div>{settledLines.map(line => <div className="settled-fee" key={line.key}>
                <strong>{line.label}</strong>
                <span>Échéance initiale : {line.originalDueDate ? formatDueDate(line.originalDueDate) : 'Non configurée'}</span>
                {line.moratoriumStatus === 'ACTIVE' && <span>Échéance effective : {line.effectiveDueDate ? formatDueDate(line.effectiveDueDate) : 'Non configurée'}</span>}
                <span>Reste à payer : {formatCurrency(line.remainingBalance)}</span>
                <div className="settled-status-group">
                  <span className="account-status status-soldé">SOLDÉ</span>
                  {statusDueDate(line) && <span className="status-due-date">{statusDueLabel(line)} : <strong>{formatDueDate(statusDueDate(line))}</strong></span>}
                </div>
              </div>)}</div>
            </details>}
          </section>
          <aside className="collection-basket" aria-labelledby="basket-title">
            <h3 id="basket-title">Paiement en cours</h3>
            {selectedLines.length === 0 ? <p>Saisissez un montant sur un ou plusieurs frais.</p> : selectedLines.map(line =>
              <div className="basket-line" key={line.key}><span>{line.label}</span><strong>{formatCurrency(line.amount)}</strong></div>)}
            <div className="basket-total"><span>Total reçu</span><strong>{formatCurrency(total)}</strong></div>
            <fieldset><legend>Mode de paiement</legend>
              <label><input type="radio" checked readOnly /> Espèces</label>
              <label className="disabled-method"><input type="radio" disabled /> Mobile Money <small>Disponible uniquement pour un paiement simple</small></label>
            </fieldset>
            <button type="submit" data-testid="cash-payment-submit" disabled={saving || total <= 0}>
              {saving ? 'Validation sécurisée…' : `ENCAISSER ${formatCurrency(total)}`}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>Annuler</button>
          </aside>
        </div>
        <StudentAccountBenefitsDrawer
          open={benefitsOpen}
          schoolId={school.id}
          studentId={studentId}
          academicYear={school.academicYear}
          currentRole={currentRole}
          targets={account.lines}
          onClose={() => setBenefitsOpen(false)}
          onChanged={() => loadAccount(studentId)}
        />
      </>}
    </form>
  );
};

export default StudentAccountCollection;
