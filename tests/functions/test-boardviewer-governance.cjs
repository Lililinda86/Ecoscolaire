const assert = require('node:assert/strict');
const { buildBoardViewerGovernanceSummary } = require('../../functions/lib/boardViewerGovernance.js');

const summary = buildBoardViewerGovernanceSummary({
  schoolId: 'school-a',
  school: { name: 'School A', activeAcademicYearId: 'year-a' },
  classes: [{ id: 'class-a', name: 'Class A' }],
  students: [
    { id: 'student-secret-id', schoolId: 'school-a', classId: 'class-a', name: 'Private Student', active: true },
    { id: 'departed-id', schoolId: 'school-a', classId: 'class-a', name: 'Departed Student', schoolingStatus: 'departed' }
  ],
  attendance: [
    { id: 'legacy-random', schoolId: 'school-a', studentId: 'student-secret-id', date: '2026-08-21', status: 'absent' },
    { id: 'att-canonical', schoolId: 'school-a', studentId: 'student-secret-id', date: '2026-08-21', status: 'present', canonicalAttendance: true, version: 2 },
  ],
  payments: [{ studentId: 'student-secret-id', receiptId: 'private-receipt', amount: 12000, status: 'completed' }],
  expenses: [
    { vendor: 'Private Vendor', amount: 2000, status: 'POSTED' },
    { vendor: 'Private Vendor', amount: -2000, status: 'REVERSED', originalExpenseId: 'expense-a' },
  ],
  buses: [{ active: true }],
  busRoutes: [{ isActive: true }],
  breakdowns: [{ status: 'open' }],
  fuelExpenses: [{ amount: 500 }],
  maintenances: [{ cost: 700 }],
  inventory: [{ name: 'Private Item', quantity: 2, minimumStock: 3 }],
  grades: [{ studentId: 'student-secret-id', score: 15, maxScore: 20, status: 'published' }],
  classPrograms: [{ status: 'published' }, { status: 'draft' }],
  cashClosures: [{ date: '2026-08-15', theoreticalBalance: 10000, discrepancy: 0 }]
});

assert.equal(summary.students.total, 2);
assert.equal(summary.students.active, 1);
assert.deepEqual(summary.students.byClass, [{ className: 'Class A', count: 1 }]);
assert.equal(summary.attendance.rate, 100);
assert.equal(summary.attendance.records, 1);
assert.equal(summary.finance.collected, 12000);
assert.equal(summary.finance.expenses, 0);
assert.equal(summary.finance.netCash, 12000);
assert.equal(summary.inventory.lowStockItems, 1);
assert.equal(summary.academics.averageOutOf20, 15);

const serialized = JSON.stringify(summary);
for (const forbidden of ['student-secret-id', 'Private Student', 'private-receipt', 'Private Vendor', 'Private Item']) {
  assert.equal(serialized.includes(forbidden), false, `aggregate response leaked ${forbidden}`);
}

console.log('BoardViewer governance aggregation: PASS');
