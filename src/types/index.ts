export interface School {
  id: string;
  name: string;
  academicYear: string;
  logo?: string;
  adminPin?: string;
  createdAt: string;
  globalFees?: {
    feeT1: number;
    feeT2: number;
    feeT3: number;
    feeTransport: number;
    feeUniforms: number;
  };
  apiKeys?: {
    flutterwavePublic?: string;
    flutterwaveSecret?: string;
  };
}

export type SectionType = 'francophone' | 'anglophone';

export interface ClassSection {
  id: string;
  name: string;
  type: SectionType;
  subjects?: string[]; // Allowed subjects for this class
  capacity?: number;
  level?: 'maternelle' | 'primaire';
}

export interface Subject {
  id: string;
  name: string;
}

export interface Student {
  id: string;
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
  rawClassName?: string; // Used for Excel import preview
  detectedClassName?: string; // Used for Excel import preview
}

export interface Staff {
  id: string;
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
  studentId: string;
  date: string;
  present: boolean;
  status?: AttendanceStatus;
  reason?: string;
}

export interface StaffAttendance {
  id: string;
  staffId: string;
  date: string;
  present: boolean;
  status?: AttendanceStatus;
  reason?: string;
}

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  date: string; // e.g. "2023-10-01" or a semester id
  score: number;
  maxScore?: number;
}

export interface Bus {
  id: string;
  name: string;
  plate?: string;
  capacity?: number;
  status?: 'actif' | 'en_panne' | 'en_entretien';
  routeId?: string;
}

export interface BusRoute {
  id: string;
  name: string;
  areas: string;
  departureTime: string;
  returnTime: string;
}

export interface FuelExpense {
  id: string;
  date: string;
  busId: string;
  amount: number;
  liters: number;
  mileage: number;
  comment: string;
}

export interface Maintenance {
  id: string;
  date: string;
  busId: string;
  type: string;
  amount: number;
  garage: string;
  nextMaintenanceDate: string;
}

export interface Breakdown {
  id: string;
  date: string;
  busId: string;
  description: string;
  severity: 'légère' | 'moyenne' | 'urgente';
  status: 'signalée' | 'en_réparation' | 'réparée';
  estimatedCost: number;
  actualCost?: number;
}

export type PaymentType = 'transport' | 'uniforms' | 'tuition' | 'other';

export interface Payment {
  id: string;
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
  amount: number;
  date: string;
  person: string;
  reason: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  alertThreshold: number;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  personName: string;
  date: string;
}
