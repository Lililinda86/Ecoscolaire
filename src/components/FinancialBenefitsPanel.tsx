import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../db/firebase';
import type {
  FinancialBenefit,
  FinancialBenefitMode,
  FinancialBenefitType
} from '../types';

type Props = {
  schoolId: string;
  studentId: string;
  academicYear: string;
  paymentType: 'tuition' | 'transport';
  installment?: 'T1' | 'T2' | 'T3';
  period?: string;
  currentRole?: string;
  onChanged: () => void;
};

const labels: Record<FinancialBenefitType, string> = {
  SCHOLARSHIP: 'Bourse',
  DISCOUNT_VOUCHER: 'Bon de réduction',
  FAMILY_DISCOUNT: 'Réduction familiale',
  EXCEPTIONAL_DISCOUNT: 'Remise exceptionnelle'
};

const isApplicable = (benefit: FinancialBenefit, props: Props): boolean => {
  if (benefit.paymentType !== (props.paymentType === 'tuition' ? 'TUITION' : 'TRANSPORT')) return false;
  if (props.paymentType === 'tuition') {
    return benefit.installment === props.installment || benefit.installment === 'ALL_TUITION';
  }
  return !!props.period && !!benefit.transportStartPeriod && !!benefit.transportEndPeriod
    && props.period >= benefit.transportStartPeriod && props.period <= benefit.transportEndPeriod;
};

const FinancialBenefitsPanel: React.FC<Props> = (props) => {
  const canApprove = ['owner', 'director', 'superAdmin'].includes(props.currentRole || '');
  const [benefits, setBenefits] = useState<FinancialBenefit[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [benefitType, setBenefitType] = useState<FinancialBenefitType>('SCHOLARSHIP');
  const [mode, setMode] = useState<FinancialBenefitMode>('FIXED_AMOUNT');
  const [value, setValue] = useState('');
  const [stackable, setStackable] = useState(true);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [singleUse, setSingleUse] = useState(true);
  const [maximumUses, setMaximumUses] = useState('1');
  const [scope, setScope] = useState<'CURRENT' | 'ALL_TUITION' | 'TRANSPORT_RANGE' | 'TRANSPORT_YEAR'>('CURRENT');
  const [transportStartPeriod, setTransportStartPeriod] = useState(props.period || '');
  const [transportEndPeriod, setTransportEndPeriod] = useState(props.period || '');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const [academicStartYear, academicEndYear] = props.academicYear.split('-');
  const resolvedTransportStart = scope === 'TRANSPORT_YEAR'
    ? `${academicStartYear}-09`
    : scope === 'TRANSPORT_RANGE' ? transportStartPeriod : props.period;
  const resolvedTransportEnd = scope === 'TRANSPORT_YEAR'
    ? `${academicEndYear}-06`
    : scope === 'TRANSPORT_RANGE' ? transportEndPeriod : props.period;

  const refresh = useCallback(async () => {
    if (!props.schoolId || !props.studentId) return;
    const snapshot = await getDocs(query(
      collection(db, 'financialBenefits'),
      where('schoolId', '==', props.schoolId)
    ));
    const tenantBenefits = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }) as FinancialBenefit)
      .filter(item => item.studentId === props.studentId && item.academicYear === props.academicYear);
    setBenefits(tenantBenefits);
  }, [props.academicYear, props.schoolId, props.studentId]);

  useEffect(() => {
    refresh().catch(error => console.warn('Unable to load financial benefits', error));
  }, [refresh]);

  const visibleBenefits = useMemo(() => benefits
    .filter(item => isApplicable(item, props))
    .filter(item => canApprove || ['approved', 'applied', 'settled'].includes(item.status)),
  [benefits, canApprove, props]);

  const createBenefit = async () => {
    const parsedValue = Number(value);
    const parsedMaximumUses = Number(maximumUses);
    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      alert('La valeur de l’avantage doit être un entier positif.');
      return;
    }
    if (!reason.trim()) {
      alert('Le motif est obligatoire.');
      return;
    }
    if (benefitType === 'DISCOUNT_VOUCHER' && !reference.trim()) {
      alert('La référence du bon est obligatoire.');
      return;
    }
    if (!singleUse && (!Number.isSafeInteger(parsedMaximumUses) || parsedMaximumUses <= 0)) {
      alert('Le nombre maximal d’utilisations est invalide.');
      return;
    }
    if (props.paymentType === 'transport'
        && (!resolvedTransportStart || !resolvedTransportEnd || resolvedTransportEnd < resolvedTransportStart)) {
      alert('La période transport est invalide.');
      return;
    }
    setLoading(true);
    try {
      const call = httpsCallable<Record<string, unknown>, { benefitId: string; status: string }>(
        functions, 'createFinancialBenefit'
      );
      await call({
        requestId: crypto.randomUUID(),
        schoolId: props.schoolId,
        studentId: props.studentId,
        academicYear: props.academicYear,
        benefitType,
        paymentType: props.paymentType === 'tuition' ? 'TUITION' : 'TRANSPORT',
        mode,
        value: parsedValue,
        installment: props.paymentType === 'tuition'
          ? (scope === 'ALL_TUITION' ? 'ALL_TUITION' : props.installment) : undefined,
        transportStartPeriod: props.paymentType === 'transport' ? resolvedTransportStart : undefined,
        transportEndPeriod: props.paymentType === 'transport' ? resolvedTransportEnd : undefined,
        stackable,
        reason: reason.trim(),
        reference: reference.trim() || undefined,
        singleUse: benefitType === 'DISCOUNT_VOUCHER' ? singleUse : false,
        maximumUses: benefitType === 'DISCOUNT_VOUCHER' ? (singleUse ? 1 : parsedMaximumUses) : undefined,
        validFrom: validFrom || undefined,
        validUntil: validUntil || undefined
      });
      setShowForm(false);
      setValue('');
      setReason('');
      setReference('');
      await refresh();
      props.onChanged();
    } catch (error) {
      console.error('Benefit creation failed', error);
      alert('La création de l’avantage a échoué. Vérifiez les informations et vos droits.');
    } finally {
      setLoading(false);
    }
  };

  const cancelBenefit = async (benefitId: string) => {
    const reason = window.prompt('Motif de l’annulation :')?.trim();
    if (!reason) return;
    setLoading(true);
    try {
      const call = httpsCallable<{ benefitId: string; reason: string }, { status: string }>(
        functions, 'cancelFinancialBenefit'
      );
      await call({ benefitId, reason });
      await refresh();
      props.onChanged();
    } catch (error) {
      console.error('Benefit cancellation failed', error);
      alert('L’annulation a échoué. Un avantage déjà appliqué ne peut pas être annulé.');
    } finally {
      setLoading(false);
    }
  };

  const approveBenefit = async (benefitId: string) => {
    setLoading(true);
    try {
      const call = httpsCallable<{ benefitId: string }, { status: string }>(
        functions, 'approveFinancialBenefit'
      );
      await call({ benefitId });
      await refresh();
      props.onChanged();
    } catch (error) {
      console.error('Benefit approval failed', error);
      alert('L’approbation a échoué. Aucun paiement existant ne doit chevaucher cette aide.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-label="Bourses et réductions" style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        <strong>Bourses et réductions applicables</strong>
        {canApprove && (
          <button type="button" className="secondary" onClick={() => setShowForm(value => !value)} disabled={loading}>
            {showForm ? 'Fermer' : 'Nouvel avantage'}
          </button>
        )}
      </div>

      {visibleBenefits.length === 0 ? (
        <p style={{ margin: '.75rem 0 0', color: '#64748b' }}>Aucun avantage approuvé pour cette échéance.</p>
      ) : (
        <div style={{ display: 'grid', gap: '.5rem', marginTop: '.75rem' }}>
          {visibleBenefits.map(benefit => (
            <div key={benefit.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'center', flexWrap: 'wrap', background: '#fff', padding: '.65rem', borderRadius: 6 }}>
              <span>
                <strong>{labels[benefit.benefitType]}</strong>{' — '}
                {benefit.mode === 'PERCENTAGE' ? `${benefit.value} %` : `${benefit.value.toLocaleString('fr-FR')} FCFA`}
                {benefit.reference ? ` — ${benefit.reference}` : ''}
                {benefit.stackable ? ' — cumulable' : ' — non cumulable'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ fontSize: '.8rem', fontWeight: 700 }}>{benefit.status.toUpperCase()}</span>
                {canApprove && benefit.status === 'draft' && (
                  <button type="button" onClick={() => approveBenefit(benefit.id)} disabled={loading}>Approuver</button>
                )}
                {canApprove && (benefit.status === 'draft' || benefit.status === 'approved') && (
                  <button type="button" className="secondary" onClick={() => cancelBenefit(benefit.id)} disabled={loading}>Annuler</button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {canApprove && showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.75rem', marginTop: '1rem' }}>
          <label>Type
            <select value={benefitType} onChange={event => setBenefitType(event.target.value as FinancialBenefitType)}>
              {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Mode
            <select value={mode} onChange={event => setMode(event.target.value as FinancialBenefitMode)}>
              <option value="FIXED_AMOUNT">Montant fixe</option>
              <option value="PERCENTAGE">Pourcentage</option>
            </select>
          </label>
          <label>Périmètre
            <select value={scope} onChange={event => setScope(event.target.value as typeof scope)}>
              <option value="CURRENT">Échéance affichée</option>
              {props.paymentType === 'tuition' ? (
                <option value="ALL_TUITION">Toute la scolarité T1–T3</option>
              ) : (
                <>
                  <option value="TRANSPORT_RANGE">Plage de mois</option>
                  <option value="TRANSPORT_YEAR">Toute l’année scolaire</option>
                </>
              )}
            </select>
          </label>
          {props.paymentType === 'transport' && scope === 'TRANSPORT_RANGE' && (
            <>
              <label>Premier mois<input type="month" value={transportStartPeriod} onChange={event => setTransportStartPeriod(event.target.value)} /></label>
              <label>Dernier mois<input type="month" value={transportEndPeriod} onChange={event => setTransportEndPeriod(event.target.value)} /></label>
            </>
          )}
          <label>{mode === 'PERCENTAGE'
            ? 'Pourcentage'
            : scope === 'CURRENT' ? 'Montant FCFA' : 'Montant par échéance FCFA'}
            <input type="number" min="1" max={mode === 'PERCENTAGE' ? 100 : undefined} step="1" value={value} onChange={event => setValue(event.target.value)} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '1.4rem' }}>
            <input type="checkbox" checked={stackable} onChange={event => setStackable(event.target.checked)} /> Cumulable
          </label>
          {benefitType === 'DISCOUNT_VOUCHER' && (
            <>
              <label>Référence
                <input value={reference} maxLength={80} onChange={event => setReference(event.target.value)} placeholder="BON-2026-0017" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '1.4rem' }}>
                <input type="checkbox" checked={singleUse} onChange={event => setSingleUse(event.target.checked)} /> Usage unique
              </label>
              {!singleUse && <label>Utilisations maximales<input type="number" min="1" step="1" value={maximumUses} onChange={event => setMaximumUses(event.target.value)} /></label>}
            </>
          )}
          <label>Valide à partir du<input type="date" value={validFrom} onChange={event => setValidFrom(event.target.value)} /></label>
          <label>Valide jusqu’au<input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Motif
            <input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />
          </label>
          <button type="button" onClick={createBenefit} disabled={loading} style={{ width: 'fit-content' }}>
            {loading ? 'Traitement…' : 'Créer le brouillon'}
          </button>
        </div>
      )}
    </section>
  );
};

export default FinancialBenefitsPanel;
