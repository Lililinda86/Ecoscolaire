const assert = require('node:assert/strict');
const { deterministicMockPreparationAnalyzer, validatePreparationAnalysis } = require('../../functions/lib/pedagogy/preparationAnalyzer.js');
const { canTransitionPreparation, preparationIdForItem, uploadIdForChecksum } = require('../../functions/lib/pedagogy/preparations.js');

async function run() {
  const preparationId = preparationIdForItem('plan__math__d1__s1');
  assert.match(preparationId, /^prep__plan__math__d1__s1__[a-f0-9]{16}$/);
  assert.equal(preparationIdForItem('plan__math__d1__s1'), preparationId);
  assert.equal(uploadIdForChecksum('prep__one', 'b'.repeat(64)), `upload__prep__one__${'b'.repeat(24)}`);
  assert.equal(canTransitionPreparation('expected', 'uploaded'), true);
  assert.equal(canTransitionPreparation('validated', 'uploaded'), false);
  const result = await deterministicMockPreparationAnalyzer.analyze({
    preparationId: 'prep', uploadId: 'upload', fileName: 'preparation.pdf', mimeType: 'application/pdf',
    lessonTitle: null, subjectName: 'Sciences', objective: null
  });
  assert.equal(result.lessonTitle, null);
  assert.equal(result.objective, null);
  assert.deepEqual(result.materials, []);
  await assert.rejects(() => deterministicMockPreparationAnalyzer.analyze({
    preparationId: 'prep', uploadId: 'upload', fileName: 'analysis-fail.jpg', mimeType: 'image/jpeg',
    lessonTitle: null, subjectName: null, objective: null
  }), /MOCK_ANALYSIS_FAILURE/);
  assert.throws(() => validatePreparationAnalysis({
    schemaVersion: 'preparation-analysis-v1', lessonTitle: null, subjectName: null, objective: null,
    prerequisites: [], materials: [], lessonSteps: [], assessment: null, differentiation: null, warnings: [], confidence: -1
  }), /INVALID_ANALYSIS_SCHEMA/);
  console.log('Pedagogy Lot B Functions domain: PASS');
}
run().catch(error => { console.error(error); process.exit(1); });
