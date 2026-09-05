import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle, Clock3, Plus, X, XCircle } from 'lucide-react';
import { db, functions } from '../db/firebase';
import type { FinancialBenefit, FinancialBenefitMode, FinancialBenefitType, GlobalRole } from '../types';
import { formatCurrency } from '../utils/paymentReceipt';
import './StudentAccountBenefitsDrawer.css';

export interface AdvantageTarget {
  key: string;
  type: 'registration_fee' | 'tuition' | 'transport' | 'uniforms' | 'other';
  label: string;
  installment: 'T1' | 'T2' | 'T3' | 'ALL_TUITION' | null;
  period: string | null;
  originalDueDate: string | null;
  effectiveDueDate: string | null;
}

type WorkflowStatus = 'draft' | 'pending' | 'approved' | 'applied' | 'settled' | 'rejected' | 'cancelled';

interface MoratoriumRecord {
  id: string;
  schoolId: string;
  studentId: string;
  academicYear: string;
  paymentType: 'registration_fee' | 'tuition' | 'transport';
  installment?: 'T1' | 'T2' | 'T3';
  period?: string;
  originalDueDate?: string;
  effectiveDueDate: string;
  reason: string;
  status: WorkflowStatus;
}

interface Props {
  open: boolean;
  schoolId: string;
  studentId: string;
  academicYear: string;
  currentRole: GlobalRole;
  targets: AdvantageTarget[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

type DrawerType = FinancialBenefitType | 'MORATORIUM';

const typeLabels: Record<DrawerType, string> = {
  SCHOLARSHIP: 'Bourse',
  FAMILY_DISCOUNT: 'Réduction familiale',
  DISCOUNT_VOUCHER: 'Bon de réduction',
  EXCEPTIONAL_DISCOUNT: 'Remise exceptionnelle',
  MORATORIUM: 'Moratoire'
};

const statusLabels: Record<WorkflowStatus, string> = {
  draft: 'BROUILLON',
  pending: 'EN ATTENTE',
  approved: 'APPROUVÉ',
  applied: 'APPROUVÉ',
  settled: 'APPROUVÉ',
  rejected: 'REFUSÉ',
  cancelled: 'ANNULÉ'
};

const formatDate = (value?: string | null): string => {
  if (!value) return 'Non configurée';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const errorText = (error: unknown): string => {
  const candidate = error as { message?: string; details?: { businessCode?: string } };
  const code = candidate.details?.businessCode;
  const labels: Record<string, string> = {
    CROSS_SCHOOL_DENIED: 'Cette cible appartient à une autre école.',
    INVALID_ACADEMIC_YEAR: 'L’année scolaire de la cible est invalide.',
    PAYMENT_ALREADY_EXISTS: 'Un paiement existe déjà sur ce périmètre.',
    NON_STACKABLE_BENEFIT_CONFLICT: 'Un avantage non cumulable existe déjà sur ce périmètre.',
    INVALID_MORATORIUM_DATE: 'La nouvelle échéance doit être postérieure à l’échéance actuelle.',
    MORATORIUM_CONFLICT: 'Un moratoire approuvé existe déjà pour cette échéance.',
    PERMISSION_DENIED: 'Vous ne disposez pas de cette autorisation.'
  };
  return (code && labels[code]) || candidate.message || 'L’opération a échoué.';
};

const StudentAccountBenefitsDrawer: React.FC<Props> = ({
  open,
  schoolId,
  studentId,
  academicYear,
  currentRole,
  targets,
  onClose,
  onChanged
}) => {
  const canRequest = ['owner', 'director', 'secretary', 'superAdmin'].includes(currentRole);
  const canApprove = ['owner', 'director', 'superAdmin'].includes(currentRole);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [benefits, setBenefits] = useState<FinancialBenefit[]>([]);
  const [moratoriums, setMoratoriums] = useState<MoratoriumRecord[]>([]);
  const [drawerType, setDrawerType] = useState<DrawerType>('SCHOLARSHIP');
  const [mode, setMode] = useState<FinancialBenefitMode>('FIXED_AMOUNT');
  const [value, setValue] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [stackable, setStackable] = useState(true);
  const [reference, setReference] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const dirty = Boolean(value || targetKey || validFrom || validUntil || reference || newDueDate || reason);

  const benefitTargets = useMemo(() => {
    const scoped = targets.filter(item =>
      item.type === 'tuition' || (item.type === 'transport' && Boolean(item.period)));
    return targets.some(item => item.type === 'tuition')
      ? [{
          key: 'tuition:ALL_TUITION',
          type: 'tuition' as const,
          label: 'Toute la scolarité de l’année',
          installment: 'ALL_TUITION' as const,
          period: null,
          originalDueDate: null,
          effectiveDueDate: null
        }, ...scoped]
      : scoped;
  }, [targets]);
  const moratoriumTargets = useMemo(() => targets.filter(item =>
    ['registration_fee', 'tuition', 'transport'].includes(item.type) && Boolean(item.originalDueDate)), [targets]);
  const selectableTargets = drawerType === 'MORATORIUM' ? moratoriumTargets : benefitTargets;
  const selectedTarget = selectableTargets.find(item => item.key === targetKey) || null;

  const refresh = useCallback(async () => {
    if (!schoolId || !studentId) return;
    setLoading(true);
    try {
      const [benefitSnapshot, moratoriumSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'financialBenefits'), where('schoolId', '==', schoolId))),
        getDocs(query(collection(db, 'paymentMoratoriums'), where('schoolId', '==', schoolId)))
      ]);
      setBenefits(benefitSnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }) as FinancialBenefit)
        .filter(item => item.studentId === studentId && item.academicYear === academicYear));
      setMoratoriums(moratoriumSnapshot.docs
        .map(item => ({ id: item.id, ...item.data() }) as MoratoriumRecord)
        .filter(item => item.studentId === studentId && item.academicYear === academicYear));
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [academicYear, schoolId, studentId]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    void refresh();
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button, select, input')?.focus(), 0);
    return () => returnFocusRef.current?.focus();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!dirty && !busy) onClose();
        else setError('Enregistrez ou effacez les informations avant de fermer le panneau.');
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, dirty, onClose, open]);

  useEffect(() => {
    if (!selectableTargets.some(item => item.key === targetKey)) setTargetKey('');
  }, [selectableTargets, targetKey]);

  const resetForm = () => {
    setValue('');
    setTargetKey('');
    setValidFrom('');
    setValidUntil('');
    setReference('');
    setNewDueDate('');
    setReason('');
    setMessage('');
    setError('');
  };

  const validate = (): boolean => {
    if (!targetKey || !selectedTarget) {
      setError('Sélectionnez un périmètre valide.');
      return false;
    }
    if (!reason.trim()) {
      setError('Le motif est obligatoire.');
      return false;
    }
    if (validFrom && validUntil && validUntil < validFrom) {
      setError('La date de fin doit être postérieure à la date de début.');
      return false;
    }
    if (drawerType === 'MORATORIUM') {
      if (!newDueDate || !selectedTarget.originalDueDate || newDueDate <= selectedTarget.originalDueDate) {
        setError('La nouvelle échéance doit être postérieure à l’échéance actuelle.');
        return false;
      }
      return true;
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || (mode === 'PERCENTAGE' && parsed > 100)) {
      setError(mode === 'PERCENTAGE'
        ? 'Le pourcentage doit être un entier compris entre 1 et 100.'
        : 'Le montant doit être un entier FCFA positif.');
      return false;
    }
    if (drawerType === 'DISCOUNT_VOUCHER' && !reference.trim()) {
      setError('La référence du bon est obligatoire.');
      return false;
    }
    return true;
  };

  const createDraft = async (): Promise<{ id: string; kind: 'benefit' | 'moratorium' } | null> => {
    if (!validate() || !selectedTarget) return null;
    const requestId = crypto.randomUUID();
    if (drawerType === 'MORATORIUM') {
      const call = httpsCallable<Record<string, unknown>, { moratoriumId: string }>(
        functions, 'createPaymentMoratorium'
      );
      const response = await call({
        requestId, schoolId, studentId, academicYear,
        paymentType: selectedTarget.type,
        installment: selectedTarget.installment || undefined,
        period: selectedTarget.period || undefined,
        effectiveDueDate: newDueDate,
        reason: reason.trim()
      });
      return { id: response.data.moratoriumId, kind: 'moratorium' };
    }
    const call = httpsCallable<Record<string, unknown>, { benefitId: string }>(
      functions, 'createFinancialBenefit'
    );
    const response = await call({
      requestId, schoolId, studentId, academicYear,
      benefitType: drawerType,
      paymentType: selectedTarget.type === 'tuition' ? 'TUITION' : 'TRANSPORT',
      mode,
      value: Number(value),
      installment: selectedTarget.type === 'tuition' ? selectedTarget.installment : undefined,
      transportStartPeriod: selectedTarget.type === 'transport' ? selectedTarget.period : undefined,
      transportEndPeriod: selectedTarget.type === 'transport' ? selectedTarget.period : undefined,
      stackable,
      reason: reason.trim(),
      reference: drawerType === 'DISCOUNT_VOUCHER' ? reference.trim() : undefined,
      singleUse: drawerType === 'DISCOUNT_VOUCHER',
      maximumUses: 1,
      validFrom: validFrom || undefined,
      validUntil: validUntil || undefined
    });
    return { id: response.data.benefitId, kind: 'benefit' };
  };

  const save = async (submit: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await createDraft();
      if (!created) return;
      if (submit) {
        const functionName = created.kind === 'benefit'
          ? 'submitFinancialBenefit' : 'submitPaymentMoratorium';
        const call = httpsCallable<Record<string, string>, { status: string }>(functions, functionName);
        await call(created.kind === 'benefit'
          ? { benefitId: created.id }
          : { moratoriumId: created.id });
      }
      resetForm();
      setMessage(submit ? 'Demande soumise pour approbation.' : 'Brouillon enregistré.');
      await refresh();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (
    kind: 'benefit' | 'moratorium',
    id: string,
    action: 'submit' | 'approve' | 'reject'
  ) => {
    if (busy) return;
    let rejectionReason = '';
    if (action === 'reject') {
      rejectionReason = window.prompt('Motif du refus :')?.trim() || '';
      if (!rejectionReason) return;
    }
    const names = {
      benefit: {
        submit: 'submitFinancialBenefit',
        approve: 'approveFinancialBenefit',
        reject: 'rejectFinancialBenefit'
      },
      moratorium: {
        submit: 'submitPaymentMoratorium',
        approve: 'approvePaymentMoratorium',
        reject: 'rejectPaymentMoratorium'
      }
    };
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const call = httpsCallable<Record<string, string>, { status: string }>(
        functions, names[kind][action]
      );
      const idField = kind === 'benefit' ? 'benefitId' : 'moratoriumId';
      await call({ [idField]: id, ...(rejectionReason ? { reason: rejectionReason } : {}) });
      setMessage(action === 'submit' ? 'Demande soumise.' : action === 'approve' ? 'Demande approuvée.' : 'Demande refusée.');
      await refresh();
      if (action === 'approve') await onChanged();
    } catch (transitionError) {
      setError(errorText(transitionError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const records = [
    ...benefits.map(item => ({
      id: item.id,
      kind: 'benefit' as const,
      type: typeLabels[item.benefitType],
      status: item.status as WorkflowStatus,
      detail: item.mode === 'PERCENTAGE' ? `- ${item.value} %` : `- ${formatCurrency(item.value)}`,
      scope: item.installment === 'ALL_TUITION' ? 'Toute la scolarité'
        : item.installment ? `Scolarité ${item.installment}`
          : item.transportStartPeriod === item.transportEndPeriod ? `Transport ${item.transportStartPeriod}`
            : `Transport ${item.transportStartPeriod} → ${item.transportEndPeriod}`
    })),
    ...moratoriums.map(item => ({
      id: item.id,
      kind: 'moratorium' as const,
      type: 'Moratoire',
      status: item.status,
      detail: `Nouvelle échéance : ${formatDate(item.effectiveDueDate)}`,
      scope: targets.find(target => target.type === item.paymentType
        && (item.paymentType !== 'tuition' || target.installment === item.installment)
        && (item.paymentType !== 'transport' || target.period === item.period))?.label || 'Échéance ciblée'
    }))
  ];

  return (
    <div className="advantage-drawer-layer">
      <button type="button" className="advantage-drawer-backdrop" aria-label="Fermer le panneau"
        onClick={() => !dirty && !busy && onClose()} />
      <div ref={dialogRef} className="advantage-drawer" role="dialog" aria-modal="true"
        aria-labelledby="advantage-drawer-title">
        <header>
          <div>
            <span className="advantage-eyebrow">Encaissement V3</span>
            <h2 id="advantage-drawer-title">Ajouter un avantage ou aménagement</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Fermer"
            onClick={() => !dirty && !busy ? onClose() : setError('Effacez le formulaire avant de fermer.')}>
            <X size={20} />
          </button>
        </header>

        <div className="advantage-drawer-body">
          {error && <p className="advantage-alert error" role="alert">{error}</p>}
          {message && <p className="advantage-alert success" role="status">{message}</p>}

          {canRequest && (
            <section className="advantage-form" aria-label="Nouvelle demande">
              <label>Type
                <select value={drawerType} onChange={event => { setDrawerType(event.target.value as DrawerType); resetForm(); }}>
                  {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>

              {drawerType !== 'MORATORIUM' && <label>Mode
                <select value={mode} onChange={event => setMode(event.target.value as FinancialBenefitMode)}>
                  <option value="FIXED_AMOUNT">Montant fixe</option>
                  <option value="PERCENTAGE">Pourcentage</option>
                </select>
              </label>}

              <label className="wide-field">S’applique à
                <select value={targetKey} onChange={event => setTargetKey(event.target.value)}>
                  <option value="">-- Sélectionner une échéance --</option>
                  {selectableTargets.map(target => <option key={target.key} value={target.key}>{target.label}</option>)}
                </select>
              </label>

              {drawerType === 'MORATORIUM' ? (
                <>
                  <div className="moratorium-notice wide-field">
                    <strong>Montant dû inchangé.</strong>
                    <span>Seule la date d’exigibilité est modifiée après approbation.</span>
                  </div>
                  <label>Échéance actuelle
                    <input value={formatDate(selectedTarget?.originalDueDate)} readOnly />
                  </label>
                  <label>Nouvelle échéance
                    <input type="date" value={newDueDate} min={selectedTarget?.originalDueDate || undefined}
                      onChange={event => setNewDueDate(event.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label>{mode === 'PERCENTAGE' ? 'Pourcentage' : 'Montant'}
                    <div className="amount-field">
                      <input type="number" min="1" max={mode === 'PERCENTAGE' ? 100 : undefined}
                        step="1" value={value} onChange={event => setValue(event.target.value)} />
                      <span>{mode === 'PERCENTAGE' ? '%' : 'FCFA'}</span>
                    </div>
                  </label>
                  {drawerType === 'DISCOUNT_VOUCHER' && <label>Code / référence
                    <input value={reference} maxLength={80} onChange={event => setReference(event.target.value)} />
                  </label>}
                  <label>Valide à partir du
                    <input type="date" value={validFrom} onChange={event => setValidFrom(event.target.value)} />
                  </label>
                  <label>Valide jusqu’au
                    <input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} />
                  </label>
                  <label className="checkbox-field wide-field">
                    <input type="checkbox" checked={stackable} onChange={event => setStackable(event.target.checked)} />
                    Cumulable selon les règles du moteur financier
                  </label>
                </>
              )}

              <label className="wide-field">Motif
                <textarea rows={4} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}
                  aria-describedby="advantage-reason-help" />
                <small id="advantage-reason-help">Obligatoire pour garantir la traçabilité.</small>
              </label>
              <div className="advantage-form-actions wide-field">
                <button type="button" className="secondary" disabled={busy} onClick={() => void save(false)}>
                  Enregistrer le brouillon
                </button>
                <button type="button" disabled={busy} onClick={() => void save(true)}>
                  Soumettre pour approbation
                </button>
                {dirty && <button type="button" className="text-button" disabled={busy} onClick={resetForm}>Effacer</button>}
              </div>
            </section>
          )}

          <section className="advantage-history" aria-labelledby="advantage-history-title">
            <div className="advantage-history-heading">
              <h3 id="advantage-history-title">Demandes de l’élève</h3>
              <button type="button" className="secondary" disabled={loading || busy} onClick={() => void refresh()}>
                Actualiser
              </button>
            </div>
            {loading && <p role="status">Chargement des demandes…</p>}
            {!loading && records.length === 0 && <p>Aucune demande enregistrée.</p>}
            {records.map(record => <article key={`${record.kind}-${record.id}`} className="advantage-record">
              <div>
                <strong>{record.type}</strong>
                <span>{record.detail}</span>
                <small>{record.scope}</small>
              </div>
              <div className="advantage-record-state">
                <span className={`workflow-badge status-${record.status}`}>
                  {record.status === 'approved' || record.status === 'applied' || record.status === 'settled'
                    ? <CheckCircle size={14} /> : record.status === 'rejected'
                      ? <XCircle size={14} /> : <Clock3 size={14} />}
                  {statusLabels[record.status]}
                </span>
                <div className="advantage-record-actions">
                  {record.status === 'draft' && canRequest && <button type="button" className="secondary"
                    disabled={busy} onClick={() => void transition(record.kind, record.id, 'submit')}>Soumettre</button>}
                  {record.status === 'pending' && canApprove && <>
                    <button type="button" disabled={busy}
                      onClick={() => void transition(record.kind, record.id, 'approve')}>Approuver</button>
                    <button type="button" className="secondary danger" disabled={busy}
                      onClick={() => void transition(record.kind, record.id, 'reject')}>Refuser</button>
                  </>}
                </div>
              </div>
            </article>)}
          </section>
        </div>
      </div>
    </div>
  );
};

export const AdvantageAddIcon = Plus;
export default StudentAccountBenefitsDrawer;

