import type {
  School,
  Student,
  Staff,
  ClassSection,
  Subject,
  Attendance,
  StaffAttendance,
  Grade,
  Bus,
  BusRoute,
  FuelExpense,
  Maintenance,
  Breakdown,
  Payment,
  InventoryItem,
  InventoryTransaction
} from '../types';

export interface Database {
  isActivated?: boolean;
  school: School | null;
  students: Student[];
  staff: Staff[];
  classes: ClassSection[];
  subjects: Subject[];
  attendance: Attendance[];
  staffAttendance: StaffAttendance[];
  grades: Grade[];
  buses: Bus[];
  busRoutes: BusRoute[];
  fuelExpenses: FuelExpense[];
  maintenances: Maintenance[];
  breakdowns: Breakdown[];
  payments: Payment[];
  expenses: any[];
  inventory: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
}

const DB_KEY = 'ecoscolaire_data';

const initialDB: Database = {
  school: null,
  isActivated: false,
  students: [],
  staff: [],
  classes: [
    // Anglophone
    { id: 'anglo-pre-nursery', name: 'Pre-Nursery', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-1', name: 'Nursery 1', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-2', name: 'Nursery 2', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-nursery-3', name: 'Nursery 3', type: 'anglophone', capacity: 30, level: 'maternelle' },
    { id: 'anglo-class-1', name: 'Class 1', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-2', name: 'Class 2', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-3', name: 'Class 3', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-4', name: 'Class 4', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-5', name: 'Class 5', type: 'anglophone', capacity: 40, level: 'primaire' },
    { id: 'anglo-class-6', name: 'Class 6', type: 'anglophone', capacity: 40, level: 'primaire' },
    // Francophone
    { id: 'franco-pre-maternelle', name: 'Pré-maternelle', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-1', name: 'Maternelle 1', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-2', name: 'Maternelle 2', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-maternelle-3', name: 'Maternelle 3', type: 'francophone', capacity: 30, level: 'maternelle' },
    { id: 'franco-sil', name: 'SIL', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cp', name: 'CP', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-ce1', name: 'CE1', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-ce2', name: 'CE2', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cm1', name: 'CM1', type: 'francophone', capacity: 40, level: 'primaire' },
    { id: 'franco-cm2', name: 'CM2', type: 'francophone', capacity: 40, level: 'primaire' }
  ],
  subjects: [
    { id: 'math', name: 'Mathématiques' },
    { id: 'french', name: 'Français' },
    { id: 'history', name: 'Histoire-Géo' },
    { id: 'science', name: 'Sciences' }
  ],
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
  inventoryTransactions: []
};

export const defaultDB = initialDB;

export const getDB = (): Database => {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return initialDB;
  try {
    return JSON.parse(data);
  } catch (e) {
    return initialDB;
  }
};

export const saveDB = (db: Database) => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};

export const resetDB = () => {
    localStorage.setItem(DB_KEY, JSON.stringify(initialDB));
};
