const assert = require('node:assert/strict');
const { reportCardTestContracts } = require('../../functions/lib/academic/manageReportCard');

const ids = ['school-a', 'year-2026', 'term-1', 'class-6', 'student-a'];
const canonical = reportCardTestContracts.canonicalReportCardId(...ids);
assert.equal(canonical, reportCardTestContracts.canonicalReportCardId(...ids));
assert.match(canonical, /^rc_[A-Za-z0-9_-]{43}$/);
assert.notEqual(canonical, reportCardTestContracts.canonicalReportCardId(...ids.slice(0, 4), 'student-b'));
assert.notEqual(canonical, reportCardTestContracts.canonicalReportCardId('school-b', ...ids.slice(1)));

const snapshotA = {
  programRevisionId: 'revision-1',
  subjects: [{ id: 'math', average: 12.5 }, { id: 'english', average: 14 }],
  policy: { ranking: 'DEFERRED', mention: 'DEFERRED' },
};
const snapshotB = structuredClone(snapshotA);
assert.equal(reportCardTestContracts.sha256(snapshotA), reportCardTestContracts.sha256(snapshotB));
snapshotB.subjects[0].average = 13;
assert.notEqual(reportCardTestContracts.sha256(snapshotA), reportCardTestContracts.sha256(snapshotB));

console.log('ITALO-W2-05 REPORT CARD CONTRACTS PASS');
