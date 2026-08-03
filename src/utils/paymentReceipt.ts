import type { ReceiptLike, Student, Payment } from '../types';

export interface ClassLike {
  id: string;
  name: string;
}

export interface ReceiptDisplayModel {
  id: string;
  receiptNumber: string;
  date: string;
  studentName: string;
  studentRegistrationNumber: string;
  className: string | null;
  nature: string;
  tranche: string | null;
  method: string;
  amount: number;
  hasSnapshots: boolean;
  expectedAmount?: number;
  previousPaid?: number;
  newPaid?: number;
  remainingBalance?: number;
  paymentId: string;
  schoolName: string;
  academicYear: string;
  formattedAmount: string;
  formattedExpectedAmount: string;
  formattedPreviousPaid: string;
  formattedNewPaid: string;
  formattedRemainingBalance: string;
  paymentType?: string;
}

// Centralized Translation Mappings
export const translatePaymentType = (type?: string): string => {
  if (!type) return 'Autre';
  const typeMap: Record<string, string> = {
    tuition: 'Frais de scolarité',
    registration_fee: "Frais d'inscription",
    transport: 'Transport (Bus)',
    uniforms: 'Tenues',
    other: 'Autre'
  };
  return typeMap[type] || type;
};

export const translatePaymentMethod = (method?: string): string => {
  if (!method) return 'Espèces';
  const methodMap: Record<string, string> = {
    cash: 'Espèces',
    mobile_money: 'Mobile Money'
  };
  return methodMap[method] || method;
};

export const translateInstallment = (installment?: string): string => {
  if (!installment) return '';
  const installmentMap: Record<string, string> = {
    T1: 'Tranche 1',
    T2: 'Tranche 2',
    T3: 'Tranche 3'
  };
  return installmentMap[installment] || installment;
};

// Centralized Currency Formatter
export const formatCurrency = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '';
  }
  return `${value.toLocaleString('fr-FR')} FCFA`;
};

const findRelatedPayment = (receipt: ReceiptLike, payments?: Payment[]): Payment | undefined => {
  if (!receipt.paymentId || !payments) return undefined;
  return payments.find(p => {
    if (p.id !== receipt.paymentId) return false;
    if (receipt.schoolId && p.schoolId !== receipt.schoolId) return false;
    if (receipt.studentId && p.studentId !== receipt.studentId) return false;
    if (receipt.academicYear && p.academicYear !== receipt.academicYear) return false;
    return true;
  });
};

// Builder for ReceiptDisplayModel
export const buildReceiptDisplayModel = (
  receipt: ReceiptLike,
  students: Student[],
  classes: ClassLike[],
  payments?: Payment[]
): ReceiptDisplayModel => {
  const student = students.find(s => s.id === receipt.studentId);

  // Class Name Resolution Priority Order:
  // 1. receipt.className
  // 2. snapshot historical equivalent (receipt.className is already snapshot equivalent, but check other fields if any)
  // 3. lookup in classes list using receipt.classId or student.classId
  // 4. null (row will be hidden)
  let resolvedClassName: string | null = null;
  if (receipt.className && typeof receipt.className === 'string' && receipt.className.trim() !== '') {
    resolvedClassName = receipt.className;
  } else {
    const classId = receipt.classId || student?.classId;
    if (classId) {
      const cls = classes.find(c => c.id === classId);
      if (cls && cls.name) {
        resolvedClassName = cls.name;
      }
    }
  }

  // Date Parsing & Formatting
  const rawDate = receipt.createdAt || receipt.date || Date.now();
  let dateObj: Date;
  if (rawDate && typeof rawDate === 'object' && 'seconds' in rawDate && typeof rawDate.seconds === 'number') {
    dateObj = new Date(rawDate.seconds * 1000);
  } else {
    dateObj = new Date(rawDate as string | number | Date);
  }
  const formattedDate = !Number.isNaN(dateObj.getTime())
    ? `${dateObj.toLocaleDateString('fr-FR')} ${dateObj.toLocaleTimeString('fr-FR')}`
    : 'Date inconnue';

  // Check if financial snapshots exist (must explicitly distinguish between undefined and 0)
  const hasSnapshots = receipt.expectedAmount !== undefined && receipt.expectedAmount !== null;

  // Fallback de lecture pour les reçus historiques ne contenant pas encore le
  // snapshot installment. Le serveur devra enregistrer installment directement
  // dans Receipt.
  const rawInstallment = receipt.installment
    ?? findRelatedPayment(receipt, payments)?.installment;

  return {
    id: receipt.id || receipt.paymentId || '',
    receiptNumber: receipt.receiptNumber || 'En attente',
    date: formattedDate,
    studentName: receipt.studentName || student?.name || 'Inconnu',
    studentRegistrationNumber: receipt.studentRegistrationNumber || student?.matricule || '-',
    className: resolvedClassName,
    nature: translatePaymentType(receipt.type as string | undefined || receipt.paymentType as string | undefined),
    tranche: (receipt.type === 'tuition' || receipt.paymentType === 'tuition') && rawInstallment
      ? translateInstallment(rawInstallment as string)
      : null,
    method: translatePaymentMethod(receipt.method as string | undefined || receipt.paymentMethod as string | undefined),
    amount: receipt.amount || 0,
    hasSnapshots,
    expectedAmount: receipt.expectedAmount,
    previousPaid: receipt.previousPaid,
    newPaid: receipt.newPaid,
    remainingBalance: receipt.remainingBalance,
    paymentId: receipt.paymentId || receipt.id || '',
    schoolName: receipt.schoolName || 'EcoScolaire',
    academicYear: receipt.academicYear || '',
    formattedAmount: formatCurrency(receipt.amount),
    formattedExpectedAmount: formatCurrency(receipt.expectedAmount),
    formattedPreviousPaid: formatCurrency(receipt.previousPaid),
    formattedNewPaid: formatCurrency(receipt.newPaid),
    formattedRemainingBalance: formatCurrency(receipt.remainingBalance),
    paymentType: (receipt.type || receipt.paymentType) as string | undefined
  };
};
