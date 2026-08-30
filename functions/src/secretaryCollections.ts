import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveStudentFinanceData, writeStudentFinanceProjection } from './studentFinanceProjection';
import { makeTuitionDiscountSlotId } from './utils/discountHelpers';
import { calculateCollectedPaymentTotal } from './expenseLedger';
import {
  ITALO_TRANSPORT_FEE_POLICY_ID,
  planTransportAllocations,
  resolveItaloTransportFee,
  TransportAllocationPlanItem,
  TransportFeeResolution
} from './transportPaymentPolicy';
import {
  CASH_LEDGER_COLLECTION,
  CashLedgerIntegrityError,
  makeCashLedgerDayId,
  requireOpenCashLedger
} from './cashClosureIntegrity';

type Data = Record<string, unknown>;
type PaymentType = 'registration_fee' | 'tuition' | 'transport';
type Installment = 'T1' | 'T2' | 'T3';
type CanonicalClassCycle = 'nursery' | 'primary' | 'secondary' | 'unknown';
type BenefitType = 'SCHOLARSHIP' | 'DISCOUNT_VOUCHER' | 'FAMILY_DISCOUNT' | 'EXCEPTIONAL_DISCOUNT';
type BenefitMode = 'FIXED_AMOUNT' | 'PERCENTAGE';
type PaymentDueStatus = 'PAID' | 'UNCONFIGURED' | 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE';
type MoratoriumStatus = 'NONE' | 'ACTIVE' | 'EXPIRED';

const PAYMENT_ROLES = new Set(['owner', 'director', 'accountant', 'secretary', 'superAdmin']);
const APPROVAL_ROLES = new Set(['owner', 'director', 'superAdmin']);
const BENEFIT_TYPES = new Set<BenefitType>([
  'SCHOLARSHIP', 'DISCOUNT_VOUCHER', 'FAMILY_DISCOUNT', 'EXCEPTIONAL_DISCOUNT'
]);
const BENEFIT_MODES = new Set<BenefitMode>(['FIXED_AMOUNT', 'PERCENTAGE']);
const INSTALLMENTS = new Set<Installment>(['T1', 'T2', 'T3']);
const ACTIVE_BENEFIT_STATUSES = new Set(['approved', 'applied', 'settled']);

const httpsError = (
  code: functions.https.FunctionsErrorCode,
  message: string,
  businessCode?: string
): functions.https.HttpsError => new functions.https.HttpsError(
  code,
  message,
  businessCode ? { businessCode } : undefined
);

const requireOpenCashDay = (
  ledger: Data | null,
  closureExists: boolean,
  schoolId: string,
  date: string
): number => {
  try {
    return requireOpenCashLedger(ledger, closureExists, schoolId, date);
  } catch (error) {
    if (error instanceof CashLedgerIntegrityError) {
      throw httpsError('failed-precondition', error.message, error.businessCode);
    }
    throw error;
  }
};

const requireId = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
      || value.includes('/') || value.length > 128 || value === '.' || value === '..') {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  return value;
};

const requireText = (value: unknown, field: string, min = 1, max = 500): string => {
  if (typeof value !== 'string') {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  const clean = value.trim();
  if (clean.length < min || clean.length > max) {
    throw httpsError('invalid-argument', `${field} is invalid.`, 'INVALID_ARGUMENT');
  }
  return clean;
};

const requireMoney = (value: unknown, field: string, allowZero = false): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw httpsError('invalid-argument', `${field} must be a safe integer FCFA amount.`, 'INVALID_MONEY');
  }
  return value;
};

const requireSignedPaymentAmount = (payment: Data): number => {
  const amount = payment.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0) {
    throw httpsError(
      'failed-precondition',
      'Historical payment amount is invalid.',
      'FINANCIAL_HISTORY_INCONSISTENT'
    );
  }
  const isReversal = payment.kind === 'PAYMENT_REVERSAL';
  if (amount < 0 && (!isReversal || typeof payment.originalPaymentId !== 'string')) {
    throw httpsError(
      'failed-precondition',
      'Negative payment without an immutable reversal reference.',
      'FINANCIAL_HISTORY_INCONSISTENT'
    );
  }
  if (amount > 0 && isReversal) {
    throw httpsError(
      'failed-precondition',
      'Payment reversal amount must be negative.',
      'FINANCIAL_HISTORY_INCONSISTENT'
    );
  }
  return amount;
};

const requireAcademicYear = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{4}$/.test(value)) {
    throw httpsError('invalid-argument', 'academicYear must use YYYY-YYYY.', 'INVALID_ACADEMIC_YEAR');
  }
  const [start, end] = value.split('-').map(Number);
  if (end !== start + 1) {
    throw httpsError('invalid-argument', 'academicYear is not consecutive.', 'INVALID_ACADEMIC_YEAR');
  }
  return value;
};

const normalizeClassValue = (value: unknown): string => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  : '';

export const resolveCanonicalClassCycle = (classData: Data): CanonicalClassCycle => {
  for (const value of [classData.cycle, classData.level, classData.type]) {
    const normalized = normalizeClassValue(value);
    if (['preschool', 'nursery', 'maternelle', 'pre nursery'].includes(normalized)) return 'nursery';
    if (['primary', 'primaire'].includes(normalized)) return 'primary';
    if (['secondary', 'secondaire'].includes(normalized)) return 'secondary';
  }

  const catalogLevelId = normalizeClassValue(classData.catalogLevelId);
  if (catalogLevelId.includes('secondary')) return 'secondary';
  if (catalogLevelId.includes('primary')) return 'primary';
  if (catalogLevelId.includes('nursery') || catalogLevelId.includes('preschool')) return 'nursery';

  const name = normalizeClassValue(classData.name);
  if (/^(6|5|4|3)e(me)?$/.test(name) || /^form [1-4]$/.test(name)) return 'secondary';
  if (['sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'].includes(name) || /^class [1-6]$/.test(name)) return 'primary';
  if (name === 'pre maternelle' || name === 'pre nursery' || /^(maternelle|nursery) [1-3]$/.test(name)) {
    return 'nursery';
  }
  return 'unknown';
};

const assertTransportClassIsKnown = (type: PaymentType, classData: Data): void => {
  if (type !== 'transport') return;
  const cycle = resolveCanonicalClassCycle(classData);
  if (cycle === 'unknown') {
    throw httpsError('failed-precondition', 'Le cycle de la classe est invalide.', 'INVALID_CLASS_CYCLE');
  }
};

export const isTransportPeriod = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  return true;
};

const requireTransportPeriod = (value: unknown, field = 'period'): string => {
  if (!isTransportPeriod(value)) {
    throw httpsError('invalid-argument', `${field} must use YYYY-MM.`, 'INVALID_TRANSPORT_PERIOD');
  }
  return value;
};

const transportPeriodIsInAcademicYear = (period: string, academicYear: string): boolean => {
  const [startYear, endYear] = academicYear.split('-');
  return period.startsWith(`${startYear}-`) || period.startsWith(`${endYear}-`);
};

const isCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const requirePaymentTarget = (raw: Data): {
  type: PaymentType;
  installment: Installment | null;
  period: string | null;
} => {
  if (raw.type !== 'registration_fee' && raw.type !== 'tuition' && raw.type !== 'transport') {
    throw httpsError('invalid-argument', 'type must be registration_fee, tuition, or transport.', 'INVALID_PAYMENT_TYPE');
  }
  const type = raw.type;
  if (type === 'tuition') {
    if (!INSTALLMENTS.has(raw.installment as Installment)) {
      throw httpsError('invalid-argument', 'installment must be T1, T2, or T3.', 'INVALID_INSTALLMENT');
    }
    if (raw.period !== undefined && raw.period !== null && raw.period !== '') {
      throw httpsError('invalid-argument', 'period is only valid for transport.', 'INVALID_TRANSPORT_PERIOD');
    }
    return { type, installment: raw.installment as Installment, period: null };
  }
  if (type === 'transport') {
    if (raw.installment !== undefined && raw.installment !== null && raw.installment !== '') {
      throw httpsError('invalid-argument', 'installment is not valid for transport.', 'INVALID_INSTALLMENT');
    }
    const period = raw.period === undefined || raw.period === null || raw.period === ''
      ? null : requireTransportPeriod(raw.period);
    return { type, installment: null, period };
  }
  if ((raw.installment !== undefined && raw.installment !== null && raw.installment !== '')
      || (raw.period !== undefined && raw.period !== null && raw.period !== '')) {
    throw httpsError('invalid-argument', 'registration_fee has no installment or period.', 'INVALID_PAYMENT_TARGET');
  }
  return { type, installment: null, period: null };
};

const normalizedStatus = (value: unknown): string => typeof value === 'string' ? value.toLowerCase() : 'completed';
const isConfirmedPayment = (payment: Data): boolean => ![
  'pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'
].includes(normalizedStatus(payment.status));

const safeAdd = (left: number, right: number, field: string): number => {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw httpsError('failed-precondition', `${field} exceeds safe integer limits.`, 'UNSAFE_FINANCIAL_TOTAL');
  }
  return result;
};

export const calculateBenefitAmount = (gross: number, mode: BenefitMode, value: number): number => {
  requireMoney(gross, 'grossExpectedAmount');
  requireMoney(value, 'benefit value');
  if (!BENEFIT_MODES.has(mode)) {
    throw httpsError('invalid-argument', 'Unsupported benefit mode.', 'INVALID_BENEFIT_MODE');
  }
  if (mode === 'FIXED_AMOUNT') return Math.min(gross, value);
  if (value > 100) {
    throw httpsError('invalid-argument', 'Percentage must be between 1 and 100.', 'INVALID_PERCENTAGE');
  }
  return Number((BigInt(gross) * BigInt(value)) / BigInt(100));
};

const paymentTargetKey = (type: PaymentType, installment: Installment | null, period: string | null): string =>
  type === 'tuition' ? `tuition:${installment}` : type === 'transport' ? `transport:${period}` : 'registration_fee';

const paymentDeadline = (
  school: Data,
  type: PaymentType,
  installment: Installment | null,
  period: string | null
): string | null => {
  const deadlines = school.paymentDeadlines && typeof school.paymentDeadlines === 'object'
    ? school.paymentDeadlines as Data : {};
  let value: unknown;
  if (type === 'registration_fee') {
    value = deadlines.registrationFee;
  } else if (type === 'tuition') {
    const tuition = deadlines.tuition && typeof deadlines.tuition === 'object'
      ? deadlines.tuition as Data : {};
    value = installment ? tuition[installment] : null;
  } else {
    const transport = deadlines.transport && typeof deadlines.transport === 'object'
      ? deadlines.transport as Data : {};
    value = period ? transport[period] : null;
  }
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    throw httpsError(
      'failed-precondition',
      'Payment deadline configuration is invalid.',
      'PAYMENT_DEADLINE_CORRUPTED'
    );
  }
  return value;
};

export const withAcademicYearTuitionDeadlines = (school: Data, academicYear: Data): Data => {
  const yearDeadlines = academicYear.tuitionPaymentDeadlines;
  if (yearDeadlines === undefined || yearDeadlines === null) return school;
  if (typeof yearDeadlines !== 'object' || Array.isArray(yearDeadlines)) {
    throw httpsError('failed-precondition', 'Tuition deadline configuration is invalid.',
      'PAYMENT_DEADLINE_CORRUPTED');
  }
  const tuition = yearDeadlines as Data;
  for (const installment of ['T1', 'T2', 'T3']) {
    if (typeof tuition[installment] !== 'string' || !isCalendarDate(tuition[installment])) {
      throw httpsError('failed-precondition', 'Tuition deadline configuration is invalid.',
        'PAYMENT_DEADLINE_CORRUPTED');
    }
  }
  if (!(String(tuition.T1) < String(tuition.T2) && String(tuition.T2) < String(tuition.T3))) {
    throw httpsError('failed-precondition', 'Tuition deadlines are not chronological.',
      'PAYMENT_DEADLINE_CORRUPTED');
  }
  const legacy = school.paymentDeadlines && typeof school.paymentDeadlines === 'object'
    ? school.paymentDeadlines as Data : {};
  return { ...school, paymentDeadlines: { ...legacy, tuition: { ...tuition } } };
};

const moratoriumMatchesTarget = (
  moratorium: Data,
  type: PaymentType,
  installment: Installment | null,
  period: string | null
): boolean => moratorium.paymentType === type
  && (type !== 'tuition' || moratorium.installment === installment)
  && (type !== 'transport' || moratorium.period === period);

export interface PaymentScheduleSnapshot {
  originalDueDate: string | null;
  effectiveDueDate: string | null;
  nextDueDate: string | null;
  moratoriumStatus: MoratoriumStatus;
  moratoriumId: string | null;
  overdue: boolean;
  dueStatus: PaymentDueStatus;
}

export const resolvePaymentSchedule = ({
  school, moratoriums, type, installment, period, today, remainingBalance
}: {
  school: Data;
  moratoriums: Data[];
  type: PaymentType;
  installment: Installment | null;
  period: string | null;
  today: string;
  remainingBalance: number;
}): PaymentScheduleSnapshot => {
  if (!isCalendarDate(today) || !Number.isSafeInteger(remainingBalance) || remainingBalance < 0) {
    throw httpsError('failed-precondition', 'Payment schedule input is invalid.', 'PAYMENT_SCHEDULE_INVALID');
  }
  const originalDueDate = paymentDeadline(school, type, installment, period);
  const applicable = moratoriums
    .filter(item => item.status === 'approved')
    .filter(item => moratoriumMatchesTarget(item, type, installment, period));
  if (applicable.length > 1) {
    throw httpsError(
      'failed-precondition',
      'Several active moratoriums target the same payment deadline.',
      'MORATORIUM_CONFLICT'
    );
  }
  const moratorium = applicable[0] || null;
  let effectiveDueDate = originalDueDate;
  if (moratorium) {
    if (typeof moratorium.id !== 'string' || typeof moratorium.effectiveDueDate !== 'string'
        || !isCalendarDate(moratorium.effectiveDueDate) || typeof moratorium.reason !== 'string'
        || !moratorium.reason.trim()) {
      throw httpsError('failed-precondition', 'Moratorium data is invalid.', 'MORATORIUM_CORRUPTED');
    }
    if (originalDueDate && moratorium.effectiveDueDate < originalDueDate) {
      throw httpsError(
        'failed-precondition',
        'A moratorium cannot shorten the original deadline.',
        'MORATORIUM_CORRUPTED'
      );
    }
    effectiveDueDate = moratorium.effectiveDueDate;
  }
  const moratoriumStatus: MoratoriumStatus = !moratorium
    ? 'NONE' : effectiveDueDate && today <= effectiveDueDate ? 'ACTIVE' : 'EXPIRED';
  let dueStatus: PaymentDueStatus;
  if (remainingBalance === 0) dueStatus = 'PAID';
  else if (!effectiveDueDate) dueStatus = 'UNCONFIGURED';
  else if (today < effectiveDueDate) dueStatus = 'NOT_DUE';
  else if (today === effectiveDueDate) dueStatus = 'DUE_TODAY';
  else dueStatus = 'OVERDUE';
  return {
    originalDueDate,
    effectiveDueDate,
    nextDueDate: remainingBalance > 0 ? effectiveDueDate : null,
    moratoriumStatus,
    moratoriumId: moratorium ? String(moratorium.id) : null,
    overdue: dueStatus === 'OVERDUE',
    dueStatus
  };
};

const countTransportPeriods = (start: string, end: string): number => {
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  return ((endYear - startYear) * 12) + endMonth - startMonth + 1;
};

const benefitScopeMatches = (
  benefit: Data,
  type: PaymentType,
  installment: Installment | null,
  period: string | null
): boolean => {
  if (type === 'registration_fee') return false;
  const canonicalType = type === 'tuition' ? 'TUITION' : 'TRANSPORT';
  if (benefit.paymentType !== canonicalType) return false;
  if (type === 'tuition') {
    return benefit.installment === installment || benefit.installment === 'ALL_TUITION';
  }
  return typeof benefit.transportStartPeriod === 'string'
    && typeof benefit.transportEndPeriod === 'string'
    && !!period
    && period >= benefit.transportStartPeriod
    && period <= benefit.transportEndPeriod;
};

const benefitScopesOverlap = (left: Data, right: Data): boolean => {
  if (left.paymentType !== right.paymentType) return false;
  if (left.paymentType === 'TUITION') {
    return left.installment === 'ALL_TUITION' || right.installment === 'ALL_TUITION'
      || left.installment === right.installment;
  }
  return typeof left.transportStartPeriod === 'string'
    && typeof left.transportEndPeriod === 'string'
    && typeof right.transportStartPeriod === 'string'
    && typeof right.transportEndPeriod === 'string'
    && left.transportStartPeriod <= right.transportEndPeriod
    && right.transportStartPeriod <= left.transportEndPeriod;
};

const benefitDateIsValid = (benefit: Data, today: string): boolean => {
  const validFrom = typeof benefit.validFrom === 'string' ? benefit.validFrom : null;
  const validUntil = typeof benefit.validUntil === 'string' ? benefit.validUntil : null;
  return (!validFrom || today >= validFrom) && (!validUntil || today <= validUntil);
};

const getDoualaDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = (name: string) => parts.find(item => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const normalizeBenefit = (snapshot: admin.firestore.QueryDocumentSnapshot): Data => {
  const benefit = snapshot.data();
  if (benefit.id !== snapshot.id || typeof benefit.schoolId !== 'string'
      || typeof benefit.studentId !== 'string' || typeof benefit.academicYear !== 'string'
      || !BENEFIT_TYPES.has(benefit.benefitType as BenefitType)
      || !BENEFIT_MODES.has(benefit.mode as BenefitMode)
      || typeof benefit.value !== 'number' || !Number.isSafeInteger(benefit.value) || benefit.value <= 0
      || typeof benefit.stackable !== 'boolean' || typeof benefit.reason !== 'string') {
    throw httpsError('failed-precondition', 'Financial benefit data is malformed.', 'BENEFIT_CORRUPTED');
  }
  return benefit;
};

export interface BenefitSnapshot {
  benefitId: string;
  benefitType: BenefitType;
  reference: string | null;
  mode: BenefitMode;
  value: number;
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
}

export interface CollectionQuote extends PaymentScheduleSnapshot {
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
  previousPaid: number;
  remainingBalance: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  benefits: BenefitSnapshot[];
}

export interface TransportInstallmentSnapshot extends CollectionQuote {
  period: string;
  allocatedAmount: number;
}

export interface TransportCollectionQuote extends CollectionQuote {
  transportState: 'FREE_SECONDARY' | 'NOT_SUBSCRIBED' | 'BILLABLE';
  feePolicyId: string;
  zonePk: number | null;
  monthlyGrossAmount: number;
  installments: TransportInstallmentSnapshot[];
  transportCredit: number;
}


const selectApplicableBenefits = (
  benefits: Data[],
  type: PaymentType,
  installment: Installment | null,
  period: string | null,
  today: string
): Data[] => {
  const targetKey = paymentTargetKey(type, installment, period);
  return benefits
    .filter(benefit => ACTIVE_BENEFIT_STATUSES.has(String(benefit.status)))
    .filter(benefit => benefitScopeMatches(benefit, type, installment, period))
    .filter(benefit => benefitDateIsValid(benefit, today))
    .filter(benefit => {
      const appliedTargets = Array.isArray(benefit.appliedTargets) ? benefit.appliedTargets : [];
      if (appliedTargets.includes(targetKey)) return true;
      const maximumUses = typeof benefit.maximumUses === 'number' ? benefit.maximumUses : 1;
      const usageCount = typeof benefit.usageCount === 'number' ? benefit.usageCount : 0;
      return usageCount < maximumUses;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
};

export const calculateBenefits = (gross: number, benefits: Data[]): {
  discountAmount: number;
  netExpectedAmount: number;
  snapshots: BenefitSnapshot[];
} => {
  requireMoney(gross, 'grossExpectedAmount');
  if (benefits.length > 1 && benefits.some(benefit => benefit.stackable !== true)) {
    throw httpsError(
      'failed-precondition',
      'Des avantages non cumulables sont actifs sur la même échéance.',
      'NON_STACKABLE_BENEFIT_CONFLICT'
    );
  }
  let discountAmount = 0;
  const snapshots: BenefitSnapshot[] = [];
  for (const benefit of benefits) {
    const amount = calculateBenefitAmount(gross, benefit.mode as BenefitMode, benefit.value as number);
    const available = gross - discountAmount;
    const appliedAmount = Math.min(available, amount);
    discountAmount = safeAdd(discountAmount, appliedAmount, 'discountAmount');
    snapshots.push({
      benefitId: String(benefit.id),
      benefitType: benefit.benefitType as BenefitType,
      reference: typeof benefit.reference === 'string' ? benefit.reference : null,
      mode: benefit.mode as BenefitMode,
      value: benefit.value as number,
      grossExpectedAmount: gross,
      discountAmount: appliedAmount,
      netExpectedAmount: gross - discountAmount
    });
    if (discountAmount === gross) break;
  }
  const netExpectedAmount = gross - discountAmount;
  for (const snapshot of snapshots) snapshot.netExpectedAmount = netExpectedAmount;
  return { discountAmount, netExpectedAmount, snapshots };
};

const resolveGross = (
  type: PaymentType,
  installment: Installment | null,
  finance: Data,
  school: Data,
  bus: Data | null,
  transportFee: TransportFeeResolution | null = null
): number => {
  const fees = school.globalFees && typeof school.globalFees === 'object' ? school.globalFees as Data : {};
  let gross: unknown;
  if (type === 'registration_fee') {
    gross = finance.registrationFeeExpected;
  } else if (type === 'tuition') {
    gross = finance[`fee${installment}`] ?? fees[`fee${installment}`];
  } else {
    gross = transportFee?.state === 'BILLABLE'
      ? transportFee.monthlyGrossAmount
      : finance.transportMonthlyFee
      ?? finance.feeTransport
      ?? bus?.transportMonthlyFee
      ?? bus?.monthlyFee
      ?? bus?.fee
      ?? fees.feeTransport;
  }
  if (typeof gross !== 'number' || !Number.isSafeInteger(gross) || gross <= 0) {
    throw httpsError('failed-precondition', 'Le tarif brut attendu n’est pas configuré.', 'GROSS_AMOUNT_NOT_CONFIGURED');
  }
  return gross;
};

const resolveConfiguredTuitionGross = (
  installment: Installment,
  finance: Data,
  school: Data
): number | null => {
  const fees = school.globalFees && typeof school.globalFees === 'object' ? school.globalFees as Data : {};
  const gross = finance[`fee${installment}`] ?? fees[`fee${installment}`];
  if (gross === undefined || gross === null || gross === 0) return null;
  if (typeof gross !== 'number' || !Number.isSafeInteger(gross) || gross < 0) {
    throw httpsError('failed-precondition', 'Le tarif brut attendu est invalide.',
      'GROSS_AMOUNT_CORRUPTED');
  }
  return gross;
};

const resolveTransportFee = (student: Data, privateData: Data, classData: Data): TransportFeeResolution => {
  try {
    return resolveItaloTransportFee({
      cycle: resolveCanonicalClassCycle(classData),
      usesTransport: student.usesTransport === true,
      zonePk: privateData.transportZonePk
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'TRANSPORT_POLICY_INVALID';
    const messages: Record<string, string> = {
      TRANSPORT_CLASS_NOT_SUPPORTED: 'Le transport payant ITALO est réservé au primaire.',
      TRANSPORT_ZONE_REQUIRED: 'Le PK transport structuré doit être configuré.',
      TRANSPORT_ZONE_OUTSIDE_POLICY: 'Le PK transport est hors du périmètre tarifaire ITALO.'
    };
    throw httpsError('failed-precondition', messages[code] || 'La politique transport est invalide.', code);
  }
};

export const resolveTransportBenefitGross = ({
  student, privateData, classData, finance, school, bus
}: {
  student: Data; privateData: Data; classData: Data; finance: Data; school: Data; bus: Data | null;
}): number => {
  const policy = school.transportPolicy && typeof school.transportPolicy === 'object'
    ? school.transportPolicy as Data : {};
  if (policy.feePolicyId !== ITALO_TRANSPORT_FEE_POLICY_ID) {
    return resolveGross('transport', null, finance, school, bus);
  }
  const fee = resolveTransportFee(student, privateData, classData);
  if (fee.state === 'FREE_SECONDARY') {
    throw httpsError(
      'failed-precondition',
      'TRANSPORT GRATUIT : une aide transport n’aurait aucun effet.',
      'TRANSPORT_FREE_SECONDARY'
    );
  }
  if (fee.state === 'NOT_SUBSCRIBED') {
    throw httpsError(
      'failed-precondition',
      'Cet élève n’utilise pas le transport.',
      'TRANSPORT_NOT_SUBSCRIBED'
    );
  }
  return fee.monthlyGrossAmount;
};

const resolveTransportBillingPeriods = (school: Data, academicYear: string): string[] => {
  const policy = school.transportPolicy && typeof school.transportPolicy === 'object'
    ? school.transportPolicy as Data : {};
  if (policy.feePolicyId !== ITALO_TRANSPORT_FEE_POLICY_ID) {
    throw httpsError('failed-precondition', 'La politique tarifaire transport ITALO doit être activée.',
      'TRANSPORT_FEE_POLICY_NOT_CONFIGURED');
  }
  if (!Array.isArray(policy.billingPeriods) || policy.billingPeriods.length === 0) {
    throw httpsError('failed-precondition', 'Les mois facturables du transport doivent être configurés.',
      'TRANSPORT_BILLING_PERIODS_NOT_CONFIGURED');
  }
  const periods = policy.billingPeriods.map(period =>
    requireTransportPeriod(period, 'transportPolicy.billingPeriods'));
  if (new Set(periods).size !== periods.length
      || periods.some(period => !transportPeriodIsInAcademicYear(period, academicYear))) {
    throw httpsError('failed-precondition', 'Le calendrier transport configuré est invalide.',
      'TRANSPORT_BILLING_PERIODS_INVALID');
  }
  return [...periods].sort();
};

const zeroTransportQuote = (
  state: 'FREE_SECONDARY' | 'NOT_SUBSCRIBED'
): TransportCollectionQuote => ({
  transportState: state, feePolicyId: ITALO_TRANSPORT_FEE_POLICY_ID, zonePk: null,
  monthlyGrossAmount: 0, installments: [], transportCredit: 0,
  grossExpectedAmount: 0, discountAmount: 0, netExpectedAmount: 0,
  previousPaid: 0, remainingBalance: 0, status: 'PAID', benefits: [],
  originalDueDate: null, effectiveDueDate: null, nextDueDate: null,
  moratoriumStatus: 'NONE', moratoriumId: null, overdue: false, dueStatus: 'PAID'
});

const requireTransportAllocationAmount = (allocation: Data): number => {
  const amount = allocation.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount === 0
      || allocation.status !== 'POSTED' || allocation.byTransportPaymentEngine !== true
      || (allocation.kind !== 'INSTALLMENT' && allocation.kind !== 'CREDIT')) {
    throw httpsError('failed-precondition', 'Une allocation transport historique est invalide.',
      'TRANSPORT_ALLOCATION_HISTORY_INCONSISTENT');
  }
  return amount;
};

const buildTransportCollectionQuote = ({
  fee, periods, benefits, payments, allocations, moratoriums, school, schoolId, academicYear, today
}: {
  fee: TransportFeeResolution; periods: string[]; benefits: Data[]; payments: Data[];
  allocations: Data[]; moratoriums: Data[]; school: Data; schoolId: string;
  academicYear: string; today: string;
}): TransportCollectionQuote => {
  if (fee.state !== 'BILLABLE') return zeroTransportQuote(fee.state);
  const installmentAllocations = new Map<string, number>();
  let transportCredit = 0;
  for (const allocation of allocations) {
    if (allocation.schoolId !== schoolId || allocation.academicYear !== academicYear) continue;
    const amount = requireTransportAllocationAmount(allocation);
    if (allocation.kind === 'CREDIT') {
      transportCredit = safeAdd(transportCredit, amount, 'transportCredit');
    } else {
      const period = requireTransportPeriod(allocation.period, 'allocation.period');
      installmentAllocations.set(period, safeAdd(
        installmentAllocations.get(period) || 0, amount, `allocation:${period}`));
    }
  }
  if (transportCredit < 0) {
    throw httpsError('failed-precondition', 'Le crédit transport historique est négatif.',
      'FINANCIAL_HISTORY_INCONSISTENT');
  }
  const benefitPlanning = benefits.map(benefit => ({ ...benefit }));
  const installments: TransportInstallmentSnapshot[] = periods.map(period => {
    const legacyQuote = buildQuote({
      gross: fee.monthlyGrossAmount, benefits: benefitPlanning, payments, moratoriums, school, schoolId, academicYear,
      type: 'transport', installment: null, period, today
    });
    for (const snapshot of legacyQuote.benefits) {
      const benefit = benefitPlanning.find(item => item.id === snapshot.benefitId);
      if (!benefit) continue;
      const target = paymentTargetKey('transport', null, period);
      const appliedTargets = Array.isArray(benefit.appliedTargets) ? benefit.appliedTargets as string[] : [];
      if (!appliedTargets.includes(target)) {
        benefit.appliedTargets = [...appliedTargets, target];
        benefit.usageCount = safeAdd(typeof benefit.usageCount === 'number' ? benefit.usageCount : 0, 1, 'usageCount');
      }
    }
    const allocatedAmount = installmentAllocations.get(period) || 0;
    const paidAmount = safeAdd(legacyQuote.previousPaid, allocatedAmount, `paid:${period}`);
    if (paidAmount < 0 || paidAmount > legacyQuote.netExpectedAmount) {
      throw httpsError('failed-precondition', 'Une mensualité transport est surallouée.',
        'TRANSPORT_ALLOCATION_HISTORY_INCONSISTENT');
    }
    const remainingBalance = legacyQuote.netExpectedAmount - paidAmount;
    const schedule = resolvePaymentSchedule({
      school, moratoriums, type: 'transport', installment: null, period, today, remainingBalance
    });
    return {
      ...legacyQuote, ...schedule, period, allocatedAmount, previousPaid: paidAmount, remainingBalance,
      status: remainingBalance === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID'
    };
  });
  const sum = (selector: (item: TransportInstallmentSnapshot) => number, field: string) =>
    installments.reduce((total, item) => safeAdd(total, selector(item), field), 0);
  const grossExpectedAmount = sum(item => item.grossExpectedAmount, 'transportExpectedGross');
  const discountAmount = sum(item => item.discountAmount, 'transportDiscountTotal');
  const netExpectedAmount = sum(item => item.netExpectedAmount, 'transportExpectedNet');
  const allocatedAndLegacyPaid = sum(item => item.previousPaid, 'transportAllocatedTotal');
  const previousPaid = safeAdd(allocatedAndLegacyPaid, transportCredit, 'transportReceivedTotal');
  const remainingBalance = sum(item => item.remainingBalance, 'transportRemainingBalance');
  const outstanding = installments.filter(item => item.remainingBalance > 0);
  const next = outstanding[0] || null;
  const overdue = outstanding.some(item => item.overdue);
  return {
    transportState: 'BILLABLE', feePolicyId: ITALO_TRANSPORT_FEE_POLICY_ID,
    zonePk: fee.zonePk, monthlyGrossAmount: fee.monthlyGrossAmount, installments, transportCredit,
    grossExpectedAmount, discountAmount, netExpectedAmount, previousPaid, remainingBalance,
    status: remainingBalance === 0 ? 'PAID' : allocatedAndLegacyPaid > 0 ? 'PARTIAL' : 'UNPAID',
    benefits: installments.flatMap(item => item.benefits.map(benefit => ({ ...benefit }))),
    originalDueDate: next?.originalDueDate || null, effectiveDueDate: next?.effectiveDueDate || null,
    nextDueDate: next?.effectiveDueDate || null, moratoriumStatus: next?.moratoriumStatus || 'NONE',
    moratoriumId: next?.moratoriumId || null, overdue,
    dueStatus: remainingBalance === 0 ? 'PAID' : overdue ? 'OVERDUE' : next?.dueStatus || 'UNCONFIGURED'
  };
};

const paymentMatchesTarget = (
  payment: Data,
  schoolId: string,
  academicYear: string,
  type: PaymentType,
  installment: Installment | null,
  period: string | null
): boolean => payment.schoolId === schoolId
  && payment.academicYear === academicYear
  && payment.type === type
  && (type !== 'tuition' || payment.installment === installment)
  && (type !== 'transport' || payment.period === period)
  && isConfirmedPayment(payment);

const buildQuote = ({
  gross, benefits, payments, moratoriums, school, schoolId, academicYear, type, installment, period, today
}: {
  gross: number;
  benefits: Data[];
  payments: Data[];
  moratoriums: Data[];
  school: Data;
  schoolId: string;
  academicYear: string;
  type: PaymentType;
  installment: Installment | null;
  period: string | null;
  today: string;
}): CollectionQuote => {
  const applicable = selectApplicableBenefits(benefits, type, installment, period, today);
  const calculated = calculateBenefits(gross, applicable);
  let previousPaid = 0;
  for (const payment of payments.filter(item => paymentMatchesTarget(
    item, schoolId, academicYear, type, installment, period
  ))) {
    previousPaid = safeAdd(previousPaid, requireSignedPaymentAmount(payment), 'previousPaid');
  }
  if (previousPaid < 0 || previousPaid > calculated.netExpectedAmount) {
    throw httpsError('failed-precondition', 'Le cumul historique dépasse le montant net dû.', 'FINANCIAL_HISTORY_INCONSISTENT');
  }
  const remainingBalance = calculated.netExpectedAmount - previousPaid;
  const schedule = resolvePaymentSchedule({
    school, moratoriums, type, installment, period, today, remainingBalance
  });
  return {
    grossExpectedAmount: gross,
    discountAmount: calculated.discountAmount,
    netExpectedAmount: calculated.netExpectedAmount,
    previousPaid,
    remainingBalance,
    status: remainingBalance === 0 ? 'PAID' : previousPaid > 0 ? 'PARTIAL' : 'UNPAID',
    benefits: calculated.snapshots,
    ...schedule
  };
};

const validateActiveUser = (snapshot: admin.firestore.DocumentSnapshot, roles: Set<string>): Data => {
  if (!snapshot.exists) throw httpsError('permission-denied', 'Operator profile not found.', 'PERMISSION_DENIED');
  const user = snapshot.data() || {};
  const active = (user.active === true || user.isActive === true) && user.status !== 'inactive';
  if (!active || !roles.has(String(user.role))) {
    throw httpsError('permission-denied', 'Operator is not authorized.', 'PERMISSION_DENIED');
  }
  return user;
};

const validateTenant = (user: Data, schoolId: string): void => {
  if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
    throw httpsError('permission-denied', 'Cross-school operation denied.', 'CROSS_SCHOOL_DENIED');
  }
};

const validateCollectionSchool = (school: Data): void => {
  if (school.active === false || school.isActive === false || school.status === 'inactive') {
    throw httpsError('failed-precondition', 'School is inactive.', 'SCHOOL_INACTIVE');
  }
  if (school.subscriptionStatus && school.subscriptionStatus !== 'active'
      && school.subscriptionStatus !== 'trialing') {
    throw httpsError('failed-precondition', 'School subscription is inactive.', 'SCHOOL_SUBSCRIPTION_INACTIVE');
  }
};

const validateCollectionStudentTenant = (
  student: Data,
  schoolId: string
): void => {
  if (student.schoolId !== schoolId) {
    throw httpsError('permission-denied', 'Student tenant mismatch.', 'CROSS_SCHOOL_DENIED');
  }
  if (student.active === false || student.isActive === false || student.status === 'inactive') {
    throw httpsError('failed-precondition', 'Student is inactive.', 'STUDENT_INACTIVE');
  }
};

const validateCollectionAcademicYear = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  school: Data,
  student: Data,
  schoolId: string,
  academicYear: string
): Promise<Data> => {
  const activeAcademicYearId = typeof school.activeAcademicYearId === 'string'
    ? school.activeAcademicYearId.trim() : '';
  if (!activeAcademicYearId || activeAcademicYearId.includes('/') || activeAcademicYearId.length > 128) {
    throw httpsError('failed-precondition', 'School academic year is invalid.', 'INVALID_ACADEMIC_YEAR');
  }

  const rawStudentYearId = student.academicYearId;
  let studentAcademicYearId: string;
  if (rawStudentYearId !== undefined && rawStudentYearId !== null && rawStudentYearId !== '') {
    if (typeof rawStudentYearId !== 'string' || rawStudentYearId !== rawStudentYearId.trim()
        || rawStudentYearId.includes('/') || rawStudentYearId.length > 128) {
      throw httpsError('failed-precondition', 'Student academic year is invalid.', 'INVALID_ACADEMIC_YEAR');
    }
    studentAcademicYearId = rawStudentYearId;
  } else {
    const legacyYear = typeof student.registrationYear === 'string'
      ? student.registrationYear : student.academicYear;
    if (legacyYear !== academicYear) {
      throw httpsError('failed-precondition', 'Student academic year mismatch.', 'INVALID_ACADEMIC_YEAR');
    }
    studentAcademicYearId = activeAcademicYearId;
  }

  if (studentAcademicYearId !== activeAcademicYearId) {
    throw httpsError('failed-precondition', 'Student academic year mismatch.', 'INVALID_ACADEMIC_YEAR');
  }
  const yearSnap = await transaction.get(db.collection('academicYears').doc(studentAcademicYearId));
  if (!yearSnap.exists) {
    throw httpsError('failed-precondition', 'Student academic year is invalid.', 'INVALID_ACADEMIC_YEAR');
  }
  const year = yearSnap.data() || {};
  if (year.schoolId !== schoolId || year.status !== 'active' || year.active === false || year.isActive === false
      || year.name !== academicYear) {
    throw httpsError('failed-precondition', 'Student academic year mismatch.', 'INVALID_ACADEMIC_YEAR');
  }
  return year;
};

const auditData = (
  action: string,
  schoolId: string,
  uid: string,
  targetType: string,
  targetId: string,
  details: Data = {}
): Data => ({
  action, schoolId, userId: uid, targetType, targetId, details,
  timestamp: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
});

const hashId = (prefix: string, values: unknown[]): string => `${prefix}_${crypto
  .createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex')}`;

const validateBenefitInput = (raw: Data): Data => {
  const schoolId = requireId(raw.schoolId, 'schoolId');
  const studentId = requireId(raw.studentId, 'studentId');
  const academicYear = requireAcademicYear(raw.academicYear);
  const requestId = requireId(raw.requestId, 'requestId');
  if (!BENEFIT_TYPES.has(raw.benefitType as BenefitType)) {
    throw httpsError('invalid-argument', 'benefitType is invalid.', 'INVALID_BENEFIT_TYPE');
  }
  if (raw.paymentType !== 'TUITION' && raw.paymentType !== 'TRANSPORT') {
    throw httpsError('invalid-argument', 'paymentType is invalid.', 'INVALID_PAYMENT_TYPE');
  }
  if (!BENEFIT_MODES.has(raw.mode as BenefitMode)) {
    throw httpsError('invalid-argument', 'mode is invalid.', 'INVALID_BENEFIT_MODE');
  }
  const value = requireMoney(raw.value, 'value');
  if (raw.mode === 'PERCENTAGE' && value > 100) {
    throw httpsError('invalid-argument', 'Percentage must be between 1 and 100.', 'INVALID_PERCENTAGE');
  }
  const reason = requireText(raw.reason, 'reason', 3, 500);
  const reference = raw.reference === undefined || raw.reference === null || raw.reference === ''
    ? null : requireText(raw.reference, 'reference', 1, 80).toUpperCase();
  if (raw.benefitType === 'DISCOUNT_VOUCHER' && !reference) {
    throw httpsError('invalid-argument', 'A voucher reference is required.', 'VOUCHER_REFERENCE_REQUIRED');
  }
  let installment: string | null = null;
  let transportStartPeriod: string | null = null;
  let transportEndPeriod: string | null = null;
  if (raw.paymentType === 'TUITION') {
    if (raw.installment !== 'ALL_TUITION' && !INSTALLMENTS.has(raw.installment as Installment)) {
      throw httpsError('invalid-argument', 'Tuition installment scope is invalid.', 'INVALID_INSTALLMENT');
    }
    installment = raw.installment as string;
  } else {
    transportStartPeriod = requireTransportPeriod(raw.transportStartPeriod, 'transportStartPeriod');
    transportEndPeriod = requireTransportPeriod(raw.transportEndPeriod, 'transportEndPeriod');
    if (transportEndPeriod < transportStartPeriod) {
      throw httpsError('invalid-argument', 'Transport period range is invalid.', 'INVALID_TRANSPORT_PERIOD');
    }
    if (!transportPeriodIsInAcademicYear(transportStartPeriod, academicYear)
        || !transportPeriodIsInAcademicYear(transportEndPeriod, academicYear)) {
      throw httpsError('invalid-argument', 'Transport scope is outside the academic year.', 'PERIOD_OUTSIDE_ACADEMIC_YEAR');
    }
  }
  const stackable = raw.stackable === true;
  const singleUse = raw.benefitType === 'DISCOUNT_VOUCHER' && raw.singleUse === true;
  const scopeMaximumUses = raw.paymentType === 'TUITION'
    ? (installment === 'ALL_TUITION' ? 3 : 1)
    : countTransportPeriods(String(transportStartPeriod), String(transportEndPeriod));
  const requestedMaximumUses = raw.maximumUses === undefined
    ? scopeMaximumUses : requireMoney(raw.maximumUses, 'maximumUses');
  const maximumUses = singleUse ? 1 : Math.min(requestedMaximumUses, scopeMaximumUses);
  const validFrom = raw.validFrom ? requireText(raw.validFrom, 'validFrom', 10, 10) : null;
  const validUntil = raw.validUntil ? requireText(raw.validUntil, 'validUntil', 10, 10) : null;
  if ((validFrom && !isCalendarDate(validFrom))
      || (validUntil && !isCalendarDate(validUntil))
      || (validFrom && validUntil && validUntil < validFrom)) {
    throw httpsError('invalid-argument', 'Benefit validity dates are invalid.', 'INVALID_VALIDITY_RANGE');
  }
  return {
    schoolId, studentId, academicYear, requestId,
    benefitType: raw.benefitType, paymentType: raw.paymentType, mode: raw.mode, value,
    installment, transportStartPeriod, transportEndPeriod, stackable, reason, reference,
    singleUse, maximumUses, validFrom, validUntil
  };
};

export const createFinancialBenefit = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const input = validateBenefitInput((raw || {}) as Data);
  const uid = context.auth.uid;
  const db = admin.firestore();
  const benefitId = hashId('benefit', [input.schoolId, input.requestId]);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
  return db.runTransaction(async transaction => {
    const userRef = db.collection('users').doc(uid);
    const schoolRef = db.collection('schools').doc(String(input.schoolId));
    const studentRef = db.collection('students').doc(String(input.studentId));
    const benefitRef = db.collection('financialBenefits').doc(benefitId);
    const [userSnap, schoolSnap, studentSnap, benefitSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(schoolRef), transaction.get(studentRef), transaction.get(benefitRef)
    ]);
    const user = validateActiveUser(userSnap, APPROVAL_ROLES);
    validateTenant(user, String(input.schoolId));
    if (!schoolSnap.exists) throw httpsError('not-found', 'School not found.', 'SCHOOL_NOT_FOUND');
    if (!studentSnap.exists) throw httpsError('not-found', 'Student not found.', 'STUDENT_NOT_FOUND');
    const school = schoolSnap.data() || {};
    const student = studentSnap.data() || {};
    validateCollectionSchool(school);
    validateCollectionStudentTenant(student, String(input.schoolId));
    await validateCollectionAcademicYear(
      transaction, db, school, student, String(input.schoolId), String(input.academicYear)
    );
    if (benefitSnap.exists) {
      const existing = benefitSnap.data() || {};
      if (existing.requestFingerprint !== fingerprint) {
        throw httpsError('already-exists', 'requestId already identifies another benefit.', 'IDEMPOTENCY_CONFLICT');
      }
      return { benefitId, status: existing.status, idempotentReplay: true };
    }
    const clean = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null));
    transaction.create(benefitRef, {
      id: benefitId, ...clean, requestFingerprint: fingerprint, status: 'draft', usageCount: 0,
      appliedTargets: [], createdBy: uid, createdAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'BENEFIT_CREATED', String(input.schoolId), uid, 'FINANCIAL_BENEFIT', benefitId,
      { benefitType: input.benefitType, paymentType: input.paymentType }
    ));
    return { benefitId, status: 'draft', idempotentReplay: false };
  });
});

export const approveFinancialBenefit = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const benefitId = requireId((raw || {}).benefitId, 'benefitId');
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const userRef = db.collection('users').doc(uid);
    const benefitRef = db.collection('financialBenefits').doc(benefitId);
    const [userSnap, benefitSnap] = await Promise.all([transaction.get(userRef), transaction.get(benefitRef)]);
    const user = validateActiveUser(userSnap, APPROVAL_ROLES);
    if (!benefitSnap.exists) throw httpsError('not-found', 'Benefit not found.', 'BENEFIT_NOT_FOUND');
    const benefit = benefitSnap.data() || {};
    validateTenant(user, String(benefit.schoolId));
    if (benefit.status === 'approved') return { benefitId, status: 'approved', idempotentReplay: true };
    if (benefit.status !== 'draft') {
      throw httpsError('failed-precondition', 'Benefit is not approvable.', 'BENEFIT_NOT_APPROVABLE');
    }
    const schoolRef = db.collection('schools').doc(String(benefit.schoolId));
    const studentRef = db.collection('students').doc(String(benefit.studentId));
    const financeRef = db.collection('studentFinance').doc(String(benefit.studentId));
    const privateRef = db.collection('studentPrivate').doc(String(benefit.studentId));
    const paymentsQuery = db.collection('payments').where('studentId', '==', benefit.studentId);
    const benefitsQuery = db.collection('financialBenefits').where('studentId', '==', benefit.studentId);
    const [schoolSnap, studentSnap, financeSnap, privateSnap, paymentsSnap, benefitsSnap] = await Promise.all([
      transaction.get(schoolRef), transaction.get(studentRef), transaction.get(financeRef), transaction.get(privateRef),
      transaction.get(paymentsQuery), transaction.get(benefitsQuery)
    ]);
    if (!schoolSnap.exists) throw httpsError('not-found', 'School not found.', 'SCHOOL_NOT_FOUND');
    if (!studentSnap.exists) throw httpsError('not-found', 'Student not found.', 'STUDENT_NOT_FOUND');
    const school = schoolSnap.data() || {};
    const student = studentSnap.data() || {};
    validateCollectionSchool(school);
    validateCollectionStudentTenant(student, String(benefit.schoolId));
    await validateCollectionAcademicYear(
      transaction, db, school, student, String(benefit.schoolId), String(benefit.academicYear)
    );
    let bus: Data | null = null;
    if (benefit.paymentType === 'TRANSPORT' && typeof student.busId === 'string' && student.busId) {
      const busSnap = await transaction.get(db.collection('buses').doc(student.busId));
      if (!busSnap.exists || busSnap.data()?.schoolId !== benefit.schoolId) {
        throw httpsError('failed-precondition', 'Student bus tenant mismatch.', 'CROSS_SCHOOL_DENIED');
      }
      bus = busSnap.data() || {};
    }
    const overlappingPayment = paymentsSnap.docs.map(doc => doc.data()).some(payment => {
      if (!isConfirmedPayment(payment) || payment.schoolId !== benefit.schoolId
          || payment.academicYear !== benefit.academicYear) return false;
      if (benefit.paymentType === 'TUITION') {
        return payment.type === 'tuition'
          && (benefit.installment === 'ALL_TUITION' || payment.installment === benefit.installment);
      }
      return payment.type === 'transport' && typeof payment.period === 'string'
        && payment.period >= benefit.transportStartPeriod && payment.period <= benefit.transportEndPeriod;
    });
    if (overlappingPayment) {
      throw httpsError('failed-precondition', 'A payment already exists in this benefit scope.', 'PAYMENT_ALREADY_EXISTS');
    }
    const conflictingBenefit = benefitsSnap.docs
      .filter(snapshot => snapshot.id !== benefitId)
      .map(normalizeBenefit)
      .filter(other => other.schoolId === benefit.schoolId && other.academicYear === benefit.academicYear)
      .filter(other => ACTIVE_BENEFIT_STATUSES.has(String(other.status)))
      .find(other => benefitScopesOverlap(benefit, other)
        && (benefit.stackable !== true || other.stackable !== true));
    if (conflictingBenefit) {
      throw httpsError(
        'failed-precondition', 'A non-stackable benefit already covers this scope.',
        'NON_STACKABLE_BENEFIT_CONFLICT'
      );
    }
    if (benefit.paymentType === 'TUITION') {
      const legacyBenefits = await readLegacyTuitionBenefits(
        transaction, db, String(benefit.schoolId), String(benefit.studentId), String(benefit.academicYear)
      );
      if (legacyBenefits.some(other => benefitScopesOverlap(benefit, other))) {
        throw httpsError(
          'failed-precondition', 'An approved legacy tuition discount already covers this scope.',
          'LEGACY_DISCOUNT_CONFLICT'
        );
      }
    }
    let classData: Data = {};
    if (benefit.paymentType === 'TRANSPORT') {
      const policy = school.transportPolicy && typeof school.transportPolicy === 'object'
        ? school.transportPolicy as Data : {};
      if (policy.feePolicyId === ITALO_TRANSPORT_FEE_POLICY_ID) {
        const classId = typeof student.classId === 'string' ? student.classId : '';
        if (!classId) throw httpsError('failed-precondition', 'Student class is invalid.', 'INVALID_CLASS');
        const classSnap = await transaction.get(db.collection('classes').doc(classId));
        if (!classSnap.exists || classSnap.data()?.schoolId !== benefit.schoolId) {
          throw httpsError('failed-precondition', 'Student class is invalid.', 'INVALID_CLASS');
        }
        classData = classSnap.data() || {};
      }
    }
    const finance = resolveStudentFinanceData(studentSnap.data() || {}, financeSnap);
    const targetType = benefit.paymentType === 'TUITION' ? 'tuition' : 'transport';
    const targetInstallment = benefit.paymentType === 'TUITION' && benefit.installment !== 'ALL_TUITION'
      ? benefit.installment as Installment : null;
    const gross = benefit.paymentType === 'TUITION' && benefit.installment === 'ALL_TUITION'
      ? (['T1', 'T2', 'T3'] as Installment[]).reduce((sum, item) => {
          const configured = resolveConfiguredTuitionGross(item, finance, schoolSnap.data() || {});
          return configured === null ? sum : safeAdd(sum, configured, 'grossExpectedAmount');
        }, 0)
      : targetType === 'transport'
        ? resolveTransportBenefitGross({ student, privateData: privateSnap.data() || {}, classData, finance, school, bus })
        : resolveGross(targetType, targetInstallment, finance, school, bus);
    calculateBenefitAmount(gross, benefit.mode as BenefitMode, benefit.value as number);
    let referenceRef: admin.firestore.DocumentReference | null = null;
    if (typeof benefit.reference === 'string') {
      const referenceId = hashId('benefitref', [benefit.schoolId, benefit.reference]);
      referenceRef = db.collection('financialBenefitReferences').doc(referenceId);
      const referenceSnap = await transaction.get(referenceRef);
      if (referenceSnap.exists && referenceSnap.data()?.benefitId !== benefitId) {
        throw httpsError('already-exists', 'Voucher reference already used.', 'VOUCHER_REFERENCE_ALREADY_USED');
      }
    }
    if (referenceRef) {
      transaction.set(referenceRef, {
        id: referenceRef.id, schoolId: benefit.schoolId, reference: benefit.reference,
        benefitId, singleUse: benefit.singleUse === true, maximumUses: benefit.maximumUses,
        createdAt: FieldValue.serverTimestamp(), createdBy: uid
      });
    }
    transaction.update(benefitRef, {
      status: 'approved', approvedBy: uid, approvedAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'BENEFIT_APPROVED', String(benefit.schoolId), uid, 'FINANCIAL_BENEFIT', benefitId
    ));
    return { benefitId, status: 'approved', idempotentReplay: false };
  });
});

export const cancelFinancialBenefit = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const benefitId = requireId((raw || {}).benefitId, 'benefitId');
  const reason = requireText((raw || {}).reason, 'reason', 3, 500);
  const uid = context.auth.uid;
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const userRef = db.collection('users').doc(uid);
    const benefitRef = db.collection('financialBenefits').doc(benefitId);
    const [userSnap, benefitSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(benefitRef)
    ]);
    const user = validateActiveUser(userSnap, APPROVAL_ROLES);
    if (!benefitSnap.exists) throw httpsError('not-found', 'Benefit not found.', 'BENEFIT_NOT_FOUND');
    const benefit = benefitSnap.data() || {};
    validateTenant(user, String(benefit.schoolId));
    if (benefit.status === 'cancelled') {
      return { benefitId, status: 'cancelled', idempotentReplay: true };
    }
    if (benefit.status !== 'draft' && benefit.status !== 'approved') {
      throw httpsError('failed-precondition', 'An applied or settled benefit cannot be cancelled.', 'BENEFIT_NOT_CANCELLABLE');
    }
    transaction.update(benefitRef, {
      status: 'cancelled', cancellationReason: reason,
      cancelledBy: uid, cancelledAt: FieldValue.serverTimestamp()
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'BENEFIT_CANCELLED', String(benefit.schoolId), uid, 'FINANCIAL_BENEFIT', benefitId,
      { reason }
    ));
    return { benefitId, status: 'cancelled', idempotentReplay: false };
  });
});

const readLegacyTuitionBenefits = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  schoolId: string,
  studentId: string,
  academicYear: string
): Promise<Data[]> => {
  const installments = ['T1', 'T2', 'T3'] as Installment[];
  const slotRefs = installments.map(installment => db.collection('tuitionDiscountSlots').doc(
    makeTuitionDiscountSlotId({ schoolId, studentId, academicYear, installment })
  ));
  const slotSnaps = await Promise.all(slotRefs.map(ref => transaction.get(ref)));
  const existingSlots = slotSnaps.filter(snapshot => snapshot.exists);
  const discountRefs = existingSlots.map(snapshot => {
    const slot = snapshot.data() || {};
    if (slot.schoolId !== schoolId || slot.studentId !== studentId || slot.academicYear !== academicYear
        || !INSTALLMENTS.has(slot.installment as Installment) || typeof slot.discountId !== 'string'
        || !slot.discountId.trim()) {
      throw httpsError('failed-precondition', 'Legacy tuition discount slot is malformed.', 'LEGACY_DISCOUNT_CORRUPTED');
    }
    return db.collection('tuitionDiscounts').doc(slot.discountId);
  });
  const discountSnaps = await Promise.all(discountRefs.map(ref => transaction.get(ref)));
  return discountSnaps.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw httpsError('failed-precondition', 'Legacy tuition discount is missing.', 'LEGACY_DISCOUNT_CORRUPTED');
    }
    const discount = snapshot.data() || {};
    const slot = existingSlots[index].data() || {};
    if (discount.schoolId !== schoolId || discount.studentId !== studentId
        || discount.academicYear !== academicYear || discount.installment !== slot.installment
        || typeof discount.discountAmount !== 'number' || !Number.isSafeInteger(discount.discountAmount)
        || discount.discountAmount <= 0 || !ACTIVE_BENEFIT_STATUSES.has(String(discount.status))) {
      throw httpsError('failed-precondition', 'Legacy tuition discount is malformed.', 'LEGACY_DISCOUNT_CORRUPTED');
    }
    return {
      id: `legacy:${snapshot.id}`, legacy: true, legacyDiscountId: snapshot.id,
      schoolId, studentId, academicYear, paymentType: 'TUITION', installment: slot.installment,
      benefitType: 'EXCEPTIONAL_DISCOUNT', mode: 'FIXED_AMOUNT', value: discount.discountAmount,
      stackable: false, reason: discount.reason || 'Réduction scolarité existante',
      reference: typeof discount.discountCode === 'string' ? discount.discountCode : null,
      status: discount.status, usageCount: 0, maximumUses: 1, appliedTargets: []
    };
  });
};

const parseQuoteInput = (raw: Data): Data & {
  schoolId: string; studentId: string; academicYear: string;
  type: PaymentType; installment: Installment | null; period: string | null;
} => {
  const schoolId = requireId(raw.schoolId, 'schoolId');
  const studentId = requireId(raw.studentId, 'studentId');
  const academicYear = requireAcademicYear(raw.academicYear);
  const target = requirePaymentTarget(raw);
  if (target.period && !transportPeriodIsInAcademicYear(target.period, academicYear)) {
    throw httpsError('invalid-argument', 'Transport period is outside the academic year.', 'PERIOD_OUTSIDE_ACADEMIC_YEAR');
  }
  return { ...raw, schoolId, studentId, academicYear, ...target };
};

const readQuoteContext = async (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  uid: string,
  input: ReturnType<typeof parseQuoteInput>
): Promise<{
  user: Data; school: Data; student: Data; finance: Data; benefits: Data[]; payments: Data[];
  moratoriums: Data[]; allocations: Data[];
  quote: CollectionQuote; classData: Data; financeRef: admin.firestore.DocumentReference;
  financeSnap: admin.firestore.DocumentSnapshot;
}> => {
  const userRef = db.collection('users').doc(uid);
  const schoolRef = db.collection('schools').doc(input.schoolId);
  const studentRef = db.collection('students').doc(input.studentId);
  const financeRef = db.collection('studentFinance').doc(input.studentId);
  const privateRef = db.collection('studentPrivate').doc(input.studentId);
  const benefitsQuery = db.collection('financialBenefits').where('studentId', '==', input.studentId);
  const paymentsQuery = db.collection('payments').where('studentId', '==', input.studentId);
  const moratoriumsQuery = db.collection('paymentMoratoriums').where('studentId', '==', input.studentId);
  const allocationsQuery = db.collection('transportPaymentAllocations').where('studentId', '==', input.studentId);
  const [userSnap, schoolSnap, studentSnap, financeSnap, privateSnap, benefitsSnap, paymentsSnap,
    moratoriumsSnap, allocationsSnap] = await Promise.all([
    transaction.get(userRef), transaction.get(schoolRef), transaction.get(studentRef), transaction.get(financeRef), transaction.get(privateRef),
    transaction.get(benefitsQuery), transaction.get(paymentsQuery), transaction.get(moratoriumsQuery),
    transaction.get(allocationsQuery)
  ]);
  const user = validateActiveUser(userSnap, PAYMENT_ROLES);
  validateTenant(user, input.schoolId);
  if (!schoolSnap.exists) throw httpsError('not-found', 'School not found.', 'SCHOOL_NOT_FOUND');
  const school = schoolSnap.data() || {};
  validateCollectionSchool(school);
  if (!studentSnap.exists) throw httpsError('not-found', 'Student not found.', 'STUDENT_NOT_FOUND');
  const student = studentSnap.data() || {};
  validateCollectionStudentTenant(student, input.schoolId);
  const academicYearConfig = await validateCollectionAcademicYear(
    transaction, db, school, student, input.schoolId, input.academicYear
  );
  const scheduleSchool = withAcademicYearTuitionDeadlines(school, academicYearConfig);
  const finance = resolveStudentFinanceData(student, financeSnap);
  let bus: Data | null = null;
  if (input.type === 'transport' && typeof student.busId === 'string' && student.busId) {
    const busSnap = await transaction.get(db.collection('buses').doc(student.busId));
    if (busSnap.exists) {
      if (busSnap.data()?.schoolId !== input.schoolId) {
        throw httpsError('failed-precondition', 'Student bus tenant mismatch.', 'CROSS_SCHOOL_DENIED');
      }
      bus = busSnap.data() || {};
    }
  }
  let classData: Data = {};
  if (typeof student.classId === 'string' && student.classId) {
    const classSnap = await transaction.get(db.collection('classes').doc(student.classId));
    if (!classSnap.exists || classSnap.data()?.schoolId !== input.schoolId) {
      throw httpsError('failed-precondition', 'Student class is invalid.', 'INVALID_CLASS');
    }
    classData = classSnap.data() || {};
  }
  assertTransportClassIsKnown(input.type, classData);
  const canonicalBenefits = benefitsSnap.docs.map(normalizeBenefit)
    .filter(item => item.schoolId === input.schoolId && item.academicYear === input.academicYear);
  const legacyBenefits = input.type === 'tuition'
    ? await readLegacyTuitionBenefits(transaction, db, input.schoolId, input.studentId, input.academicYear)
    : [];
  const benefits = [...canonicalBenefits, ...legacyBenefits];
  const payments = paymentsSnap.docs.map(doc => doc.data());
  const moratoriums = moratoriumsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }) as Data)
    .filter(item => item.schoolId === input.schoolId && item.studentId === input.studentId
      && item.academicYear === input.academicYear);
  const allocations = allocationsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }) as Data)
    .filter(item => item.schoolId === input.schoolId && item.studentId === input.studentId);
  let quote: CollectionQuote;
  if (input.type === 'transport') {
    const fee = resolveTransportFee(student, privateSnap.exists ? privateSnap.data() || {} : {}, classData);
    if (fee.state !== 'BILLABLE') {
      quote = zeroTransportQuote(fee.state);
    } else if (!input.period) {
      quote = buildTransportCollectionQuote({
        fee, periods: resolveTransportBillingPeriods(school, input.academicYear), benefits, payments,
        allocations, moratoriums, school: scheduleSchool, schoolId: input.schoolId,
        academicYear: input.academicYear, today: getDoualaDate()
      });
    } else {
      const policy = school.transportPolicy && typeof school.transportPolicy === 'object'
        ? school.transportPolicy as Data : {};
      if (policy.feePolicyId === ITALO_TRANSPORT_FEE_POLICY_ID
          && !resolveTransportBillingPeriods(school, input.academicYear).includes(input.period)) {
        throw httpsError('failed-precondition', 'Ce mois ne fait pas partie du calendrier transport.',
          'TRANSPORT_PERIOD_NOT_BILLABLE');
      }
      quote = buildQuote({ gross: resolveGross(input.type, input.installment, finance, school, bus, fee),
        benefits, payments, moratoriums, school: scheduleSchool, schoolId: input.schoolId, academicYear: input.academicYear,
        type: input.type, installment: input.installment, period: input.period, today: getDoualaDate() });
    }
  } else {
    quote = buildQuote({ gross: resolveGross(input.type, input.installment, finance, school, bus),
      benefits, payments, moratoriums, school: scheduleSchool, schoolId: input.schoolId, academicYear: input.academicYear,
      type: input.type, installment: input.installment, period: input.period, today: getDoualaDate() });
  }
  return {
    user, school: scheduleSchool, student, finance, benefits, payments, moratoriums, allocations,
    quote, classData, financeRef, financeSnap
  };
};

export const getCollectionQuote = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const input = parseQuoteInput((raw || {}) as Data);
  const db = admin.firestore();
  return db.runTransaction(async transaction => {
    const result = await readQuoteContext(transaction, db, context.auth!.uid, input);
    return { ...result.quote, type: input.type, installment: input.installment, period: input.period };
  });
});

const buildTuitionProjection = (
  finance: Data,
  school: Data,
  benefits: Data[],
  payments: Data[],
  moratoriums: Data[],
  schoolId: string,
  academicYear: string,
  today: string,
  pendingPayment: Data
): Data => {
  const byInstallment: Data = {};
  let grossTotal = 0;
  let discountTotal = 0;
  let netTotal = 0;
  let paidTotal = 0;
  for (const installment of ['T1', 'T2', 'T3'] as Installment[]) {
    const gross = resolveConfiguredTuitionGross(installment, finance, school);
    if (gross === null) continue;
    const targetPayments = [...payments, pendingPayment];
    const quote = buildQuote({ gross, benefits, payments: targetPayments, moratoriums, school, schoolId, academicYear,
      type: 'tuition', installment, period: null, today });
    grossTotal = safeAdd(grossTotal, gross, 'tuitionExpectedGross');
    discountTotal = safeAdd(discountTotal, quote.discountAmount, 'tuitionDiscountTotal');
    netTotal = safeAdd(netTotal, quote.netExpectedAmount, 'tuitionExpectedNet');
    paidTotal = safeAdd(paidTotal, quote.previousPaid, 'tuitionPaid');
    byInstallment[installment] = {
      grossExpectedAmount: gross, discountAmount: quote.discountAmount,
      netExpectedAmount: quote.netExpectedAmount, paidAmount: quote.previousPaid,
      remainingBalance: quote.remainingBalance, status: quote.status,
      originalDueDate: quote.originalDueDate, effectiveDueDate: quote.effectiveDueDate,
      nextDueDate: quote.nextDueDate, moratoriumStatus: quote.moratoriumStatus,
      moratoriumId: quote.moratoriumId, overdue: quote.overdue, dueStatus: quote.dueStatus
    };
  }
  return {
    tuitionByInstallment: byInstallment, tuitionExpectedGross: grossTotal,
    tuitionDiscountTotal: discountTotal, tuitionExpectedNet: netTotal,
    tuitionPaid: paidTotal, tuitionExpected: netTotal,
    tuitionStatus: paidTotal >= netTotal ? 'paid' : paidTotal > 0 ? 'partial' : 'unpaid'
  };
};

const buildTransportProjection = (
  finance: Data,
  quote: CollectionQuote,
  period: string,
  paidAmount: number
): Data => {
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0 || paidAmount > quote.netExpectedAmount) {
    throw httpsError(
      'failed-precondition',
      'Transport payment projection is invalid.',
      'FINANCIAL_HISTORY_INCONSISTENT'
    );
  }
  const remainingBalance = quote.netExpectedAmount - paidAmount;
  const existingPeriods = finance.transportByPeriod && typeof finance.transportByPeriod === 'object'
    ? finance.transportByPeriod as Data : {};
  const transportByPeriod = {
    ...existingPeriods,
    [period]: {
      grossExpectedAmount: quote.grossExpectedAmount,
      discountAmount: quote.discountAmount,
      netExpectedAmount: quote.netExpectedAmount,
      paidAmount,
      remainingBalance,
      status: remainingBalance === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
      originalDueDate: quote.originalDueDate,
      effectiveDueDate: quote.effectiveDueDate,
      nextDueDate: remainingBalance > 0 ? quote.effectiveDueDate : null,
      moratoriumStatus: quote.moratoriumStatus,
      moratoriumId: quote.moratoriumId,
      overdue: remainingBalance > 0 && quote.overdue,
      dueStatus: remainingBalance === 0 ? 'PAID' : quote.dueStatus
    }
  };
  const values = Object.values(transportByPeriod) as Data[];
  const aggregate = (key: string) => values.reduce((sum, value) => safeAdd(
    sum, typeof value[key] === 'number' ? value[key] as number : 0, key
  ), 0);
  return {
    transportByPeriod,
    transportExpectedGross: aggregate('grossExpectedAmount'),
    transportDiscountTotal: aggregate('discountAmount'),
    transportExpectedNet: aggregate('netExpectedAmount'),
    transportPaid: aggregate('paidAmount')
  };
};
const buildCanonicalTransportProjection = (
  finance: Data,
  quote: TransportCollectionQuote,
  allocationItems: TransportAllocationPlanItem[],
  newReceivedTotal: number
): Data => {
  const addedByPeriod = new Map<string, number>();
  let addedCredit = 0;
  for (const allocation of allocationItems) {
    if (allocation.kind === 'CREDIT') addedCredit = safeAdd(addedCredit, allocation.amount, 'transportCredit');
    else addedByPeriod.set(String(allocation.period), safeAdd(
      addedByPeriod.get(String(allocation.period)) || 0, allocation.amount, `transport:${allocation.period}`));
  }
  const existingPeriods = finance.transportByPeriod && typeof finance.transportByPeriod === 'object'
    ? finance.transportByPeriod as Data : {};
  const transportByPeriod: Data = { ...existingPeriods };
  for (const installment of quote.installments) {
    const paidAmount = safeAdd(
      installment.previousPaid, addedByPeriod.get(installment.period) || 0, `transportPaid:${installment.period}`);
    const remainingBalance = installment.netExpectedAmount - paidAmount;
    transportByPeriod[installment.period] = {
      grossExpectedAmount: installment.grossExpectedAmount,
      discountAmount: installment.discountAmount,
      netExpectedAmount: installment.netExpectedAmount,
      paidAmount,
      remainingBalance,
      status: remainingBalance === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
      originalDueDate: installment.originalDueDate,
      effectiveDueDate: installment.effectiveDueDate,
      nextDueDate: remainingBalance > 0 ? installment.effectiveDueDate : null,
      moratoriumStatus: installment.moratoriumStatus,
      moratoriumId: installment.moratoriumId,
      overdue: remainingBalance > 0 && installment.overdue,
      dueStatus: remainingBalance === 0 ? 'PAID' : installment.dueStatus
    };
  }
  return {
    transportByPeriod,
    transportExpectedGross: quote.grossExpectedAmount,
    transportDiscountTotal: quote.discountAmount,
    transportExpectedNet: quote.netExpectedAmount,
    transportPaid: newReceivedTotal,
    transportCredit: safeAdd(quote.transportCredit, addedCredit, 'transportCredit'),
    transportZonePk: quote.zonePk,
    transportFeePolicyId: quote.feePolicyId
  };
};


export const recordCashPayment = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  const source = (raw || {}) as Data;
  const input = parseQuoteInput(source);
  const requestId = requireId(source.requestId, 'requestId');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
    throw httpsError('invalid-argument', 'requestId format is invalid.', 'INVALID_REQUEST_ID');
  }
  const amount = requireMoney(source.amount, 'amount');
  const description = source.description === undefined || source.description === null || source.description === ''
    ? null : requireText(source.description, 'description', 1, 500);
  const uid = context.auth.uid;
  const db = admin.firestore();
  const paymentId = hashId('pay', [input.schoolId, requestId]);
  const paymentFingerprint = crypto.createHash('sha256').update(JSON.stringify({
    schoolId: input.schoolId, studentId: input.studentId, academicYear: input.academicYear,
    type: input.type, installment: input.installment, period: input.period, amount, description
  }), 'utf8').digest('hex');

  return db.runTransaction(async transaction => {
    const paymentRef = db.collection('payments').doc(paymentId);
    const receiptRef = db.collection('receipts').doc(paymentId);
    const [paymentSnap, receiptSnap] = await Promise.all([
      transaction.get(paymentRef), transaction.get(receiptRef)
    ]);
    if (paymentSnap.exists || receiptSnap.exists) {
      if (!paymentSnap.exists || !receiptSnap.exists) {
        throw httpsError('failed-precondition', 'Idempotent payment pair is incomplete.', 'IDEMPOTENCY_CORRUPTION');
      }
      const payment = paymentSnap.data() || {};
      const receipt = receiptSnap.data() || {};
      if (payment.requestFingerprint !== paymentFingerprint || receipt.paymentId !== paymentId
          || receipt.requestFingerprint !== paymentFingerprint) {
        throw httpsError('already-exists', 'requestId already identifies another payment.', 'IDEMPOTENCY_CONFLICT');
      }
      return {
        paymentId, receiptId: paymentId, receiptNumber: receipt.receiptNumber,
        amount: payment.amount, grossExpectedAmount: receipt.grossExpectedAmount,
        discountAmount: receipt.discountAmount, netExpectedAmount: receipt.netExpectedAmount,
        previousPaid: receipt.previousPaid, newPaid: receipt.newPaid,
        remainingBalance: receipt.remainingBalance, benefits: receipt.benefits || [],
        allocations: receipt.allocationSummary || payment.allocations || [],
        transportCredit: receipt.transportCredit ?? payment.transportCredit ?? 0,
        idempotentReplay: true
      };
    }

    const contextData = await readQuoteContext(transaction, db, uid, input);
    const {
      user, school, student, finance, benefits, payments, moratoriums,
      quote, classData, financeRef, financeSnap
    } = contextData;
    const date = getDoualaDate();
    const cashLedgerId = makeCashLedgerDayId(input.schoolId, date);
    const cashLedgerRef = db.collection(CASH_LEDGER_COLLECTION).doc(cashLedgerId);
    const cashClosureRef = db.collection('cashClosures').doc(cashLedgerId);
    const [cashLedgerSnap, cashClosureSnap] = await Promise.all([
      transaction.get(cashLedgerRef),
      transaction.get(cashClosureRef)
    ]);
    let currentCashReceived = requireOpenCashDay(
      cashLedgerSnap.exists ? cashLedgerSnap.data() || {} : null,
      cashClosureSnap.exists,
      input.schoolId,
      date
    );
    if (!cashLedgerSnap.exists) {
      const legacyCashPaymentsSnap = await transaction.get(
        db.collection('payments')
          .where('schoolId', '==', input.schoolId)
          .where('date', '==', date)
      );
      currentCashReceived = calculateCollectedPaymentTotal(
        legacyCashPaymentsSnap.docs.map(document => document.data()),
        'cash'
      );
    }
    const canonicalTransport = input.type === 'transport' && input.period === null;
    const transportQuote = canonicalTransport ? quote as TransportCollectionQuote : null;
    if (transportQuote && transportQuote.transportState !== 'BILLABLE') {
      throw httpsError('failed-precondition',
        transportQuote.transportState === 'FREE_SECONDARY'
          ? 'TRANSPORT GRATUIT : aucun paiement ne peut être enregistré.'
          : 'Cet élève n’utilise pas le transport.',
        transportQuote.transportState === 'FREE_SECONDARY'
          ? 'TRANSPORT_FREE_SECONDARY' : 'TRANSPORT_NOT_SUBSCRIBED');
    }
    if (!canonicalTransport && quote.remainingBalance <= 0) {
      throw httpsError('failed-precondition', 'Aucun reste à payer.', 'NO_REMAINING_BALANCE');
    }
    if (!canonicalTransport && amount > quote.remainingBalance) {
      throw httpsError(
        'failed-precondition', 'Le montant saisi dépasse le reste à payer.', 'OVERPAYMENT_DENIED'
      );
    }
    const allocationPlan = transportQuote ? planTransportAllocations(
      transportQuote.installments.map(item => ({ period: item.period, remainingBalance: item.remainingBalance })), amount
    ) : null;
    const newPaid = safeAdd(quote.previousPaid, amount, 'newPaid');
    const remainingBalance = allocationPlan
      ? quote.remainingBalance - allocationPlan.allocatedAmount : quote.netExpectedAmount - newPaid;
    const counterRef = db.collection('counters').doc(`receipts_${input.schoolId}`);
    const counterSnap = await transaction.get(counterRef);
    const lastNumber = counterSnap.exists ? counterSnap.data()?.lastReceiptNumber : 0;
    if (typeof lastNumber !== 'number' || !Number.isSafeInteger(lastNumber) || lastNumber < 0) {
      throw httpsError('failed-precondition', 'Receipt counter is invalid.', 'RECEIPT_COUNTER_CORRUPTED');
    }
    const nextNumber = safeAdd(lastNumber, 1, 'receipt number');
    const receiptNumber = `REC-${date.slice(0, 4)}-${String(nextNumber).padStart(4, '0')}`;
    const fixtureSnapshot = student.testFixture === true
      && typeof student.testRunId === 'string'
      && /^[A-Za-z0-9_-]{1,128}$/.test(student.testRunId)
      ? { testFixture: true, testRunId: student.testRunId }
      : {};
    const commonSnapshot = {
      grossExpectedAmount: quote.grossExpectedAmount,
      discountAmount: quote.discountAmount,
      netExpectedAmount: quote.netExpectedAmount,
      expectedAmount: quote.netExpectedAmount,
      previousPaid: quote.previousPaid,
      newPaid,
      remainingBalance,
      ...(allocationPlan ? {
        allocations: allocationPlan.allocations, transportCredit: safeAdd(
          transportQuote!.transportCredit, allocationPlan.creditAmount, 'transportCredit')
      } : {}),
      benefits: quote.benefits,
      originalDueDate: quote.originalDueDate,
      effectiveDueDate: quote.effectiveDueDate,
      nextDueDate: remainingBalance > 0 ? quote.effectiveDueDate : null,
      moratoriumStatus: quote.moratoriumStatus,
      moratoriumId: quote.moratoriumId,
      overdue: remainingBalance > 0 && quote.overdue,
      dueStatus: remainingBalance === 0 ? 'PAID' : quote.dueStatus,
      ...fixtureSnapshot
    };
    const paymentData = {
      id: paymentId, paymentId, requestId, requestFingerprint: paymentFingerprint,
      schoolId: input.schoolId, studentId: input.studentId, academicYear: input.academicYear,
      type: input.type, ...(input.installment ? { installment: input.installment } : {}),
      ...(input.period ? { period: input.period, month: input.period } : {}),
      amount, description, method: 'cash', status: 'completed', date,
      createdBy: uid, createdAt: FieldValue.serverTimestamp(), byRecordCashPayment: true,
      ...commonSnapshot
    };
    const receiptData = {
      id: paymentId, paymentId, requestId, requestFingerprint: paymentFingerprint,
      receiptNumber, schoolId: input.schoolId, studentId: input.studentId,
      studentName: student.name || '', studentRegistrationNumber: student.matricule || '',
      classId: student.classId || '', className: classData.name || '',
      academicYear: input.academicYear, schoolName: school.name || 'EcoScolaire',
      type: input.type, paymentType: input.type,
      ...(input.installment ? { installment: input.installment } : {}),
      ...(input.period ? { period: input.period, month: input.period } : {}),
      method: 'cash', paymentMethod: 'cash', date, paymentDate: date, amount,
      collectedByUserId: uid, collectedByName: user.name || user.displayName || user.email || uid,
      ...(allocationPlan ? { allocationSummary: allocationPlan.allocations } : {}),
      createdAt: FieldValue.serverTimestamp(), ...commonSnapshot
    };
    if (allocationPlan) {
      allocationPlan.allocations.forEach((allocation, index) => {
        const allocationId = hashId('transport_allocation', [paymentId, index, allocation.kind, allocation.period]);
        transaction.create(db.collection('transportPaymentAllocations').doc(allocationId), {
          id: allocationId, allocationId, schoolId: input.schoolId, studentId: input.studentId,
          academicYear: input.academicYear, paymentId, receiptId: paymentId,
          kind: allocation.kind, period: allocation.period, amount: allocation.amount,
          status: 'POSTED', sequence: index, createdBy: uid, createdAt: FieldValue.serverTimestamp(),
          byTransportPaymentEngine: true, ...fixtureSnapshot
        });
        transaction.create(db.collection('audit_logs').doc(), { ...auditData(
          'TRANSPORT_PAYMENT_ALLOCATED', input.schoolId, uid, 'TRANSPORT_ALLOCATION', allocationId,
          { paymentId, kind: allocation.kind, period: allocation.period, amount: allocation.amount }
        ), ...fixtureSnapshot });
      });
    }


    transaction.set(counterRef, { lastReceiptNumber: nextNumber }, { merge: true });
    transaction.create(paymentRef, paymentData);
    transaction.create(receiptRef, receiptData);
    transaction.set(cashLedgerRef, {
      id: cashLedgerId,
      schoolId: input.schoolId,
      date,
      status: 'open',
      cashReceived: safeAdd(currentCashReceived, amount, 'cashReceived'),
      updatedAt: FieldValue.serverTimestamp(),
      ...(!cashLedgerSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {})
    }, { merge: true });

    let financePatch: Data;
    if (input.type === 'registration_fee') {
      financePatch = {
        registrationFeePaid: newPaid,
        registrationFeeStatus: remainingBalance === 0 ? 'paid' : 'partial'
      };
    } else if (input.type === 'tuition') {
      financePatch = buildTuitionProjection(
        finance, school, benefits, payments, moratoriums,
        input.schoolId, input.academicYear, date, paymentData
      );
    } else if (allocationPlan && transportQuote) {
      financePatch = buildCanonicalTransportProjection(
        finance, transportQuote, allocationPlan.allocations, newPaid);
    } else {
      financePatch = buildTransportProjection(finance, quote, String(input.period), newPaid);
    }
    writeStudentFinanceProjection({
      transaction, financeRef, financeSnapshot: financeSnap, studentId: input.studentId,
      schoolId: input.schoolId, patch: financePatch, actorId: uid
    });

    if (allocationPlan && transportQuote) {
      const applications = new Map<string, { benefit: Data; targets: Set<string> }>();
      for (const allocation of allocationPlan.allocations.filter(item => item.kind === 'INSTALLMENT')) {
        const installment = transportQuote.installments.find(item => item.period === allocation.period);
        if (!installment) continue;
        for (const snapshot of installment.benefits) {
          const benefit = benefits.find(item => item.id === snapshot.benefitId);
          if (!benefit || benefit.legacy === true) continue;
          const entry = applications.get(snapshot.benefitId) || { benefit, targets: new Set<string>() };
          entry.targets.add(paymentTargetKey('transport', null, installment.period));
          applications.set(snapshot.benefitId, entry);
        }
      }
      for (const [benefitId, application] of applications) {
        const appliedTargets = Array.isArray(application.benefit.appliedTargets)
          ? application.benefit.appliedTargets as string[] : [];
        const newTargets = [...application.targets].filter(target => !appliedTargets.includes(target)).sort();
        const usageCount = typeof application.benefit.usageCount === 'number'
          ? application.benefit.usageCount : 0;
        const maximumUses = typeof application.benefit.maximumUses === 'number'
          ? application.benefit.maximumUses : 1;
        if (usageCount + newTargets.length > maximumUses) {
          throw httpsError('failed-precondition', 'Une aide transport dépasserait son nombre d’utilisations.',
            'BENEFIT_USAGE_CONFLICT');
        }
        const patch: Data = { lastAppliedAt: FieldValue.serverTimestamp(), lastPaymentId: paymentId };
        if (newTargets.length > 0) {
          patch.appliedTargets = FieldValue.arrayUnion(...newTargets);
          patch.usageCount = safeAdd(usageCount, newTargets.length, 'usageCount');
          if (application.benefit.status === 'approved') patch.status = 'applied';
          for (const target of newTargets) transaction.create(db.collection('audit_logs').doc(), auditData(
            'BENEFIT_APPLIED', input.schoolId, uid, 'FINANCIAL_BENEFIT', benefitId, { paymentId, target }));
        }
        transaction.update(db.collection('financialBenefits').doc(benefitId), patch);
      }
    } else {
    const targetKey = paymentTargetKey(input.type, input.installment, input.period);
    for (const snapshot of quote.benefits) {
      const benefit = benefits.find(item => item.id === snapshot.benefitId)!;
      if (benefit.legacy === true) continue;
      const appliedTargets = Array.isArray(benefit.appliedTargets) ? benefit.appliedTargets as string[] : [];
      const firstUseForTarget = !appliedTargets.includes(targetKey);
      const patch: Data = { lastAppliedAt: FieldValue.serverTimestamp(), lastPaymentId: paymentId };
      if (firstUseForTarget) {
        patch.appliedTargets = FieldValue.arrayUnion(targetKey);
        patch.usageCount = safeAdd(typeof benefit.usageCount === 'number' ? benefit.usageCount : 0, 1, 'usageCount');
        if (benefit.status === 'approved') patch.status = 'applied';
        transaction.create(db.collection('audit_logs').doc(), auditData(
          'BENEFIT_APPLIED', input.schoolId, uid, 'FINANCIAL_BENEFIT', snapshot.benefitId,
          { paymentId, target: targetKey }
        ));
      }
      const singleTarget = (benefit.paymentType === 'TUITION' && benefit.installment !== 'ALL_TUITION')
        || (benefit.paymentType === 'TRANSPORT' && benefit.transportStartPeriod === benefit.transportEndPeriod);
      if (singleTarget && remainingBalance === 0) {
        patch.status = 'settled'; patch.settledAt = FieldValue.serverTimestamp();
      }
      transaction.update(db.collection('financialBenefits').doc(snapshot.benefitId), patch);
    }

    }
    transaction.create(db.collection('audit_logs').doc(), { ...auditData(
      'PAYMENT_CREATED', input.schoolId, uid, 'PAYMENT', paymentId,
      { type: input.type, installment: input.installment, period: input.period, amount }
    ), ...fixtureSnapshot });
    if (input.type === 'transport') {
      transaction.create(db.collection('audit_logs').doc(), { ...auditData(
        'TRANSPORT_PAYMENT_CREATED', input.schoolId, uid, 'PAYMENT', paymentId,
        { period: input.period, amount }
      ), ...fixtureSnapshot });
    }
    transaction.create(db.collection('audit_logs').doc(), { ...auditData(
      'RECEIPT_CREATED', input.schoolId, uid, 'RECEIPT', paymentId, { receiptNumber }
    ), ...fixtureSnapshot });

    return {
      paymentId, receiptId: paymentId, receiptNumber, amount,
      ...commonSnapshot, benefits: quote.benefits, idempotentReplay: false
    };
  });
});

export const reversePayment = functions.https.onCall(async (raw, context) => {
  if (!context.auth?.uid) {
    throw httpsError('unauthenticated', 'Authentication required.', 'UNAUTHENTICATED');
  }
  const source = (raw || {}) as Data;
  const paymentId = requireId(source.paymentId, 'paymentId');
  const requestId = requireId(source.requestId, 'requestId');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) {
    throw httpsError('invalid-argument', 'requestId format is invalid.', 'INVALID_REQUEST_ID');
  }
  const reason = requireText(source.reason, 'reason', 3, 500);
  const uid = context.auth.uid;
  const db = admin.firestore();
  const reversalId = hashId('payment_reversal', [paymentId]);
  const reversalFingerprint = crypto.createHash('sha256').update(JSON.stringify({
    paymentId, requestId, reason
  }), 'utf8').digest('hex');

  return db.runTransaction(async transaction => {
    const userRef = db.collection('users').doc(uid);
    const paymentRef = db.collection('payments').doc(paymentId);
    const receiptRef = db.collection('receipts').doc(paymentId);
    const reversalRef = db.collection('payments').doc(reversalId);
    const correctionReceiptRef = db.collection('receipts').doc(reversalId);
    const originalAllocationsQuery = db.collection('transportPaymentAllocations').where('paymentId', '==', paymentId);
    const [userSnap, paymentSnap, receiptSnap, reversalSnap, correctionReceiptSnap,
      originalAllocationsSnap] = await Promise.all([
      transaction.get(userRef), transaction.get(paymentRef), transaction.get(receiptRef),
      transaction.get(reversalRef), transaction.get(correctionReceiptRef), transaction.get(originalAllocationsQuery)
    ]);

    const user = validateActiveUser(userSnap, new Set(['owner', 'superAdmin']));
    if (reversalSnap.exists || correctionReceiptSnap.exists) {
      if (!reversalSnap.exists || !correctionReceiptSnap.exists) {
        throw httpsError(
          'failed-precondition',
          'Idempotent reversal pair is incomplete.',
          'IDEMPOTENCY_CORRUPTION'
        );
      }
      const reversal = reversalSnap.data() || {};
      const correctionReceipt = correctionReceiptSnap.data() || {};
      if (reversal.requestFingerprint !== reversalFingerprint
          || correctionReceipt.requestFingerprint !== reversalFingerprint
          || reversal.originalPaymentId !== paymentId) {
        throw httpsError(
          'already-exists',
          'This payment has already been reversed by another request.',
          'PAYMENT_ALREADY_REVERSED'
        );
      }
      return {
        paymentId,
        reversalId,
        correctionReceiptId: reversalId,
        correctionReceiptNumber: correctionReceipt.receiptNumber,
        amount: reversal.amount,
        idempotentReplay: true
      };
    }

    if (!paymentSnap.exists) {
      throw httpsError('not-found', 'Payment not found.', 'PAYMENT_NOT_FOUND');
    }
    if (!receiptSnap.exists) {
      throw httpsError(
        'failed-precondition',
        'Original receipt is missing.',
        'PAYMENT_RECEIPT_MISSING'
      );
    }
    const original = paymentSnap.data() || {};
    const originalReceipt = receiptSnap.data() || {};
    if (original.kind === 'PAYMENT_REVERSAL' || original.byReversePayment === true
        || original.byRecordCashPayment !== true || original.method !== 'cash'
        || original.status !== 'completed') {
      throw httpsError(
        'failed-precondition',
        'Only a completed canonical CASH payment can be reversed.',
        'PAYMENT_NOT_REVERSIBLE'
      );
    }
    const schoolId = requireId(original.schoolId, 'payment.schoolId');
    validateTenant(user, schoolId);
    const studentId = requireId(original.studentId, 'payment.studentId');
    const academicYear = requireAcademicYear(original.academicYear);
    const target = requirePaymentTarget(original);
    const originalAmount = requireMoney(original.amount, 'payment.amount');
    const canonicalTransport = target.type === 'transport' && target.period === null;
    const originalAllocationItems: TransportAllocationPlanItem[] = originalAllocationsSnap.docs.map(document => {
      const allocation = document.data() as Data;
      if (allocation.schoolId !== schoolId || allocation.studentId !== studentId
          || allocation.academicYear !== academicYear || allocation.paymentId !== paymentId) {
        throw httpsError('failed-precondition', 'Une allocation originale est incohérente.',
          'TRANSPORT_ALLOCATION_HISTORY_INCONSISTENT');
      }
      const allocationAmount = requireTransportAllocationAmount(allocation);
      if (allocationAmount <= 0) throw httpsError('failed-precondition', 'Une allocation originale est invalide.',
        'TRANSPORT_ALLOCATION_HISTORY_INCONSISTENT');
      return { kind: allocation.kind as 'INSTALLMENT' | 'CREDIT',
        period: allocation.kind === 'INSTALLMENT' ? requireTransportPeriod(allocation.period) : null,
        amount: allocationAmount };
    });
    if (canonicalTransport && (originalAllocationItems.length === 0
        || originalAllocationItems.reduce((sum, item) => safeAdd(sum, item.amount, 'allocationTotal'), 0)
          !== originalAmount)) {
      throw httpsError('failed-precondition', 'Les allocations originales ne correspondent pas au paiement.',
        'TRANSPORT_ALLOCATION_HISTORY_INCONSISTENT');
    }
    if (originalReceipt.paymentId !== paymentId || originalReceipt.schoolId !== schoolId
        || originalReceipt.studentId !== studentId || originalReceipt.amount !== originalAmount) {
      throw httpsError(
        'failed-precondition',
        'Original payment and receipt are inconsistent.',
        'PAYMENT_RECEIPT_MISMATCH'
      );
    }

    const input = parseQuoteInput({ schoolId, studentId, academicYear, ...target });
    const contextData = await readQuoteContext(transaction, db, uid, input);
    const {
      school, student, finance, benefits, payments, moratoriums,
      quote, classData, financeRef, financeSnap
    } = contextData;
    const newPaid = safeAdd(quote.previousPaid, -originalAmount, 'newPaid');
    if (newPaid < 0) {
      throw httpsError(
        'failed-precondition',
        'Reversal would make the historical paid amount negative.',
        'FINANCIAL_HISTORY_INCONSISTENT'
      );
    }
    const reversedAllocatedAmount = originalAllocationItems
      .filter(item => item.kind === 'INSTALLMENT')
      .reduce((sum, item) => safeAdd(sum, item.amount, 'reversedAllocatedAmount'), 0);
    const remainingBalance = canonicalTransport
      ? safeAdd(quote.remainingBalance, reversedAllocatedAmount, 'remainingBalance') : quote.netExpectedAmount - newPaid;
    const date = getDoualaDate();
    const cashLedgerId = makeCashLedgerDayId(schoolId, date);
    const cashLedgerRef = db.collection(CASH_LEDGER_COLLECTION).doc(cashLedgerId);
    const cashClosureRef = db.collection('cashClosures').doc(cashLedgerId);
    const [cashLedgerSnap, cashClosureSnap] = await Promise.all([
      transaction.get(cashLedgerRef),
      transaction.get(cashClosureRef)
    ]);
    let currentCashReceived = requireOpenCashDay(
      cashLedgerSnap.exists ? cashLedgerSnap.data() || {} : null,
      cashClosureSnap.exists,
      schoolId,
      date
    );
    if (!cashLedgerSnap.exists) {
      const legacyCashPaymentsSnap = await transaction.get(
        db.collection('payments')
          .where('schoolId', '==', schoolId)
          .where('date', '==', date)
      );
      currentCashReceived = calculateCollectedPaymentTotal(
        legacyCashPaymentsSnap.docs.map(document => document.data()),
        'cash'
      );
    }
    const correctionNumber = `ANN-${String(originalReceipt.receiptNumber || paymentId)}`;
    const fixtureSnapshot = original.testFixture === true
      && typeof original.testRunId === 'string'
      && /^[A-Za-z0-9_-]{1,128}$/.test(original.testRunId)
      ? { testFixture: true, testRunId: original.testRunId }
      : {};
    const reversalData = {
      id: reversalId,
      paymentId: reversalId,
      requestId,
      requestFingerprint: reversalFingerprint,
      schoolId,
      studentId,
      academicYear,
      type: target.type,
      ...(target.installment ? { installment: target.installment } : {}),
      ...(target.period ? { period: target.period, month: target.period } : {}),
      amount: -originalAmount,
      originalAmount,
      originalPaymentId: paymentId,
      originalReceiptId: paymentId,
      reason,
      description: `Contre-opération: ${reason}`,
      method: 'cash',
      status: 'completed',
      kind: 'PAYMENT_REVERSAL',
      date,
      createdBy: uid,
      createdByRole: user.role,
      createdAt: FieldValue.serverTimestamp(),
      byReversePayment: true,
      grossExpectedAmount: quote.grossExpectedAmount,
      discountAmount: quote.discountAmount,
      netExpectedAmount: quote.netExpectedAmount,
      expectedAmount: quote.netExpectedAmount,
      previousPaid: quote.previousPaid,
      newPaid,
      remainingBalance,
      benefits: quote.benefits,
      ...(canonicalTransport ? { allocations: originalAllocationItems.map(item => ({ ...item, amount: -item.amount })) } : {}),
      originalDueDate: quote.originalDueDate,
      effectiveDueDate: quote.effectiveDueDate,
      nextDueDate: remainingBalance > 0 ? quote.effectiveDueDate : null,
      moratoriumStatus: quote.moratoriumStatus,
      moratoriumId: quote.moratoriumId,
      overdue: remainingBalance > 0 && quote.overdue,
      dueStatus: remainingBalance === 0 ? 'PAID' : quote.dueStatus,
      ...fixtureSnapshot
    };
    const correctionReceiptData = {
      id: reversalId,
      paymentId: reversalId,
      requestId,
      requestFingerprint: reversalFingerprint,
      receiptNumber: correctionNumber,
      schoolId,
      studentId,
      studentName: student.name || originalReceipt.studentName || '',
      studentRegistrationNumber: student.matricule || originalReceipt.studentRegistrationNumber || '',
      classId: student.classId || originalReceipt.classId || '',
      className: classData.name || originalReceipt.className || '',
      academicYear,
      schoolName: school.name || originalReceipt.schoolName || 'EcoScolaire',
      type: target.type,
      paymentType: target.type,
      ...(target.installment ? { installment: target.installment } : {}),
      ...(target.period ? { period: target.period, month: target.period } : {}),
      method: 'cash',
      paymentMethod: 'cash',
      date,
      paymentDate: date,
      amount: -originalAmount,
      originalAmount,
      originalPaymentId: paymentId,
      originalReceiptId: paymentId,
      reason,
      kind: 'PAYMENT_REVERSAL',
      correctedByUserId: uid,
      correctedByRole: user.role,
      createdAt: FieldValue.serverTimestamp(),
      grossExpectedAmount: quote.grossExpectedAmount,
      discountAmount: quote.discountAmount,
      netExpectedAmount: quote.netExpectedAmount,
      expectedAmount: quote.netExpectedAmount,
      previousPaid: quote.previousPaid,
      newPaid,
      remainingBalance,
      benefits: quote.benefits,
      ...(canonicalTransport ? { allocationSummary: originalAllocationItems.map(item => ({ ...item, amount: -item.amount })) } : {}),
      originalDueDate: quote.originalDueDate,
      effectiveDueDate: quote.effectiveDueDate,
      nextDueDate: remainingBalance > 0 ? quote.effectiveDueDate : null,
      moratoriumStatus: quote.moratoriumStatus,
      moratoriumId: quote.moratoriumId,
      overdue: remainingBalance > 0 && quote.overdue,
      dueStatus: remainingBalance === 0 ? 'PAID' : quote.dueStatus,
      ...fixtureSnapshot
    };

    transaction.create(reversalRef, reversalData);
    transaction.create(correctionReceiptRef, correctionReceiptData);
    transaction.set(cashLedgerRef, {
      id: cashLedgerId,
      schoolId,
      date,
      status: 'open',
      cashReceived: safeAdd(currentCashReceived, -originalAmount, 'cashReceived'),
      updatedAt: FieldValue.serverTimestamp(),
      ...(!cashLedgerSnap.exists ? { createdAt: FieldValue.serverTimestamp() } : {})
    }, { merge: true });

    if (canonicalTransport) {
      originalAllocationItems.forEach((allocation, index) => {
        const reversalAllocationId = hashId('transport_allocation_reversal', [reversalId, index]);
        transaction.create(db.collection('transportPaymentAllocations').doc(reversalAllocationId), {
          id: reversalAllocationId, allocationId: reversalAllocationId, schoolId, studentId, academicYear,
          paymentId: reversalId, receiptId: reversalId, originalPaymentId: paymentId,
          kind: allocation.kind, period: allocation.period, amount: -allocation.amount,
          status: 'POSTED', sequence: index, createdBy: uid, createdAt: FieldValue.serverTimestamp(),
          byTransportPaymentEngine: true, byReversePayment: true, ...fixtureSnapshot
        });
        transaction.create(db.collection('audit_logs').doc(), auditData(
          'TRANSPORT_PAYMENT_ALLOCATION_REVERSED', schoolId, uid,
          'TRANSPORT_ALLOCATION', reversalAllocationId,
          { paymentId: reversalId, originalPaymentId: paymentId, kind: allocation.kind,
            period: allocation.period, amount: -allocation.amount }
        ));
      });
    }
    let financePatch: Data;
    if (target.type === 'registration_fee') {
      financePatch = {
        registrationFeePaid: newPaid,
        registrationFeeStatus: newPaid === 0 ? 'unpaid' : remainingBalance === 0 ? 'paid' : 'partial'
      };
    } else if (target.type === 'tuition') {
      financePatch = buildTuitionProjection(
        finance, school, benefits, payments, moratoriums,
        schoolId, academicYear, date, reversalData
      );
    } else if (canonicalTransport) {
      financePatch = buildCanonicalTransportProjection(
        finance, quote as TransportCollectionQuote,
        originalAllocationItems.map(item => ({ ...item, amount: -item.amount })), newPaid);
    } else {
      financePatch = buildTransportProjection(finance, quote, String(target.period), newPaid);
    }
    writeStudentFinanceProjection({
      transaction,
      financeRef,
      financeSnapshot: financeSnap,
      studentId,
      schoolId,
      patch: financePatch,
      actorId: uid
    });
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'PAYMENT_REVERSED', schoolId, uid, 'PAYMENT', paymentId,
      { reversalId, correctionReceiptId: reversalId, amount: originalAmount, reason }
    ));
    transaction.create(db.collection('audit_logs').doc(), auditData(
      'PAYMENT_REVERSAL_RECEIPT_CREATED', schoolId, uid, 'RECEIPT', reversalId,
      { originalPaymentId: paymentId, correctionNumber }
    ));

    return {
      paymentId,
      reversalId,
      correctionReceiptId: reversalId,
      correctionReceiptNumber: correctionNumber,
      amount: -originalAmount,
      previousPaid: quote.previousPaid,
      newPaid,
      remainingBalance,
      idempotentReplay: false
    };
  });
});
