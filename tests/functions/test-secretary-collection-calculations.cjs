const assert = require('node:assert/strict');
const {
  calculateBenefitAmount,
  calculateBenefits,
  isTransportPeriod,
  resolveCanonicalClassCycle,
  resolveTuitionGross,
  resolveTransportBenefitGross,
  resolvePaymentSchedule,
  withAcademicYearTuitionDeadlines
} = require('../../functions/lib/secretaryCollections');
const {
  planTransportAllocations,
  resolveItaloTransportFee
} = require('../../functions/lib/transportPaymentPolicy');

const expectBusinessCode = (operation, expected) => assert.throws(operation, error => {
  assert.equal(error.details?.businessCode, expected);
  return true;
});

const classFeeSchool = {
  classFees: {
    CP: { tuition: 120000, t1: 50000, t2: 40000, t3: 30000 },
    CE1: { tuition: 135000, t1: 55000, t2: 45000, t3: 35000 },
    CM2: { tuition: 90000, t1: 50000, t2: 40000, t3: 0 }
  },
  globalFees: { feeT1: 0, feeT2: 0, feeT3: 0 }
};
assert.equal(resolveTuitionGross('T1', { feeT1: 0 }, classFeeSchool, { name: 'CP' }), 50000);
assert.equal(resolveTuitionGross('T2', { feeT2: 999999 }, classFeeSchool, { name: 'CP' }), 40000);
assert.equal(resolveTuitionGross('T3', {}, classFeeSchool, { name: 'CP' }), 30000);
assert.equal(resolveTuitionGross('T1', {}, classFeeSchool, { name: 'CE1' }), 55000,
  'two classes must resolve their own exact class fee');
assert.equal(resolveTuitionGross('T1', { feeT1: 0 }, classFeeSchool, { name: 'CP' }), 50000,
  'an uninitialized zero student projection must not override classFees');
assert.equal(resolveTuitionGross('T1', {}, classFeeSchool, { name: 'CP' }), 50000,
  'a zero legacy global fee must not override classFees');
expectBusinessCode(() => resolveTuitionGross('T3', { feeT3: 70000 }, classFeeSchool, { name: 'CM2' }),
  'GROSS_AMOUNT_NOT_CONFIGURED');
expectBusinessCode(() => resolveTuitionGross('T1', { feeT1: 70000 }, classFeeSchool, { name: 'Missing' }),
  'CLASS_FEE_NOT_CONFIGURED');
expectBusinessCode(() => resolveTuitionGross('T1', {}, {
  classFees: { CP: { t1: -1 } }
}, { name: 'CP' }), 'CLASS_FEE_CORRUPTED');
expectBusinessCode(() => resolveTuitionGross('T1', {}, {
  classFees: { CP: { t1: 12.5 } }
}, { name: 'CP' }), 'CLASS_FEE_CORRUPTED');
assert.equal(resolveTuitionGross('T1', { feeT1: 0 }, { globalFees: { feeT1: 71000 } }, {}), 71000,
  'legacy global fallback remains available only when classFees is absent');

assert.equal(calculateBenefitAmount(70000, 'FIXED_AMOUNT', 10000), 10000);
assert.equal(calculateBenefitAmount(70000, 'PERCENTAGE', 25), 17500);
assert.equal(calculateBenefitAmount(6000, 'FIXED_AMOUNT', 10000), 6000);

const stacked = calculateBenefits(70000, [
  { id: 'scholarship', benefitType: 'SCHOLARSHIP', mode: 'FIXED_AMOUNT', value: 10000, stackable: true },
  { id: 'voucher', benefitType: 'DISCOUNT_VOUCHER', mode: 'PERCENTAGE', value: 10, stackable: true, reference: 'BON-TEST' }
]);
assert.equal(stacked.discountAmount, 17000);
assert.equal(stacked.netExpectedAmount, 53000);
assert.equal(stacked.snapshots.length, 2);

const capped = calculateBenefits(6000, [
  { id: 'one', benefitType: 'SCHOLARSHIP', mode: 'FIXED_AMOUNT', value: 5000, stackable: true },
  { id: 'two', benefitType: 'DISCOUNT_VOUCHER', mode: 'FIXED_AMOUNT', value: 5000, stackable: true }
]);
assert.equal(capped.discountAmount, 6000);
assert.equal(capped.netExpectedAmount, 0);

assert.throws(() => calculateBenefits(70000, [
  { id: 'one', benefitType: 'SCHOLARSHIP', mode: 'FIXED_AMOUNT', value: 1000, stackable: false },
  { id: 'two', benefitType: 'DISCOUNT_VOUCHER', mode: 'FIXED_AMOUNT', value: 1000, stackable: true }
]), /non cumulables/i);

assert.equal(isTransportPeriod('2026-09'), true);
assert.equal(isTransportPeriod('2026-13'), false);
assert.equal(isTransportPeriod('Septembre'), false);

for (const name of ['6e', 'Form 1', '5e', 'Form 2', '4e', 'Form 3', '3e', 'Form 4']) {
  assert.equal(resolveCanonicalClassCycle({ name }), 'secondary', `${name} must resolve to secondary`);
}
assert.equal(resolveCanonicalClassCycle({ name: 'CP', level: 'primary' }), 'primary');
assert.equal(resolveCanonicalClassCycle({ name: '6e', cycle: 'primary' }), 'primary',
  'structured cycle must take precedence over the display name');
assert.equal(resolveCanonicalClassCycle({ name: 'CP', catalogLevelId: 'fr-secondary-6e' }), 'secondary',
  'catalogLevelId must be authoritative when cycle and level are absent');
const transportFee = zonePk => resolveItaloTransportFee({
  cycle: 'primary', usesTransport: true, zonePk
}).monthlyGrossAmount;
for (const zonePk of [14, 20, 33]) assert.equal(transportFee(zonePk), 4000, `PK${zonePk}`);
for (const zonePk of [34, 40, 42]) assert.equal(transportFee(zonePk), 5000, `PK${zonePk}`);
assert.deepEqual(resolveItaloTransportFee({ cycle: 'secondary', usesTransport: true, zonePk: 20 }), {
  state: 'FREE_SECONDARY', zonePk: null, monthlyGrossAmount: 0
});
assert.deepEqual(resolveItaloTransportFee({ cycle: 'primary', usesTransport: false, zonePk: 20 }), {
  state: 'NOT_SUBSCRIBED', zonePk: null, monthlyGrossAmount: 0
});
for (const zonePk of [13, 43, 14.5, 'PK20', null]) {
  assert.throws(() => resolveItaloTransportFee({ cycle: 'primary', usesTransport: true, zonePk }),
    /TRANSPORT_ZONE/);
}

const canonicalBenefitGross = (zonePk, overrides = {}) => resolveTransportBenefitGross({
  student: { usesTransport: true }, privateData: { transportZonePk: zonePk },
  classData: { cycle: 'primary' }, finance: { transportMonthlyFee: 99000 },
  school: { transportPolicy: { feePolicyId: 'ITALO_PK_2026' }, globalFees: { feeTransport: 88000 } },
  bus: { monthlyFee: 77000 }, ...overrides
});
for (const zonePk of [14, 20, 33]) assert.equal(canonicalBenefitGross(zonePk), 4000, `benefit PK${zonePk}`);
for (const zonePk of [34, 42]) assert.equal(canonicalBenefitGross(zonePk), 5000, `benefit PK${zonePk}`);
assert.equal(calculateBenefitAmount(canonicalBenefitGross(20), 'FIXED_AMOUNT', 1000), 1000);
assert.equal(canonicalBenefitGross(20) - calculateBenefitAmount(canonicalBenefitGross(20), 'FIXED_AMOUNT', 1000), 3000);
assert.equal(calculateBenefitAmount(canonicalBenefitGross(34), 'PERCENTAGE', 50), 2500);
assert.equal(canonicalBenefitGross(34) - calculateBenefitAmount(canonicalBenefitGross(34), 'PERCENTAGE', 50), 2500);
for (const zonePk of [undefined, 13, 43]) {
  assert.throws(() => canonicalBenefitGross(zonePk), /PK transport|périmètre tarifaire/);
}
assert.throws(() => canonicalBenefitGross(20, {
  classData: { cycle: 'secondary' }
}), /TRANSPORT GRATUIT/);
assert.throws(() => canonicalBenefitGross(20, {
  student: { usesTransport: false }
}), /n’utilise pas le transport/);
assert.equal(resolveTransportBenefitGross({
  student: {}, privateData: {}, classData: {}, finance: { transportMonthlyFee: 3500 },
  school: {}, bus: null
}), 3500, 'legacy fallback remains available only without canonical ITALO policy');

for (const [mode, value] of [
  ['FIXED_AMOUNT', 0], ['FIXED_AMOUNT', -1], ['PERCENTAGE', 0], ['PERCENTAGE', 101],
  ['FIXED_AMOUNT', Number.NaN], ['FIXED_AMOUNT', Number.POSITIVE_INFINITY]
]) {
  assert.throws(() => calculateBenefitAmount(4000, mode, value));
}
assert.equal(calculateBenefitAmount(4000, 'FIXED_AMOUNT', 5000), 4000,
  'fixed benefit larger than gross follows the existing capped contract');

assert.deepEqual(planTransportAllocations([
  { period: '2026-11', remainingBalance: 4000 },
  { period: '2026-09', remainingBalance: 4000 },
  { period: '2026-10', remainingBalance: 4000 }
], 10000), {
  allocations: [
    { kind: 'INSTALLMENT', period: '2026-09', amount: 4000 },
    { kind: 'INSTALLMENT', period: '2026-10', amount: 4000 },
    { kind: 'INSTALLMENT', period: '2026-11', amount: 2000 }
  ],
  allocatedAmount: 10000,
  creditAmount: 0
});
assert.deepEqual(planTransportAllocations([
  { period: '2026-09', remainingBalance: 5000 },
  { period: '2026-10', remainingBalance: 5000 }
], 10000).allocations, [
  { kind: 'INSTALLMENT', period: '2026-09', amount: 5000 },
  { kind: 'INSTALLMENT', period: '2026-10', amount: 5000 }
]);
assert.deepEqual(planTransportAllocations([
  { period: '2026-09', remainingBalance: 5000 }
], 2000), {
  allocations: [{ kind: 'INSTALLMENT', period: '2026-09', amount: 2000 }],
  allocatedAmount: 2000,
  creditAmount: 0
});
assert.deepEqual(planTransportAllocations([
  { period: '2026-09', remainingBalance: 4000 },
  { period: '2026-10', remainingBalance: 4000 }
], 10000), {
  allocations: [
    { kind: 'INSTALLMENT', period: '2026-09', amount: 4000 },
    { kind: 'INSTALLMENT', period: '2026-10', amount: 4000 },
    { kind: 'CREDIT', period: null, amount: 2000 }
  ],
  allocatedAmount: 8000,
  creditAmount: 2000
});

const deadlineSchool = {
  paymentDeadlines: {
    registrationFee: '2026-09-15',
    tuition: { T1: '2026-09-30', T2: '2027-01-31', T3: '2027-04-30' },
    transport: { '2026-09': '2026-09-10' }
  }
};
const yearScopedSchool = withAcademicYearTuitionDeadlines(deadlineSchool, {
  id: 'year-2026-2027', schoolId: 'school-a', name: '2026-2027',
  tuitionPaymentDeadlines: { T1: '2026-10-05', T2: '2026-12-05', T3: '2027-02-05' }
});
assert.deepEqual(yearScopedSchool.paymentDeadlines.tuition, {
  T1: '2026-10-05', T2: '2026-12-05', T3: '2027-02-05'
});
assert.deepEqual(yearScopedSchool.paymentDeadlines.transport, deadlineSchool.paymentDeadlines.transport,
  'year-scoped tuition deadlines must not alter transport deadlines');
const schedule = overrides => resolvePaymentSchedule({
  school: deadlineSchool,
  moratoriums: [],
  type: 'tuition',
  installment: 'T1',
  period: null,
  today: '2026-09-01',
  remainingBalance: 40000,
  ...overrides
});

assert.deepEqual(schedule({ school: {} }), {
  originalDueDate: null, effectiveDueDate: null, nextDueDate: null,
  moratoriumStatus: 'NONE', moratoriumId: null, overdue: false, dueStatus: 'UNCONFIGURED'
});
assert.equal(schedule({}).dueStatus, 'NOT_DUE', 'an installment before its due date is not overdue');
assert.equal(schedule({ today: '2026-10-01' }).dueStatus, 'OVERDUE');
assert.equal(schedule({ today: '2026-10-01' }).overdue, true);
const deferred = schedule({
  today: '2026-10-01',
  moratoriums: [{
    id: 'moratorium-test', status: 'approved', paymentType: 'tuition', installment: 'T1',
    effectiveDueDate: '2026-11-30', reason: 'Report temporaire TEST'
  }]
});
assert.equal(deferred.originalDueDate, '2026-09-30');
assert.equal(deferred.effectiveDueDate, '2026-11-30');
assert.equal(deferred.moratoriumStatus, 'ACTIVE');
assert.equal(deferred.dueStatus, 'NOT_DUE');
assert.equal(deferred.remainingBalance, undefined, 'schedule logic must not mutate or discount the debt');
assert.equal(schedule({ today: '2026-12-01', moratoriums: [{
  id: 'moratorium-test', status: 'approved', paymentType: 'tuition', installment: 'T1',
  effectiveDueDate: '2026-11-30', reason: 'Report temporaire TEST'
}] }).moratoriumStatus, 'EXPIRED');
assert.equal(schedule({ remainingBalance: 0 }).dueStatus, 'PAID');
assert.equal(schedule({ remainingBalance: 0 }).nextDueDate, null);

console.log('secretary collection calculation tests passed');
