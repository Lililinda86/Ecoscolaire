const assert = require('node:assert/strict');
const { resolveItaloTransportFee } = require('../../functions/lib/transportPaymentPolicy');
for (const cycle of ['nursery', 'primary']) {
  for (const zonePk of [14, 15, 18, 33]) {
    assert.equal(resolveItaloTransportFee({ cycle, usesTransport: true, zonePk }).monthlyGrossAmount, 4000);
  }
  for (const zonePk of [34, 35, 36, 42]) {
    assert.equal(resolveItaloTransportFee({ cycle, usesTransport: true, zonePk }).monthlyGrossAmount, 5000);
  }
  for (const zonePk of [13, 43, 'PK18', 18.5, null]) {
    assert.throws(() => resolveItaloTransportFee({ cycle, usesTransport: true, zonePk }), /TRANSPORT_ZONE/);
  }
  assert.equal(resolveItaloTransportFee({ cycle, usesTransport: false, zonePk: 18 }).monthlyGrossAmount, 0);
}
for (const zonePk of [18, 36]) {
  const quote = resolveItaloTransportFee({ cycle: 'secondary', usesTransport: true, zonePk });
  assert.equal(quote.monthlyGrossAmount, 0);
  assert.equal(quote.state, 'FREE_SECONDARY');
}
assert.throws(() => resolveItaloTransportFee({ cycle: 'unknown', usesTransport: true, zonePk: 18 }), /TRANSPORT_CLASS_NOT_SUPPORTED/);
console.log('PASS: paid nursery/primary, free secondary, PK boundaries and disabled transport');
