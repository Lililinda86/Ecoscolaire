const assert = require('node:assert/strict');
const { gradingTestContracts } = require('../../functions/lib/academic/manageGrades');

const expectBusinessCode = (fn, businessCode) => assert.throws(fn, error => {
  assert.equal(error?.details?.businessCode, businessCode);
  return true;
});

const maxScore = 20;
const zero = gradingTestContracts.parseGradeRows([{ studentId: 'student-a', resultStatus: 'scored', score: 0, expectedVersion: 0 }], maxScore);
assert.equal(zero[0].score, 0);
assert.equal(zero[0].resultStatus, 'scored');

const maximum = gradingTestContracts.parseGradeRows([{ studentId: 'student-a', resultStatus: 'scored', score: 20, expectedVersion: 0 }], maxScore);
assert.equal(maximum[0].score, 20);

for (const score of [-1, 20.01, Number.NaN, Number.POSITIVE_INFINITY]) {
  expectBusinessCode(() => gradingTestContracts.parseGradeRows([{ studentId: 'student-a', resultStatus: 'scored', score, expectedVersion: 0 }], maxScore), 'INVALID_SCORE');
}

for (const resultStatus of ['absent', 'excused', 'notSubmitted']) {
  const rows = gradingTestContracts.parseGradeRows([{ studentId: 'student-a', resultStatus, expectedVersion: 0 }], maxScore);
  assert.equal(rows[0].resultStatus, resultStatus);
  assert.equal('score' in rows[0], false);
  expectBusinessCode(() => gradingTestContracts.parseGradeRows([{ studentId: 'student-a', resultStatus, score: 0, expectedVersion: 0 }], maxScore), 'SCORE_STATUS_CONFLICT');
}

expectBusinessCode(() => gradingTestContracts.parseGradeRows([
  { studentId: 'student-a', resultStatus: 'scored', score: 10 },
  { studentId: 'student-a', resultStatus: 'scored', score: 11 },
], maxScore), 'DUPLICATE_STUDENT');

const gradeA = gradingTestContracts.canonicalGradeId('evaluation-a', 'student-a');
assert.equal(gradeA, gradingTestContracts.canonicalGradeId('evaluation-a', 'student-a'));
assert.notEqual(gradeA, gradingTestContracts.canonicalGradeId('evaluation-a', 'student-b'));
assert.notEqual(gradeA, gradingTestContracts.canonicalGradeId('evaluation-b', 'student-a'));
assert.match(gradeA, /^gr_[A-Za-z0-9_-]{43}$/);

const rowsA = [
  { studentId: 'student-a', resultStatus: 'scored', score: 10, expectedVersion: 0 },
  { studentId: 'student-b', resultStatus: 'absent', expectedVersion: 0 },
];
assert.equal(
  gradingTestContracts.requestHash('evaluation-a', rowsA),
  gradingTestContracts.requestHash('evaluation-a', [...rowsA].reverse()),
);

console.log('ITALO-W2-04 GRADES CONTRACTS PASS');
