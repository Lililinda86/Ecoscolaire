import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TUITION_DEADLINES_2026_2027 } from './tuition-deadline-safety.mjs';

const [beforePath, afterPath] = process.argv.slice(2);
assert.ok(beforePath && afterPath, 'Before and after baseline paths are required.');
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
for (const key of ['projectId', 'schoolId', 'academicYearId', 'academicYearName', 'classFeesSha256',
  'annualAmountsSha256', 'installmentAmountsSha256', 'installmentCountsSha256', 'monetarySnapshotSha256']) {
  assert.equal(after[key], before[key], `${key} changed.`);
}
for (const name of ['students', 'payments', 'studentFinance']) {
  assert.deepEqual(after.collections?.[name], before.collections?.[name], `${name} changed.`);
}
assert.ok(before.tuitionPaymentDeadlines === null
  || JSON.stringify(before.tuitionPaymentDeadlines) === JSON.stringify(TUITION_DEADLINES_2026_2027));
assert.deepEqual(after.tuitionPaymentDeadlines, TUITION_DEADLINES_2026_2027);
process.stdout.write(`${JSON.stringify({ status: 'PASS', classFeesChanged: 0, annualAmountsChanged: 0,
  installmentAmountsChanged: 0, installmentCountsChanged: 0, realStudentsModified: 0,
  realPaymentsModified: 0, realStudentFinanceModified: 0 })}\n`);
