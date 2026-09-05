import React, { useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { jsPDF } from 'jspdf';
import { CheckCircle, FileDown, Printer, RefreshCw, Search } from 'lucide-react';
import { functions } from '../db/firebase';
import type { School, Student } from '../types';
import { formatCurrency } from '../utils/paymentReceipt';
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
  moratoriumStatus: 'NONE' | 'ACTIVE' | 'EXPIRED';
  effectiveDueDate: string | null;
  overdue: boolean;
  dueStatus: string;
  selectable: boolean;
}

interface StudentAccount {
  student: { id: string; name: string; matricule: string; classId: string; className: string };
  school: { id: string; name: string };
  academicYear: string;
  totals: { totalBilled: number; totalBenefits: number; totalPaid: number; totalRemaining: number; overdueAmount: number };
  lines: AccountLine[];
}

interface CollectionResult {
  collectionId: string;
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  amount: number;
  remainingBalance: number;
  idempotentReplay: boolean;
  lineItems: Array<{ key: string; label: string; amount: number; remainingBalance: number }>;
}

interface Props {
  students: Student[];
  school: School;
  initialStudentId?: string;
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
  if (line.status === 'PARTIAL') return 'PARTIELLEMENT PAYÉ';
  if (line.dueStatus === 'NOT_DUE') return 'À VENIR';
  return 'À PAYER';
};

const normalizeAmount = (value: string): number => {
  if (!/^\d+$/.test(value.trim())) return 0;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : 0;
};

const StudentAccountCollection: React.FC<Props> = ({ students, school, initialStudentId, onClose, onCompleted }) => {
  const [studentId, setStudentId] = useState(initialStudentId || '');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CollectionResult | null>(null);
  const attemptRef = useRef<{ fingerprint: string; requestId: string } | null>(null);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    if (!query) return students;
    return students.filter(student => `${student.name} ${student.matricule || ''}`.toLocaleLowerCase('fr').includes(query));
  }, [search, students]);

  const loadAccount = async (selectedId = studentId) => {
    if (!selectedId) {
      setAccount(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const call = httpsCallable<Record<string, string>, StudentAccount>(functions, 'getStudentFinancialAccount');
      const response = await call({ schoolId: school.id, studentId: selectedId, academicYear: school.academicYear });
      setAccount(response.data);
      setAmounts(previous => Object.fromEntries(response.data.lines.map(line => [line.key,
        previous[line.key] && normalizeAmount(previous[line.key]) <= line.remainingBalance ? previous[line.key] : ''])));
    } catch (loadError) {
      setAccount(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
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
    const rows = [account.school.name, `Reçu ${result.receiptNumber}`, `${account.student.name} — ${account.student.className}`,
      `Année scolaire ${account.academicYear}`, '', ...result.lineItems.map(line => `${line.label}: ${formatCurrency(line.amount)}`),
      '', `TOTAL: ${formatCurrency(result.amount)}`, 'Mode: Espèces', `Reste du compte: ${formatCurrency(account.totals.totalRemaining)}`,
      `Opération: ${result.collectionId}`];
    pdf.setFont('helvetica', 'normal');
    rows.forEach((row, index) => pdf.text(row, 18, 20 + index * 8));
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
      <h2>Encaissement validé</h2>
      <p>Le reçu <strong>{result.receiptNumber}</strong> a été généré automatiquement.</p>
      {result.idempotentReplay && <p className="account-notice">Cette demande avait déjà été traitée : aucun doublon n’a été créé.</p>}
      <div className="student-account-receipt">
        <h3>{account.school.name}</h3>
        <p>{account.student.name} · {account.student.className} · {account.academicYear}</p>
        {result.lineItems.map(line => <div className="receipt-line" key={line.key}><span>{line.label}</span><strong>{formatCurrency(line.amount)}</strong></div>)}
        <div className="receipt-total"><span>Total reçu — Espèces</span><strong>{formatCurrency(result.amount)}</strong></div>
        <small>Opération : {result.collectionId}</small>
      </div>
      <div className="account-actions">
        <button type="button" className="secondary" onClick={() => window.print()}><Printer size={18} /> Imprimer</button>
        <button type="button" className="secondary" onClick={downloadPdf}><FileDown size={18} /> Télécharger PDF</button>
        <button type="button" onClick={startNew}><RefreshCw size={18} /> Nouvel encaissement</button>
      </div>
    </section>
  );

  return (
    <form className="student-account-collection" onSubmit={submit}>
      <div className="student-account-header">
        <div>
          <label htmlFor="student-account-search">Rechercher un élève</label>
          <div className="student-search"><Search size={18} aria-hidden="true" />
            <input id="student-account-search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Nom ou matricule" autoComplete="off" /></div>
        </div>
        <div>
          <label htmlFor="cash-payment-student">Élève</label>
          <select id="cash-payment-student" data-testid="cash-payment-student" required value={studentId}
            onChange={event => { setStudentId(event.target.value); setResult(null); setAmounts({}); }}>
            <option value="">-- Choisir --</option>
            {visibleStudents.map(student => <option key={student.id} value={student.id}>{student.name} ({student.matricule || student.section})</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="account-loading" role="status">Calcul sécurisé du compte en cours…</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {account && !loading && <>
        <div className="student-identity">
          <div><strong>{account.student.name}</strong><span>{account.student.matricule || 'Sans matricule'}</span></div>
          <div><span>Classe</span><strong>{account.student.className || 'Non renseignée'}</strong></div>
          <div><span>Année scolaire</span><strong>{account.academicYear}</strong></div>
        </div>
        <div className="account-summary" aria-label="Résumé financier">
          <div><span>Total facturé</span><strong>{formatCurrency(account.totals.totalBilled)}</strong></div>
          <div><span>Aides approuvées</span><strong>- {formatCurrency(account.totals.totalBenefits)}</strong></div>
          <div><span>Total payé</span><strong>{formatCurrency(account.totals.totalPaid)}</strong></div>
          <div className="summary-remaining"><span>Reste total</span><strong>{formatCurrency(account.totals.totalRemaining)}</strong></div>
          {account.totals.overdueAmount > 0 && <div className="summary-overdue"><span>En retard</span><strong>{formatCurrency(account.totals.overdueAmount)}</strong></div>}
        </div>
        <div className="account-workspace">
          <section className="obligations" aria-labelledby="obligations-title">
            <h3 id="obligations-title">Frais applicables</h3>
            <div className="obligation-list">
              {account.lines.map(line => <article className="obligation-row" key={line.key}>
                <div className="obligation-main">
                  <strong>{line.label}</strong>
                  <span className={`account-status status-${statusLabel(line).toLowerCase().replace(/\s+/g, '-')}`}>{statusLabel(line)}</span>
                  {line.discountAmount > 0 && <span className="benefit-label">RÉDUCTION APPLIQUÉE</span>}
                </div>
                <div className="obligation-values"><span>Prévu <b>{formatCurrency(line.grossExpectedAmount)}</b></span>
                  <span>Payé <b>{formatCurrency(line.previousPaid)}</b></span><span>Reste <b>{formatCurrency(line.remainingBalance)}</b></span></div>
                {line.moratoriumStatus === 'ACTIVE' && <small>Moratoire jusqu’au {line.effectiveDueDate || 'terme approuvé'}</small>}
                {line.benefits.length > 0 && <details><summary>Détails du calcul</summary>
                  {line.benefits.map(benefit => <p key={benefit.benefitId}>{benefit.benefitType} : - {formatCurrency(benefit.discountAmount)} {benefit.reference ? `(${benefit.reference})` : ''}</p>)}</details>}
                <label className="allocation-input">Montant reçu
                  <input type="number" min="1" max={line.type === 'transport' ? undefined : line.remainingBalance} step="1"
                    disabled={!line.selectable} value={amounts[line.key] || ''}
                    onChange={event => setAmounts(previous => ({ ...previous, [line.key]: event.target.value }))}
                    aria-label={`Montant reçu pour ${line.label}`} placeholder={line.selectable ? '0' : 'Soldé'} /></label>
              </article>)}
            </div>
          </section>
          <aside className="collection-basket" aria-labelledby="basket-title">
            <h3 id="basket-title">Ventilation</h3>
            {selectedLines.length === 0 ? <p>Saisissez un montant sur un ou plusieurs frais.</p> : selectedLines.map(line =>
              <div className="basket-line" key={line.key}><span>{line.label}</span><strong>{formatCurrency(line.amount)}</strong></div>)}
            <div className="basket-total"><span>TOTAL</span><strong>{formatCurrency(total)}</strong></div>
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
      </>}
    </form>
  );
};

export default StudentAccountCollection;
