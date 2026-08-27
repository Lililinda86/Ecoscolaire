const assert = require('node:assert/strict');
const {
  planTransportAllocations
} = require('../../functions/lib/transportPaymentPolicy');

const periods = [
  '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'
];

const assertAllocation = ({ label, balances, paymentAmount, expectedAmounts,
  expectedCredit = 0 }) => {
  const installments = balances.map((remainingBalance, index) => ({
    period: periods[index], remainingBalance
  })).reverse();
  const plan = planTransportAllocations(installments, paymentAmount);
  const expectedAllocations = expectedAmounts.map((amount, index) => ({
    kind: 'INSTALLMENT', period: periods[index], amount
  }));

  if (expectedCredit > 0) {
    expectedAllocations.push({ kind: 'CREDIT', period: null, amount: expectedCredit });
  }

  assert.deepEqual(plan.allocations, expectedAllocations, label);
  assert.equal(plan.allocatedAmount,
    expectedAmounts.reduce((total, amount) => total + amount, 0), `${label}: allocated amount`);
  assert.equal(plan.creditAmount, expectedCredit, `${label}: transport credit`);
  assert.equal(plan.allocations.reduce((total, allocation) => total + allocation.amount, 0),
    paymentAmount, `${label}: allocations plus transport credit must equal payment amount`);
  assert.equal(plan.allocatedAmount + plan.creditAmount, paymentAmount,
    `${label}: payment amount must be conserved`);
};

for (const testCase of [
  { label: '4000/month - payment 7000', balances: [4000, 4000, 4000, 4000, 4000],
    paymentAmount: 7000, expectedAmounts: [4000, 3000] },
  { label: '4000/month - payment 10000', balances: [4000, 4000, 4000, 4000, 4000],
    paymentAmount: 10000, expectedAmounts: [4000, 4000, 2000] },
  { label: '4000/month - payment 15000', balances: [4000, 4000, 4000, 4000, 4000],
    paymentAmount: 15000, expectedAmounts: [4000, 4000, 4000, 3000] },
  { label: '4000/month - payment 20000', balances: [4000, 4000, 4000, 4000, 4000],
    paymentAmount: 20000, expectedAmounts: [4000, 4000, 4000, 4000, 4000] },
  { label: '5000/month - payment 7000', balances: [5000, 5000, 5000, 5000],
    paymentAmount: 7000, expectedAmounts: [5000, 2000] },
  { label: '5000/month - payment 10000', balances: [5000, 5000, 5000, 5000],
    paymentAmount: 10000, expectedAmounts: [5000, 5000] },
  { label: '5000/month - payment 15000', balances: [5000, 5000, 5000, 5000],
    paymentAmount: 15000, expectedAmounts: [5000, 5000, 5000] },
  { label: '5000/month - payment 20000', balances: [5000, 5000, 5000, 5000],
    paymentAmount: 20000, expectedAmounts: [5000, 5000, 5000, 5000] },
  { label: 'payment below one installment', balances: [4000, 4000],
    paymentAmount: 1500, expectedAmounts: [1500] },
  { label: 'fixed discount adjusted balances', balances: [3000, 3000, 3000],
    paymentAmount: 7000, expectedAmounts: [3000, 3000, 1000] },
  { label: 'percentage discount adjusted balances', balances: [2500, 2500, 2500],
    paymentAmount: 7000, expectedAmounts: [2500, 2500, 2000] },
  { label: 'excess converted to transport credit', balances: [3000, 3000],
    paymentAmount: 7000, expectedAmounts: [3000, 3000], expectedCredit: 1000 }
]) {
  assertAllocation(testCase);
}

console.log('transport payment amount allocation tests passed (12/12)');
