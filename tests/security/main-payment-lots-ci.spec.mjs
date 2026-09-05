import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/ci.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

const lot1Tests = [
  'tests/unit/PaymentsStudentClassDisplay.spec.tsx',
  'tests/unit/PaymentsTuitionRecovery.spec.tsx',
];

const lot2Tests = [
  'tests/unit/StudentsTransportPersistence.spec.ts',
  'tests/unit/studentPrivacy.spec.ts',
  'tests/unit/studentPrivacyPersistence.spec.ts',
  'tests/unit/studentTransportEnrollment.spec.ts',
];

const lot3Tests = [
  'tests/unit/PaymentsTransportContext.spec.tsx',
  'tests/unit/ReceiptHistoryResponsive.spec.tsx',
  'tests/unit/TransportReceiptContext.spec.ts',
  'tests/unit/paymentReceipt.spec.ts',
  'tests/unit/transportPaymentPreview.spec.ts',
];

const expectedLotTests = [...lot1Tests, ...lot2Tests, ...lot3Tests];
const historicalTests = [
  'tests/unit/FinancialBenefitsPanel.spec.tsx',
  'tests/unit/paymentReceipt.spec.ts',
  'tests/unit/studentAccountReceipt.spec.ts',
  'tests/unit/StudentAccountCollection.spec.tsx',
  'tests/unit/expenseLedger.spec.ts',
  'tests/unit/reportCardCalculations.spec.ts',
  'tests/unit/reportCardPdf.spec.ts',
];

const getStep = (name) => {
  const lines = workflow.split(/\r?\n/);
  const marker = `- name: ${name}`;
  const start = lines.findIndex(line => line.trim() === marker);
  assert.notEqual(start, -1, `CI workflow must retain the ${name} step.`);

  const indent = lines[start].match(/^\s*/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent && (trimmed.startsWith('- name: ') || /^[a-zA-Z0-9_-]+:$/.test(trimmed))) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
};

const listUnitTestPaths = step => (
  [...step.matchAll(/tests\/unit\/[^\s]+\.spec\.tsx?/g)].map(match => match[0])
);

test('Frontend CI retains the historical secretary collections tests', () => {
  const step = getStep('Secretary collections UI tests');
  assert.match(step, /run:\s+npx vitest run/);
  assert.deepEqual(listUnitTestPaths(step), historicalTests);
});

test('Frontend CI runs every required Lot 1 UI suite explicitly', () => {
  const step = getStep('Run secretary payment Lots 1-3 UI tests');
  for (const testPath of lot1Tests) {
    assert.ok(step.includes(testPath), `${testPath} must run in Frontend CI.`);
  }
});

test('Frontend CI runs every required Lot 2 UI suite explicitly', () => {
  const step = getStep('Run secretary payment Lots 1-3 UI tests');
  for (const testPath of lot2Tests) {
    assert.ok(step.includes(testPath), `${testPath} must run in Frontend CI.`);
  }
});

test('Frontend CI runs every required Lot 3 UI suite explicitly', () => {
  const step = getStep('Run secretary payment Lots 1-3 UI tests');
  for (const testPath of lot3Tests) {
    assert.ok(step.includes(testPath), `${testPath} must run in Frontend CI.`);
  }
});

test('Every explicitly wired Lots 1-3 test file exists', () => {
  for (const testPath of expectedLotTests) {
    const testUrl = new URL(`../../${testPath}`, import.meta.url);
    assert.ok(fs.existsSync(testUrl), `${testPath} must exist in the repository.`);
  }
});

test('Lots 1-3 UI step uses the exact explicit suite list and remains fail-closed', () => {
  const step = getStep('Run secretary payment Lots 1-3 UI tests');
  assert.match(step, /run:\s*>-\s*\n\s+npx vitest run/);
  assert.deepEqual(listUnitTestPaths(step), expectedLotTests);
  assert.doesNotMatch(step, /continue-on-error\s*:\s*true/);
  assert.doesNotMatch(step, /\|\|\s*true/);
  assert.doesNotMatch(step, /\btests\/functions\//);
});

test('Secret Guard executes the Lots 1-3 CI wiring contract', () => {
  const step = getStep('Validate secretary payment Lots 1-3 CI contract');
  assert.match(step, /node --test tests\/security\/main-payment-lots-ci\.spec\.mjs/);
  assert.doesNotMatch(step, /continue-on-error\s*:\s*true/);
  assert.doesNotMatch(step, /\|\|\s*true/);
});
