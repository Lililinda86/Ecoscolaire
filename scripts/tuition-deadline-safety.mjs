import assert from 'node:assert/strict';
import crypto from 'node:crypto';

export const TUITION_DEADLINES_2026_2027 = Object.freeze({
  T1: '2026-10-05',
  T2: '2026-12-05',
  T3: '2027-02-05',
});

export const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};

export const digest = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');

const installmentKeys = ['t1', 't2', 't3'];

export const buildTuitionAmountFingerprint = (classFees = {}) => {
  assert.ok(classFees && typeof classFees === 'object' && !Array.isArray(classFees), 'classFees must be an object.');
  const installmentAmounts = {};
  const annualAmounts = {};
  const installmentCounts = {};

  for (const className of Object.keys(classFees).sort()) {
    const fees = classFees[className] || {};
    const configured = {};
    for (const key of installmentKeys) {
      if (fees[key] === undefined) continue;
      assert.ok(Number.isSafeInteger(fees[key]) && fees[key] >= 0,
        `classFees.${className}.${key} must be a non-negative integer.`);
      configured[key] = fees[key];
    }
    installmentAmounts[className] = configured;
    const payable = Object.values(configured).filter((amount) => amount > 0);
    annualAmounts[className] = payable.reduce((sum, amount) => sum + amount, 0);
    installmentCounts[className] = payable.length;
  }

  return {
    classFeesSha256: digest(classFees),
    annualAmountsSha256: digest(annualAmounts),
    installmentAmountsSha256: digest(installmentAmounts),
    installmentCountsSha256: digest(installmentCounts),
    annualAmounts,
    installmentAmounts,
    installmentCounts,
  };
};

export const assertTuitionAmountFingerprint = (actual, expected) => {
  for (const key of [
    'classFeesSha256',
    'annualAmountsSha256',
    'installmentAmountsSha256',
    'installmentCountsSha256',
  ]) {
    assert.ok(expected?.[key], `Expected ${key} is required.`);
    assert.equal(actual?.[key], expected[key], `${key} changed from the approved baseline.`);
  }
};
