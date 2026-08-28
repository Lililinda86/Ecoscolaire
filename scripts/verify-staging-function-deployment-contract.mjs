import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export const REQUIRED_STAGING_FUNCTIONS = [
  'createStudentSecure',
  'getCollectionQuote',
  'recordCashPayment',
  'reversePayment',
  'createFinancialBenefit',
  'approveFinancialBenefit',
  'closeCashDrawer',
];

export const assertStagingFunctionDeploymentContract = (compiledIndex) => {
  for (const functionName of REQUIRED_STAGING_FUNCTIONS) {
    assert.match(
      compiledIndex,
      new RegExp(`(?:exports\\.${functionName}|"${functionName}")`),
      `Missing required compiled Function export: ${functionName}`,
    );
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const compiledIndex = await readFile('functions/lib/index.js', 'utf8');
  assertStagingFunctionDeploymentContract(compiledIndex);
  console.log(`Verified ${REQUIRED_STAGING_FUNCTIONS.length} required Staging Function exports.`);
}