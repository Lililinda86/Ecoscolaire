export type SubscriptionPlan = 'starter' | 'standard' | 'premium' | 'pilot';
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'expired';

export type EducationCycle = 'nursery' | 'primary' | 'secondary';

export interface CycleNames {
  nursery?: string;
  primary?: string;
  secondary?: string;
}

export interface CycleAccreditationNumbers {
  nursery?: string;
  primary?: string;
  secondary?: string;
}

export interface School {
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
  id: string; // schoolId
  schoolCode: string;
  name: string; // schoolName
  academicYear: string;
  activeAcademicYearId?: string;
  logoUrl?: string | null; // Image en Base64 ; null = logo supprimé explicitement
  logoFileName?: string;
  logoUpdatedAt?: string;
  adminPin?: string;
  createdAt: string;
  address?: string;
  phone?: string;
  email?: string;
  directorName?: string;
  accreditationNumber?: string;
  educationCycles?: EducationCycle[];
  founderName?: string;
  principalName?: string;
  cycleNames?: CycleNames;
  cycleAccreditationNumbers?: CycleAccreditationNumbers;
  // --- Nouveaux champs SaaS ---
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  trialEndsAt?: string;
  isInternalSchool?: boolean;
  studentCount?: number;
  studentsCount?: number;
  studentLimit?: number | null;
  lastStudentCounterMutationId?: string;
  lastStudentCounterMutationType?: 'create' | 'deactivate' | 'reactivate';
  amountPaid?: number;
  nextPaymentDate?: string;
  // --- Fin champs SaaS ---
  globalFees?: {
    feeT1: number;
    feeT2: number;
    feeT3: number;
    feeTransport: number;
    feeUniforms: number;
  };
  classFees?: Record<string, {
    registration?: number;
    tuition?: number;
    t1?: number;
    t2?: number;
    t3?: number;
  }>;
  transportPolicy?: {
    secretaryManageAll?: boolean;
  };
  apiKeys?: { // DEPRECATED
    flutterwavePublic?: string;
    flutterwaveSecret?: string; // DEPRECATED
  };
  paymentSettings?: SchoolPaymentSettingsPublic;
}

export type GlobalRole = 'superAdmin' | 'owner' | 'director' | 'secretary' | 'accountant' | 'teacher' | 'driver' | 'parent' | 'student' | 'boardViewer';

export interface User {
  id: string; // uid from Firebase Auth
  schoolId?: string; // Null pour le superAdmin
  email: string;
  role: GlobalRole;
  active?: boolean;
  isActive: boolean;
  status?: 'active' | 'inactive';
  createdAt: string;
  // Spécifique Parent
  studentIds?: string[];
  // Legacy : conservé en lecture pour compatibilité, non écrit par les nouveaux comptes.
  mustChangePin?: boolean;
}

export interface ParentInvitation {
  id: string; // inviteId
  schoolId: string;
  studentId: string;
  parentEmail: string;
  parentEmailLower: string;
  parentName: string;
  studentName: string;
  status: 'pending' | 'used' | 'expired';
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  usedAt?: string;
  usedBy?: string;
}

export interface ValidationRequest {
  id: string;
  schoolId: string;
  requesterId: string;
  requesterRole: GlobalRole;
  actionType: 'UPDATE_GRADE' | 'DELETE_STUDENT' | 'HIGH_EXPENSE' | 'CHANGE_ROLE';
  targetCollection: string;
  targetDocumentId?: string;
  proposedData: unknown;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Notification {
  id: string;
  schoolId: string;
  userId: string; // destinataire
  title: string;
  message: string;
  type: 'UNPAID_FEE' | 'GRADE_AVAILABLE' | 'ABSENCE' | 'SUBSCRIPTION_EXPIRY' | 'INFO';
  read: boolean;
  createdAt: string;
}

export type SectionType = 'francophone' | 'anglophone';

export interface ClassSection {
  id: string;
  schoolId?: string;
  name: string;
  type: SectionType;
  subjects?: string[]; // Allowed subjects for this class
  capacity?: number;
  level?: 'maternelle' | 'primaire' | 'secondaire';

  // Réf. classes prédéfinies
  section?: SectionType;
  cycle?: 'preschool' | 'nursery' | 'primary' | 'secondary';
  educationType?: 'general' | 'technical';
  levelOrder?: number;
  isDefault?: boolean;
  isActive?: boolean;

  catalogLevelId?: string; // identifiant du niveau dans DEFAULT_CLASS_LEVELS
  specialtyId?: string; // identifiant de la spécialité technique configurée par l'école
}

export interface TechnicalSpecialty {
  id: string;
  schoolId?: string;
  name: string;
  code?: string;
  isActive: boolean;
  displayOrder?: number;
}

export interface Subject {
  id: string;
  schoolId?: string;
  name: string;
  code?: string;
  shortName?: string;
  section?: 'francophone' | 'anglophone' | 'all';
  cycles?: ('nursery' | 'primary' | 'secondary')[];
  category?: string;
  teachingLanguage?: string;
  color?: string;
  isActive?: boolean;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Student {
  id: string;
  schoolId?: string;
  /** Active academic year used when this student record was created. Legacy records may omit it. */
  academicYearId?: string;
  matricule?: string;
  /** Deterministic uniqueness metadata; optional only for legacy records. */
  matriculeNormalized?: string;
  matriculeReservationId?: string;
  duplicateFingerprint?: string;
  duplicateReservationId?: string;
  name: string;
  gender: 'M' | 'F';
  dob: string;
  section: SectionType;
  classId?: string; // Reference to class
  busId?: string;
  parentName: string;
  parentPhone?: string;
  address?: string;
  feeAmount?: number; // Total yearly tuition fee (Legacy)
  feeT1?: number; // Tranche 1
  feeT2?: number; // Tranche 2
  feeT3?: number; // Tranche 3
  feeTransport?: number;
  feeUniforms?: number;
  financialBypass?: { t1: boolean, t2: boolean, t3: boolean }; // Pour débloquer les notes
  parentEmails?: string[]; // Ajout SaaS pour lier avec l'email du Parent
  rawClassName?: string; // Used for Excel import preview
  detectedClassName?: string; // Used for Excel import preview
  allergies?: string;
  medicalConditions?: string;
  emergencyContact?: string;
  studentStatus?: 'nouveau' | 'ancien';
  registrationYear?: string;
  registrationFeeExpected?: number;
  registrationFeePaid?: number;
  registrationFeeStatus?: 'unpaid' | 'partial' | 'paid';
  tuitionExpected?: number;
  tuitionPaid?: number;
  tuitionStatus?: 'unpaid' | 'partial' | 'paid';
  usesTransport?: boolean;
  transportNeighborhood?: string;
  transportPickupPoint?: string;
  transportMonthlyFee?: number;
  transportFleet?: string;
  transportStatus?: 'none' | 'active' | 'suspended';
  transportPaid?: number;
  tuitionExpectedGross?: number;
  tuitionDiscountTotal?: number;
  tuitionExpectedNet?: number;
  tuitionByInstallment?: Record<'T1' | 'T2' | 'T3', FinancialPeriodSummary>;
  transportExpectedGross?: number;
  transportDiscountTotal?: number;
  transportExpectedNet?: number;
  transportByPeriod?: Record<string, FinancialPeriodSummary>;

  schoolingStatus?: 'active' | 'inactive';
  departureReason?: 'school_change' | 'graduated' | 'withdrawn' | 'other';
  departureDate?: string;
  departureNote?: string;
  deactivatedAt?: DateLike;
  deactivatedBy?: string;
  reactivatedAt?: DateLike;
  reactivatedBy?: string;

  // --- Structured student identity ---
  studentLastName?: string;
  studentFirstName?: string;
  placeOfBirth?: string;

  // --- Structured parents / guardians ---
  fatherName?: string;
  fatherPhone?: string;
  fatherProfession?: string;

  motherName?: string;
  motherPhone?: string;
  motherProfession?: string;

  guardianRelationship?: 'father' | 'mother' | 'other';
  guardianRelationshipDetails?: string;

  motherLastName?: string;
  motherFirstName?: string;
  motherEmail?: string;
  motherWhatsapp?: boolean;

  fatherLastName?: string;
  fatherFirstName?: string;
  fatherEmail?: string;
  fatherWhatsapp?: boolean;

  guardianLastName?: string;
  guardianFirstName?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianWhatsapp?: boolean;
  guardianRelation?: string;

  primaryContactType?: "mother" | "father" | "guardian";
  createdAt?: DateLike;
  createdBy?: string;
  updatedAt?: DateLike;
  updatedBy?: string;
}

export type StudentImportJobStatus = 'PENDING' | 'VALIDATING' | 'VALIDATING_COMPLETE' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'CANCELED';

export interface StudentImportJobSummary {
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface StudentImportJob {
  id: string; // jobId
  schoolId: string;
  status: StudentImportJobStatus;
  storagePath: string;
  totalRows: number;
  processedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorLogPath?: string;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface Staff {
  id: string;
  schoolId: string;
  firstName?: string;
  lastName?: string;
  gender?: 'M' | 'F' | 'other';
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  staffType?: 'teacher' | 'director' | 'secretary' | 'accountant' | 'supervisor' | 'driver' | 'maintenance' | 'other';
  teachingEnabled?: boolean;
  employmentStatus?: 'active' | 'inactive' | 'suspended' | 'departed';
  hireDate?: string;
  departureDate?: string;
  departureReason?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  name?: string;
  role?: string;
  status?: string;
  active?: boolean;
  isActive?: boolean;
  assignedClassId?: string;
  licenseNumber?: string;
  assignedBusId?: string;
  position?: string;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'left_early';

export interface Attendance {
  id: string;
  schoolId?: string;
  studentId: string;
  date: string;
  present: boolean;
  status?: AttendanceStatus;
  reason?: string;
}

export interface StaffAttendance {
  id: string;
  schoolId?: string;
  staffId: string;
  date: string;
  present: boolean;
  status?: AttendanceStatus;
  reason?: string;
}

export interface AcademicYear {
  version?: number;
  id: string;
  schoolId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  openPeriodId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Period {
  version?: number;
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  type: 'term' | 'semester' | 'sequence' | 'custom';
  order: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'open' | 'closed' | 'published' | 'archived';
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Evaluation {
  id: string;
  schoolId: string;
  academicYearId: string;
  periodId: string;
  classId: string;
  subjectId: string;
  classSubjectId: string;
  teacherId: string;
  title: string;
  type: string;
  date: string;
  maxScore: number;
  weight: number;
  status: 'draft' | 'open' | 'submitted' | 'validated' | 'locked';
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export type GradeResultStatus = 'scored' | 'absent' | 'excused' | 'exempt' | 'notSubmitted';
export type GradeStatus = 'draft' | 'submitted' | 'validated' | 'published' | 'locked';

export interface LegacyGrade {
  id?: string;
  schoolId?: string;
  subjectId?: string;
  studentId?: string;
  date?: string; // e.g. "2023-10-01"
  score?: number;
  maxScore?: number;
  status?: string;
  version?: number;
}

export interface LegacyGradeAnalysis {
  grade: LegacyGrade;
  isMigratable: boolean;
  missingFields: string[];
  warnings: string[];
  legacy: true;
}

export interface Grade {
  id: string;
  schoolId: string;
  academicYearId: string;
  periodId: string;
  evaluationId: string;
  classId: string;
  classSubjectId: string;
  subjectId: string;
  studentId: string;
  teacherId: string;
  status: GradeStatus;
  resultStatus: GradeResultStatus;
  score?: number; // Obligatoire seulement si resultStatus === 'scored'
  maxScore: number;
  comment?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export interface CreateGradeInput {
  schoolId: string;
  academicYearId: string;
  periodId: string;
  evaluationId: string;
  classId: string;
  classSubjectId: string;
  subjectId: string;
  studentId: string;
  teacherId: string;
  status: GradeStatus;
  resultStatus: GradeResultStatus;
  score?: number;
  maxScore: number;
  comment?: string;
}

export interface UpdateGradeInput {
  score?: number;
  resultStatus?: GradeResultStatus;
  comment?: string;
  status?: GradeStatus;
  expectedVersion: number;
}

export interface Bus {
  id: string;
  schoolId?: string;
  name: string;
  plate?: string;
  capacity?: number;
  status?: 'actif' | 'en_panne' | 'en_entretien';
  routeId?: string;
  isActive?: boolean;
}

export interface BusRoute {
  id: string;
  schoolId?: string;
  name: string;
  areas: string;
  departureTime: string;
  returnTime: string;
  isActive?: boolean;
}

export interface FuelExpense {
  id: string;
  schoolId?: string;
  date: string;
  busId: string;
  amount: number;
  liters: number;
  mileage: number;
  comment: string;
}

export interface Maintenance {
  id: string;
  schoolId?: string;
  date: string;
  busId: string;
  type: string;
  amount: number;
  garage: string;
  nextMaintenanceDate: string;
}

export interface Breakdown {
  id: string;
  schoolId?: string;
  date: string;
  busId: string;
  description: string;
  severity: 'légère' | 'moyenne' | 'urgente';
  status: 'signalée' | 'en_réparation' | 'réparée';
  estimatedCost: number;
  actualCost?: number;
}

export type PaymentType = 'transport' | 'uniforms' | 'tuition' | 'registration_fee' | 'other';

export interface FinancialPeriodSummary {
  grossExpectedAmount: number;
  discountAmount: number;
  netExpectedAmount: number;
  paidAmount: number;
  remainingBalance: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
}

export type FinancialBenefitType =
  | 'SCHOLARSHIP'
  | 'DISCOUNT_VOUCHER'
  | 'FAMILY_DISCOUNT'
  | 'EXCEPTIONAL_DISCOUNT';

export type FinancialBenefitMode = 'FIXED_AMOUNT' | 'PERCENTAGE';

export interface FinancialBenefit {
  id: string;
  schoolId: string;
  studentId: string;
  academicYear: string;
  benefitType: FinancialBenefitType;
  paymentType: 'TUITION' | 'TRANSPORT';
  mode: FinancialBenefitMode;
  value: number;
  installment?: 'T1' | 'T2' | 'T3' | 'ALL_TUITION';
  transportStartPeriod?: string;
  transportEndPeriod?: string;
  stackable: boolean;
  reason: string;
  reference?: string;
  singleUse?: boolean;
  maximumUses?: number;
  validFrom?: string;
  validUntil?: string;
  status: 'draft' | 'approved' | 'applied' | 'settled' | 'cancelled';
  createdBy: string;
  createdAt: DateLike;
  approvedBy?: string;
  approvedAt?: DateLike;
  cancelledBy?: string;
  cancelledAt?: DateLike;
  cancellationReason?: string;
}

export interface SchoolPaymentSettingsPublic {
  campayPublic?: string;
  flutterwavePublic?: string;
  activeProvider?: 'campay' | 'flutterwave' | 'none';
  hasCampaySecret?: boolean;
}

export interface SchoolPaymentSecrets {
  campaySecret?: string;
  flutterwaveSecret?: string;
}

export type TransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface PaymentTransaction {
  id: string;
  schoolId: string;
  userId: string;
  studentId?: string;
  amount: number;
  type: PaymentType;
  installment?: 'T1' | 'T2' | 'T3';
  provider: 'campay' | 'flutterwave';
  reference: string;
  status: TransactionStatus;
  phoneNumber?: string;
  providerTransactionId?: string;
  failureReason?: string;
  mode?: 'mock' | 'campay_sandbox';
  createdAt: string;
  updatedAt: string;
}

export type DateLike =
  | string
  | number
  | Date
  | {
      seconds?: number;
      toDate?: () => Date;
    }
  | null;

export interface Payment {
  id: string;
  schoolId?: string;
  studentId: string;
  amount: number;
  type: PaymentType;
  installment?: 'T1' | 'T2' | 'T3';
  month?: string;
  period?: string;
  date: string;
  description?: string;
  method?: 'cash' | 'mobile_money';
  transactionId?: string;
  academicYear?: string;
  createdBy?: string;
  createdAt?: DateLike;
  requestId?: string;
  byRecordCashPayment?: boolean;
  grossExpectedAmount?: number;
  discountAmount?: number;
  netExpectedAmount?: number;
  previousPaid?: number;
  newPaid?: number;
  remainingBalance?: number;
}

export interface ReceiptLike {
  id?: string;
  paymentId?: string;
  schoolId?: string;
  receiptNumber?: string;
  studentId?: string;
  studentName?: string;
  studentRegistrationNumber?: string;
  classId?: string;
  className?: string;
  academicYear?: string;
  schoolName?: string;
  type?: string;
  method?: string;
  date?: string;
  amount?: number;
  expectedAmount?: number;
  previousPaid?: number;
  newPaid?: number;
  remainingBalance?: number;
  collectedByUserId?: string;
  collectedByName?: string;
  createdAt?: DateLike;
  [key: string]: unknown;
}

export interface Expense {
  id: string;
  schoolId?: string;
  amount: number;
  date: string;
  person: string;
  reason: string;
  category?: string;
  kind?: 'EXPENSE' | 'REVERSAL';
  status?: 'DRAFT' | 'POSTED' | 'REVERSED';
  originalExpenseId?: string;
  originalAmount?: number;
  createdBy?: string;
  createdByRole?: string;
  createdAt?: DateLike;
}

export interface InventoryItem {
  id: string;
  schoolId?: string;
  name: string;
  quantity: number;
  alertThreshold: number;
}

export interface InventoryTransaction {
  id: string;
  schoolId?: string;
  itemId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  personName: string;
  date: string;
}

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
  createdAt: DateLike;
  approvedAt?: DateLike;
  firstAppliedAt?: DateLike;
  settledAt?: DateLike;
  revokedAt?: DateLike;
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
  createdAt: DateLike;
}

export interface CashClosure {
  id: string;
  schoolId: string;
  academicYear: string;
  date: string;
  openingBalance: number;
  cashReceived: number;
  cashExpenses: number;
  theoreticalBalance: number;
  countedBalance: number;
  discrepancy: number;
  notes: string;
  status: 'closed';
  closedBy: string;
  closedByName?: string;
  closedAt: DateLike;
}

export interface ClassProgram {
  id: string; // `${schoolId}__${academicYearId}__${classId}`
  schoolId: string;
  classId: string;
  academicYearId: string;

  status: 'draft' | 'published';

  draftRevisionId: string;
  draftRevisionNumber: number;

  publishedRevisionId?: string;
  publishedRevisionNumber?: number;

  hasUnpublishedChanges: boolean;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;

  publishedAt?: string;
  publishedBy?: string;
}

export interface ClassSubject {
  id: string; // `${revisionId}__${subjectId}`
  programId: string;

  schoolId: string;
  classId: string;
  academicYearId: string;
  subjectId: string;

  revisionId: string;
  revisionNumber: number;

  subjectNameSnapshot: string;
  subjectCodeSnapshot?: string;

  coefficient?: number;
  weeklyHours?: number;
  isRequired: boolean;
  displayOrder: number;
  isActive: boolean;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface StaffUserLink {
  id: string;
  schoolId: string;
  userId: string;
  staffId: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
}

export interface StaffUserLinkByUser {
  userId: string;
  staffId: string;
  schoolId: string;
  linkId: string;
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface StaffUserLinkByStaff {
  userId: string;
  staffId: string;
  schoolId: string;
  linkId: string;
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface TeacherAssignment {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherStaffId: string;
  assignmentRole: 'primary';
  sourceProgramId: string;
  sourcePublishedRevisionId: string;
  sourceClassSubjectId: string;
  isActive: boolean;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  teacherUserId?: string;
}

export interface TeacherAssignmentSlot {
  id: string;
  assignmentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherStaffId: string;
  assignmentRole: 'primary';
  sourceProgramId: string;
  sourcePublishedRevisionId: string;
  sourceClassSubjectId: string;
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
  teacherUserId?: string;
}
