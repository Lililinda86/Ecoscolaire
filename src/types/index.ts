export type SubscriptionPlan = 'starter' | 'standard' | 'premium';
export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'expired';

export interface School {
  id: string; // schoolId
  schoolCode: string;
  name: string; // schoolName
  academicYear: string;
  logoUrl?: string; // Image en Base64
  logoFileName?: string;
  logoUpdatedAt?: string;
  adminPin?: string;
  createdAt: string;
  address?: string;
  phone?: string;
  email?: string;
  directorName?: string;
  accreditationNumber?: string;
  // --- Nouveaux champs SaaS ---
  subscriptionPlan?: SubscriptionPlan;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
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
  apiKeys?: { // DEPRECATED
    flutterwavePublic?: string;
    flutterwaveSecret?: string; // DEPRECATED
  };
  paymentSettings?: SchoolPaymentSettingsPublic;
}

export type GlobalRole = 'superAdmin' | 'owner' | 'director' | 'secretary' | 'accountant' | 'teacher' | 'driver' | 'parent' | 'student';

export interface User {
  id: string; // uid from Firebase Auth
  schoolId?: string; // Null pour le superAdmin
  email: string;
  role: GlobalRole;
  isActive: boolean;
  createdAt: string;
  // Spécifique Parent
  studentIds?: string[];
  // Legacy / Mots de passe
  mustChangePin?: boolean;
}

export interface ValidationRequest {
  id: string;
  schoolId: string;
  requesterId: string;
  requesterRole: GlobalRole;
  actionType: 'UPDATE_GRADE' | 'DELETE_STUDENT' | 'HIGH_EXPENSE' | 'CHANGE_ROLE';
  targetCollection: string;
  targetDocumentId?: string;
  proposedData: any;
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
  level?: 'maternelle' | 'primaire';
}

export interface Subject {
  id: string;
  schoolId?: string;
  name: string;
}

export interface Student {
  id: string;
  schoolId?: string;
  matricule?: string;
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
  rawClassName?: string; // Used for Excel import preview
  detectedClassName?: string; // Used for Excel import preview
  allergies?: string;
  medicalConditions?: string;
  emergencyContact?: string;
}

export interface Staff {
  id: string;
  schoolId?: string;
  name: string;
  role: 'teacher' | 'driver' | 'assistant' | 'director' | 'secretary';
  assignedClassId?: string;
  phone?: string;
  licenseNumber?: string;
  assignedBusId?: string;
  status?: 'actif' | 'absent' | 'remplacé';
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

export interface Grade {
  id: string;
  schoolId?: string;
  studentId: string;
  subjectId: string;
  date: string; // e.g. "2023-10-01" ou un ID de semestre
  score: number;
  maxScore?: number;
}

export interface Bus {
  id: string;
  schoolId?: string;
  name: string;
  plate?: string;
  capacity?: number;
  status?: 'actif' | 'en_panne' | 'en_entretien';
  routeId?: string;
}

export interface BusRoute {
  id: string;
  schoolId?: string;
  name: string;
  areas: string;
  departureTime: string;
  returnTime: string;
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

export type PaymentType = 'transport' | 'uniforms' | 'tuition' | 'other';

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
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  schoolId?: string;
  studentId: string;
  amount: number;
  type: PaymentType;
  installment?: 'T1' | 'T2' | 'T3';
  date: string;
  description?: string;
  method?: 'cash' | 'mobile_money';
  transactionId?: string;
}

export interface Expense {
  id: string;
  schoolId?: string;
  amount: number;
  date: string;
  person: string;
  reason: string;
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
