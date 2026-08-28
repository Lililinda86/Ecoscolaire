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

const ACTIVE_STATES = new Set(['ACTIVE', 'READY']);

const asArray = (value) => Array.isArray(value) ? value : [];

const resourceParts = (name) => {
  const match = String(name || '').match(/^projects\/([^/]+)\/locations\/([^/]+)\/functions\/([^/]+)$/);
  return match ? { project: match[1], region: match[2], logicalName: match[3] } : {};
};

export const normalizeFunctionRecord = (record, generation) => {
  const resource = resourceParts(record.name);
  const logicalName = resource.logicalName || String(record.name || '').split('/').pop() || record.logicalName || '';
  const project = resource.project || record.project || '';
  const region = record.location || record.region || resource.region || '';
  const environment = record.environment || generation;
  const state = String(record.state || record.status || '').toUpperCase();
  return { logicalName, project, region, generation: environment, state };
};

export const normalizeFunctionInventory = ({ gen1 = [], gen2 = [] } = {}) => [
  ...asArray(gen1).map((record) => normalizeFunctionRecord(record, 'GEN_1')),
  ...asArray(gen2).map((record) => normalizeFunctionRecord(record, 'GEN_2')),
].sort((left, right) => [left.logicalName, left.generation, left.region].join('\0')
  .localeCompare([right.logicalName, right.generation, right.region].join('\0')));

export const validateFunctionInventory = (inventory, { expectedProject, expectedRegion = 'us-central1' }) => {
  const normalized = normalizeFunctionInventory(inventory);
  const failures = [];
  for (const requiredName of REQUIRED_STAGING_FUNCTIONS) {
    const candidates = normalized.filter(({ logicalName }) => logicalName === requiredName);
    const valid = candidates.some((entry) => entry.project === expectedProject
      && entry.region === expectedRegion && ACTIVE_STATES.has(entry.state));
    if (!valid) failures.push(requiredName);
  }
  return { normalized, failures, pass: failures.length === 0 };
};

export const formatInventorySummary = (inventory) => inventory
  .map(({ logicalName, generation, region, state }) => `${logicalName || '<unknown>'}\t${generation || '<unknown>'}\t${region || '<unknown>'}\t${state || '<unknown>'}`)
  .join('\n');

const main = async () => {
  const [, , gen1Path, gen2Path, expectedProject, expectedRegion = 'us-central1'] = process.argv;
  assert.ok(gen1Path && gen2Path && expectedProject, 'Inventory arguments are required.');
  const inventory = {
    gen1: JSON.parse(await readFile(gen1Path, 'utf8')),
    gen2: JSON.parse(await readFile(gen2Path, 'utf8')),
  };
  const result = validateFunctionInventory(inventory, { expectedProject, expectedRegion });
  console.log('Function inventory (name generation region state):');
  console.log(formatInventorySummary(result.normalized) || '<empty>');
  if (!result.pass) {
    console.error(`missing required function: ${result.failures.join(', ')}`);
    console.error(`expected project: ${expectedProject}`);
    console.error(`expected region: ${expectedRegion}`);
    console.error('observed function inventory:');
    console.error(formatInventorySummary(result.normalized) || '<empty>');
    process.exitCode = 1;
    return;
  }
  console.log(`Verified ${REQUIRED_STAGING_FUNCTIONS.length} required Functions across Gen1 and Gen2.`);
};

if (process.argv[1]?.endsWith('verify-staging-function-deployment-contract.mjs')) await main();
