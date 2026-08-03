import type { Bus, Breakdown, FuelExpense, Maintenance, Payment, Student } from '../types';

// Helper pour normaliser les dates
export const normalizeDateStr = (dateVal: unknown): string => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    // Si c'est déjà un YYYY-MM ou YYYY-MM-DD
    if (/^\d{4}-\d{2}/.test(dateVal)) return dateVal.substring(0, 7);
    return new Date(dateVal).toISOString().substring(0, 7);
  }
  if (typeof dateVal === 'number') {
    return new Date(dateVal).toISOString().substring(0, 7);
  }
  if (dateVal && typeof dateVal === 'object' && 'toDate' in dateVal && typeof (dateVal as { toDate: unknown }).toDate === 'function') {
    // Firestore Timestamp
    return ((dateVal as { toDate: () => Date }).toDate()).toISOString().substring(0, 7);
  }
  if (dateVal instanceof Date) {
    return dateVal.toISOString().substring(0, 7);
  }
  return '';
};

export const calculateTransportMetrics = (
  buses: Bus[],
  breakdowns: Breakdown[],
  fuelExpenses: FuelExpense[],
  maintenances: Maintenance[],
  payments: Payment[],
  students: Student[]
) => {
  // Filtre de base : exclure ce qui est explicitement inactif (suppression logique)
  const validBuses = buses.filter(b => b.isActive !== false);

  const activeBuses = validBuses.filter(b => b.status === 'actif').length;
  const brokenBuses = validBuses.filter(b => b.status === 'en_panne').length;
  
  const currentMonth = new Date().toISOString().substring(0, 7);
  
  const monthlyFuelCost = fuelExpenses
    .filter(f => f.amount !== undefined && f.amount >= 0 && normalizeDateStr(f.date) === currentMonth)
    .reduce((sum, f) => sum + f.amount, 0);
    
  const monthlyMaintCost = maintenances
    .filter(m => m.amount !== undefined && m.amount >= 0 && normalizeDateStr(m.date) === currentMonth)
    .reduce((sum, m) => sum + m.amount, 0);

  const monthlyRepairCost = breakdowns
    .filter(b => b.actualCost !== undefined && b.actualCost >= 0 && normalizeDateStr(b.date) === currentMonth)
    .reduce((sum, b) => sum + (b.actualCost as number), 0);

  const totalExpenses = monthlyFuelCost + monthlyMaintCost + monthlyRepairCost;

  // Payments for transport
  const monthlyTransportRevenue = payments
    .filter(p => 
      p.type === 'transport' && 
      p.amount !== undefined && 
      p.amount >= 0 && 
      (p as unknown as { status?: string }).status !== 'cancelled' && 
      (p as unknown as { status?: string }).status !== 'failed' && 
      (p as unknown as { status?: string }).status !== 'refunded' &&
      normalizeDateStr(p.date) === currentMonth
    )
    .reduce((sum, p) => sum + p.amount, 0);

  const netBalance = monthlyTransportRevenue - totalExpenses;

  // Capacity & usage
  const totalCapacity = validBuses.reduce((sum, b) => {
    const cap = Number(b.capacity);
    return sum + (isNaN(cap) || cap < 0 ? 0 : cap);
  }, 0);
  
  const studentsUsingTransport = Math.max(0, students.filter(s => s.usesTransport === true).length);
  
  let theoreticalGlobalLoad = 0;
  if (totalCapacity > 0 && studentsUsingTransport > 0) {
    const load = (studentsUsingTransport / totalCapacity) * 100;
    theoreticalGlobalLoad = isFinite(load) ? load : 0;
  }

  return {
    activeBuses,
    brokenBuses,
    monthlyFuelCost,
    monthlyMaintCost,
    monthlyRepairCost,
    totalExpenses,
    monthlyTransportRevenue,
    netBalance,
    totalCapacity,
    studentsUsingTransport,
    theoreticalGlobalLoad
  };
};
