import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { calculateNetExpenseTotal } from './expenseLedger';

type Row = Record<string, unknown>;

export interface GovernanceSourceData {
  schoolId: string;
  school: Row;
  classes: Row[];
  students: Row[];
  attendance: Row[];
  payments: Row[];
  expenses: Row[];
  buses: Row[];
  busRoutes: Row[];
  breakdowns: Row[];
  fuelExpenses: Row[];
  maintenances: Row[];
  inventory: Row[];
  grades: Row[];
  classPrograms: Row[];
  cashClosures: Row[];
}

const numberValue = (...values: unknown[]): number => {
  const value = values.find(candidate => typeof candidate === 'number' && Number.isFinite(candidate));
  return typeof value === 'number' ? value : 0;
};

const stringValue = (...values: unknown[]): string => {
  const value = values.find(candidate => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof value === 'string' ? value.trim() : '';
};

const isActive = (row: Row): boolean => row.isActive !== false && row.active !== false && row.status !== 'inactive';

const isSuccessfulPayment = (row: Row): boolean => {
  const status = stringValue(row.status).toLowerCase();
  return !['pending', 'failed', 'cancelled', 'canceled', 'refunded', 'reversed'].includes(status);
};

export const buildBoardViewerGovernanceSummary = (source: GovernanceSourceData) => {
  const activeStudents = source.students.filter(student =>
    isActive(student) && !['departed', 'excluded', 'inactive'].includes(stringValue(student.schoolingStatus).toLowerCase())
  );
  const classNames = new Map(source.classes.map(row => [
    stringValue(row.id),
    stringValue(row.name, row.displayName) || 'Classe non renseignée'
  ]));
  const studentsByClass = new Map<string, number>();
  activeStudents.forEach(student => {
    const className = classNames.get(stringValue(student.classId)) || 'Classe non renseignée';
    studentsByClass.set(className, (studentsByClass.get(className) || 0) + 1);
  });

  const attendanceTotals = source.attendance.reduce<{
    records: number;
    present: number;
    absent: number;
    late: number;
  }>((totals, row) => {
    const status = stringValue(row.status).toLowerCase();
    if (['present', 'présent', 'presente', 'présente'].includes(status)) totals.present += 1;
    if (['absent', 'absente'].includes(status)) totals.absent += 1;
    if (['late', 'retard', 'en retard'].includes(status)) totals.late += 1;
    totals.records += 1;
    return totals;
  }, { records: 0, present: 0, absent: 0, late: 0 });
  const attendanceDenominator = attendanceTotals.present + attendanceTotals.absent + attendanceTotals.late;

  const collected = source.payments
    .filter(isSuccessfulPayment)
    .reduce((sum, row) => sum + numberValue(row.amount, row.paidAmount, row.totalAmount), 0);
  const expenses = calculateNetExpenseTotal(source.expenses);

  const publishedGrades = source.grades.filter(row =>
    row.published === true || ['published', 'validated'].includes(stringValue(row.status).toLowerCase())
  );
  const normalizedGrades = publishedGrades
    .map(row => {
      const score = numberValue(row.score, row.grade, row.value);
      const maximum = numberValue(row.maxScore, row.maximum, row.outOf) || 20;
      return maximum > 0 ? (score / maximum) * 20 : 0;
    })
    .filter(value => Number.isFinite(value));

  const latestClosure = [...source.cashClosures]
    .sort((left, right) => stringValue(right.closedAt, right.date).localeCompare(stringValue(left.closedAt, left.date)))[0];

  return {
    school: {
      id: source.schoolId,
      name: stringValue(source.school.name, source.school.displayName),
      academicYear: stringValue(source.school.academicYear, source.school.currentAcademicYear),
      activeAcademicYearId: stringValue(source.school.activeAcademicYearId)
    },
    students: {
      total: source.students.length,
      active: activeStudents.length,
      byClass: [...studentsByClass.entries()]
        .map(([className, count]) => ({ className, count }))
        .sort((left, right) => left.className.localeCompare(right.className))
    },
    attendance: {
      ...attendanceTotals,
      rate: attendanceDenominator > 0
        ? Math.round((attendanceTotals.present / attendanceDenominator) * 1000) / 10
        : 0
    },
    finance: {
      collected,
      expenses,
      netCash: collected - expenses,
      latestClosure: latestClosure ? {
        date: stringValue(latestClosure.closedAt, latestClosure.date),
        theoreticalBalance: numberValue(latestClosure.theoreticalBalance, latestClosure.expectedBalance),
        discrepancy: numberValue(latestClosure.discrepancy, latestClosure.difference)
      } : null
    },
    transport: {
      activeBuses: source.buses.filter(isActive).length,
      activeRoutes: source.busRoutes.filter(isActive).length,
      openBreakdowns: source.breakdowns.filter(row =>
        !['resolved', 'closed'].includes(stringValue(row.status).toLowerCase())
      ).length,
      fuelCost: source.fuelExpenses.reduce((sum, row) => sum + numberValue(row.amount, row.cost), 0),
      maintenanceCost: source.maintenances.reduce((sum, row) => sum + numberValue(row.amount, row.cost, row.actualCost), 0),
      transportedStudents: activeStudents.filter(row => row.usesTransport === true || row.transportEnabled === true).length
    },
    inventory: {
      itemTypes: source.inventory.length,
      totalQuantity: source.inventory.reduce((sum, row) => sum + numberValue(row.quantity, row.stock), 0),
      lowStockItems: source.inventory.filter(row => {
        const threshold = numberValue(row.minimumStock, row.minQuantity, row.reorderLevel);
        return threshold > 0 && numberValue(row.quantity, row.stock) <= threshold;
      }).length
    },
    academics: {
      publishedGrades: publishedGrades.length,
      averageOutOf20: normalizedGrades.length > 0
        ? Math.round((normalizedGrades.reduce((sum, value) => sum + value, 0) / normalizedGrades.length) * 10) / 10
        : null,
      publishedPrograms: source.classPrograms.filter(row =>
        row.published === true || stringValue(row.status).toLowerCase() === 'published'
      ).length,
      draftPrograms: source.classPrograms.filter(row =>
        row.published !== true && stringValue(row.status).toLowerCase() !== 'published'
      ).length
    }
  };
};

const schoolRows = async (collectionName: string, schoolId: string): Promise<Row[]> => {
  const snapshot = await admin.firestore().collection(collectionName).where('schoolId', '==', schoolId).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
};

export const getBoardViewerGovernanceSummary = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const userSnapshot = await admin.firestore().collection('users').doc(context.auth.uid).get();
  const user = userSnapshot.data();
  if (!userSnapshot.exists || !user || user.role !== 'boardViewer') {
    throw new functions.https.HttpsError('permission-denied', 'BoardViewer role required.');
  }
  if (user.active === false || user.isActive === false || !user.schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Active school assignment required.');
  }

  const schoolId = String(user.schoolId);
  const schoolSnapshot = await admin.firestore().collection('schools').doc(schoolId).get();
  if (!schoolSnapshot.exists) {
    throw new functions.https.HttpsError('not-found', 'Assigned school was not found.');
  }

  const collectionNames = [
    'classes', 'students', 'attendance', 'payments', 'expenses', 'buses', 'busRoutes',
    'breakdowns', 'fuelExpenses', 'maintenances', 'inventory', 'grades', 'classPrograms', 'cashClosures'
  ] as const;
  const rows = await Promise.all(collectionNames.map(name => schoolRows(name, schoolId)));
  const values = Object.fromEntries(collectionNames.map((name, index) => [name, rows[index]])) as
    Omit<GovernanceSourceData, 'schoolId' | 'school'>;

  return {
    ...buildBoardViewerGovernanceSummary({
      schoolId,
      school: schoolSnapshot.data() || {},
      ...values
    }),
    generatedAt: new Date().toISOString()
  };
});
