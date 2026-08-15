import type {
  School,
  Student,
  Staff,
  ClassSection,
  Subject,
  Attendance,
  StaffAttendance,
  LegacyGrade,
  Bus,
  BusRoute,
  FuelExpense,
  Maintenance,
  Breakdown,
  Payment,
  Expense,
  InventoryItem,
  InventoryTransaction,
  User,
  ValidationRequest,
  Notification,
  TechnicalSpecialty,
  ClassProgram,
  ClassSubject,
  AcademicYear,
  Period,
  Evaluation,
  Grade,
  TeacherAssignment,
  FinancialBenefit
} from '../types';

export interface Database {
  classPrograms?: ClassProgram[];
  classSubjects?: ClassSubject[];
  academicYears?: AcademicYear[];
  periods?: Period[];
  evaluations?: Evaluation[];
  gradesStrict?: Grade[];
  invalidGradeDocumentsCount?: number;
  teacherAssignments?: TeacherAssignment[];
  // --- SaaS Collections (Globales) ---
  schools: School[];
  users: User[];
  validation_requests: ValidationRequest[];
  notifications: Notification[];

  // --- Current Tenant Context ---
  isActivated?: boolean;
  school: School | null;
  students: Student[];
  staff: Staff[];
  classes: ClassSection[];
  subjects: Subject[];
  technicalSpecialties: TechnicalSpecialty[];
  attendance: Attendance[];
  staffAttendance: StaffAttendance[];
  grades: LegacyGrade[];
  buses: Bus[];
  busRoutes: BusRoute[];
  fuelExpenses: FuelExpense[];
  maintenances: Maintenance[];
  breakdowns: Breakdown[];
  payments: Payment[];
  expenses: Expense[];
  inventory: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  transactions: StorageTransaction[];
  audit_logs: StorageAuditLog[];
  receipts?: StorageReceipt[];
  financialBenefits: FinancialBenefit[];
}

export type StorageTransaction = {
  id: string;
  [key: string]: unknown;
};

export type StorageAuditLog = {
  id: string;
  [key: string]: unknown;
};

export type StorageReceipt = {
  id: string;
  [key: string]: unknown;
};

export type DatabaseCollectionKey = {
  [K in keyof Database]-?: NonNullable<Database[K]> extends Array<unknown> ? K : never
}[keyof Database];

export type DatabasePatch = Partial<Pick<Database, DatabaseCollectionKey>>;

const initialDB: Database = {
  // Global SaaS
  schools: [],
  users: [
    {
      id: 'super-admin-1', // sera remplacé par l'UID Firebase Auth
      email: '',
      role: 'superAdmin',
      isActive: true,
      createdAt: new Date().toISOString()
    }
  ],
  validation_requests: [],
  notifications: [],

  // Current Tenant
  school: null,
  isActivated: false,
  students: [],
  staff: [],
  classes: [
    // Maternelle Anglophone
    { id: 'anglo-pre-nursery', name: 'Pre-Nursery', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-1', name: 'Nursery 1', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-2', name: 'Nursery 2', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-3', name: 'Nursery 3', type: 'anglophone', capacity: 30, level: 'maternelle' },
    // Primaire Anglophone
    { id: 'anglo-class-1', name: 'Class 1', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-2', name: 'Class 2', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-3', name: 'Class 3', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-4', name: 'Class 4', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-5', name: 'Class 5', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-6', name: 'Class 6', type: 'anglophone', capacity: 40, level: 'primaire' },
    // Secondaire Anglophone
    { id: 'anglo-form-1', name: 'Form 1', type: 'anglophone', capacity: 40, level: 'secondaire' },
    { id: 'anglo-form-2', name: 'Form 2', type: 'anglophone', capacity: 40, level: 'secondaire' },
    // Maternelle Francophone
    { id: 'franco-pre-maternelle', name: 'Pré-maternelle', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-1', name: 'Maternelle 1', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-2', name: 'Maternelle 2', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-3', name: 'Maternelle 3', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-petite-section', name: 'Petite section', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-moyenne-section', name: 'Moyenne section', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-grande-section', name: 'Grande section', type: 'francophone', capacity: 30, level: 'maternelle' },
    // Primaire Francophone
    { id: 'franco-sil', name: 'SIL', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cp', name: 'CP', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-ce1', name: 'CE1', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-ce2', name: 'CE2', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cm1', name: 'CM1', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cm2', name: 'CM2', type: 'francophone', capacity: 40, level: 'primaire' },
    // Secondaire Francophone
    { id: 'franco-6e', name: '6e', type: 'francophone', capacity: 40, level: 'secondaire' },
    { id: 'franco-5e', name: '5e', type: 'francophone', capacity: 40, level: 'secondaire' }
  ],
  subjects: [
    { id: 'math', name: 'Mathématiques' },
    { id: 'french', name: 'Français' },
    { id: 'history', name: 'Histoire-Géo' },
    { id: 'science', name: 'Sciences' }
  ],
  technicalSpecialties: [],
  attendance: [],
  staffAttendance: [],
  grades: [],
  buses: [],
  busRoutes: [],
  fuelExpenses: [],
  maintenances: [],
  breakdowns: [],
  payments: [],
  expenses: [],
  inventory: [],
  inventoryTransactions: [],
  transactions: [],
  audit_logs: [],
  receipts: [],
  financialBenefits: [],
  academicYears: [],
  periods: [],
  evaluations: [],
  gradesStrict: [],
  teacherAssignments: []
};

export const defaultDB = initialDB;

