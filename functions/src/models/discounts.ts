import type { Timestamp } from 'firebase-admin/firestore';

export type DiscountStatus =
  | 'draft'
  | 'approved'
  | 'applied'
  | 'settled'
  | 'revoked';

export type TuitionInstallment = 'T1' | 'T2' | 'T3';

/**
 * TuitionDiscount represents a discount allocated to a student for a specific trimester.
 * Note: Amounts are temporary drafts until approved, when they become immutable snapshots.
 */
export interface TuitionDiscount {
  id: string;
  schoolId: string;
  studentId: string;
  academicYear: string;
  discountCode: string;
  installment: TuitionInstallment;
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
  reason: string;
  status: DiscountStatus;
  createdByUserId: string;
  approvedByUserId?: string;
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  firstAppliedAt?: Timestamp;
  settledAt?: Timestamp;
  revokedAt?: Timestamp;
  revokedByUserId?: string;
  revocationReason?: string;
  firstPaymentId?: string;
  settlementPaymentId?: string;
}

export interface TuitionDiscountSlot {
  id: string;
  schoolId: string;
  studentId: string;
  academicYear: string;
  installment: TuitionInstallment;
  discountId: string;
  createdAt: Timestamp;
}
