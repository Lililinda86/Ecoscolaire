const assert = require('node:assert/strict');
const {
  calculateBenefitAmount,
  calculateBenefits,
  isTransportPeriod
} = require('../../functions/lib/secretaryCollections');

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

console.log('secretary collection calculation tests passed');
