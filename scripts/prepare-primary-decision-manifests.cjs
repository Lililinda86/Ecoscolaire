/* Offline preparation only. Input is the private, freshly verified documentary
 * plan. This executable has no Firebase dependency and cannot apply decisions. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const digest = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = path.resolve('output/primary-controlled-review');
assert.equal(plan.summary.projectId, 'ecoscolaire-staging');
assert.equal(plan.safe.length, 76); assert.equal(plan.ambiguous.length, 44);
assert(plan.safe.every(m => ['EXACT', 'SAFE_ALIAS'].includes(m.classification) && Object.values(m.checks).every(Boolean)));
const authorizationReference = 'PREPARATION_ONLY_REQUIRES_SEPARATE_OWNER_DECISION';
const safe = plan.safe.map(m => ({ decisionBatchId: 'VERIFIED_SAFE_PRIMARY_MAPPINGS', schoolId: plan.summary.schoolId, academicYearId: plan.summary.academicYearId, decisionType: 'DOCUMENTARY_SUBJECT_CORRESPONDENCE_ONLY', targetId: digest(['owner-subject-review-v1', plan.summary.schoolId, plan.summary.academicYearId, m.classId, m.sourceVersion, m.mappingVersion, m.officialSubject]), decision: 'PROPOSED_APPROVAL_NOT_APPLIED', sourceVersion: m.sourceVersion, mappingVersion: m.mappingVersion, authorizationReference, reason: m.classification + ' verified; distinct owner approval pending' }));
const cases = plan.ambiguous.filter(m => m.resolvedRelations.length);
const documentary = cases.map(m => ({ classId: m.classId, className: m.className, officialDomain: m.officialSubject, source: m.sourceUrl, sourceTitle: m.sourceTitle, sourceVersion: m.sourceVersion, mappingVersion: m.mappingVersion, status: m.unresolvedRelations.length ? 'PARTIALLY_RESOLVED_OWNER_DECISION_REQUIRED' : 'DOCUMENTARILY_RESOLVED', relations: [...m.resolvedRelations].sort((a, b) => a.subjectId.localeCompare(b.subjectId)).map(r => ({ localSubject: r.subjectName, subjectId: r.subjectId, relation: r.type, finalType: r.type, evidence: r.explanation, pdfPages: r.pdfPages, evidenceVersion: r.evidenceVersion })), humanDecision: null }));
assert.equal(documentary.filter(m => m.status === 'DOCUMENTARILY_RESOLVED').length, 8);
assert.equal(documentary.reduce((n, m) => n + m.relations.length, 0), 18);
const summary = { mode: 'OFFLINE_PREPARATION_NO_DATABASE_WRITES', observedAt: plan.summary.observedAt, EXACT: plan.safe.filter(m => m.classification === 'EXACT').length, SAFE_ALIAS: plan.safe.filter(m => m.classification === 'SAFE_ALIAS').length, DOWNGRADED: plan.downgraded.length, VERSION_CONFLICTS: 0, safePrepared: safe.length, safeWritten: 0, documentaryFullyResolved: 8, documentaryPartiallyResolved: 2, documentaryRelations: 18, documentaryWritten: 0, remainingITALOCases: 36, groupedQuestions: 7, openaiCalls: 0, productionTouched: false };
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'VERIFIED_SAFE_PRIMARY_MAPPINGS.json'), JSON.stringify(safe, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'DOCUMENTARILY_RESOLVED_PRIMARY_MAPPINGS.json'), JSON.stringify(documentary, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'PREPARED_MANIFESTS_SUMMARY.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary));
