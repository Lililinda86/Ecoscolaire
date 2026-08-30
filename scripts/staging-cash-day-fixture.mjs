import assert from 'node:assert/strict';

export const exactCashDayId = (schoolId, date) => {
  assert.match(schoolId, /^[A-Za-z0-9_-]+$/, 'Fixture schoolId must be an exact document ID.');
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/, 'Fixture cash date must use YYYY-MM-DD.');
  return `${schoolId}__${date}`;
};

const assertExactDocument = ({ data, schoolId, date, label }) => {
  assert.equal(data.schoolId, schoolId, `${label} belongs to another school.`);
  assert.equal(data.date, date, `${label} belongs to another cash date.`);
};

const assertRunMarker = ({ data, testRunId, label, allowUnmarked = false }) => {
  const marker = data.testRunId;
  if (marker === undefined && allowUnmarked) return;
  assert.equal(data.testFixture, true, `${label} is not a test fixture.`);
  assert.equal(marker, testRunId, `${label} belongs to another test run.`);
};

export const assertFixtureCashDayOpen = async ({ db, schoolId, date }) => {
  const id = exactCashDayId(schoolId, date);
  const [closure, ledger] = await Promise.all([
    db.collection('cashClosures').doc(id).get(),
    db.collection('cashLedgerDays').doc(id).get(),
  ]);
  assert.equal(closure.exists, false, `Fixture cash closure ${id} already exists.`);
  assert.equal(ledger.exists, false, `Fixture cash ledger day ${id} already exists.`);
  return id;
};

export const assertFixtureCashLedgerOpen = async ({
  db, schoolId, date, testRunId, expectedCash,
}) => {
  const id = exactCashDayId(schoolId, date);
  const [school, closure, ledger] = await Promise.all([
    db.collection('schools').doc(schoolId).get(),
    db.collection('cashClosures').doc(id).get(),
    db.collection('cashLedgerDays').doc(id).get(),
  ]);
  assert.equal(school.exists, true, `Fixture school ${schoolId} does not exist.`);
  assertRunMarker({ data: school.data() || {}, testRunId, label: 'Fixture school' });
  assert.equal(closure.exists, false, `Fixture cash closure ${id} already exists.`);
  assert.equal(ledger.exists, true, `Fixture cash ledger day ${id} does not exist.`);
  const ledgerData = ledger.data() || {};
  assertExactDocument({ data: ledgerData, schoolId, date, label: 'Cash ledger day' });
  assert.equal(ledgerData.status, 'open', `Fixture cash ledger day ${id} is not open.`);
  assert.equal(ledgerData.cashReceived, expectedCash, `Fixture cash ledger day ${id} has an unexpected total.`);
  return { id, data: ledgerData };
};

export const markCashDayFixture = async ({ db, schoolId, date, testRunId, closureNotes }) => {
  const id = exactCashDayId(schoolId, date);
  const closureRef = db.collection('cashClosures').doc(id);
  const ledgerRef = db.collection('cashLedgerDays').doc(id);
  await db.runTransaction(async (transaction) => {
    const [closure, ledger] = await Promise.all([
      transaction.get(closureRef),
      transaction.get(ledgerRef),
    ]);
    assert.equal(closure.exists, true, `Fixture cash closure ${id} was not created.`);
    assert.equal(ledger.exists, true, `Fixture cash ledger day ${id} was not created.`);
    const closureData = closure.data() || {};
    const ledgerData = ledger.data() || {};
    assertExactDocument({ data: closureData, schoolId, date, label: 'Cash closure' });
    assertExactDocument({ data: ledgerData, schoolId, date, label: 'Cash ledger day' });
    assert.equal(closureData.notes, closureNotes, 'Cash closure notes do not identify this test run.');
    assert.equal(ledgerData.closureId, id, 'Cash ledger day is not paired with the exact closure.');
    assert.equal(ledgerData.status, 'closed', 'Cash ledger day did not close.');
    assert.equal(ledgerData.cashReceived, closureData.cashReceived,
      'Cash ledger day total does not match the immutable closure snapshot.');
    assertRunMarker({ data: closureData, testRunId, label: 'Cash closure', allowUnmarked: true });
    assertRunMarker({ data: ledgerData, testRunId, label: 'Cash ledger day', allowUnmarked: true });
    transaction.update(closureRef, { testFixture: true, testRunId });
    transaction.update(ledgerRef, { testFixture: true, testRunId });
  });
  return id;
};

export const cleanupCashDayFixture = async ({ db, schoolId, date, testRunId, closureNotes }) => {
  const id = exactCashDayId(schoolId, date);
  const schoolRef = db.collection('schools').doc(schoolId);
  const closureRef = db.collection('cashClosures').doc(id);
  const ledgerRef = db.collection('cashLedgerDays').doc(id);
  await db.runTransaction(async (transaction) => {
    const [school, closure, ledger] = await Promise.all([
      transaction.get(schoolRef),
      transaction.get(closureRef),
      transaction.get(ledgerRef),
    ]);
    if (!closure.exists && !ledger.exists) return;
    assert.equal(ledger.exists, true, 'Refusing to delete an unpaired cash closure.');
    const ledgerData = ledger.data() || {};
    assertExactDocument({ data: ledgerData, schoolId, date, label: 'Cash ledger day' });

    const schoolData = school.exists ? school.data() || {} : {};
    const fixtureSchoolMatches = school.exists
      && schoolData.testFixture === true
      && schoolData.testRunId === testRunId;
    const ledgerMarkerMatches = ledgerData.testFixture === true && ledgerData.testRunId === testRunId;
    assert.ok(fixtureSchoolMatches || ledgerMarkerMatches,
      'Refusing to delete a cash ledger day without an exact test-run marker.');

    if (closure.exists) {
      const closureData = closure.data() || {};
      assertExactDocument({ data: closureData, schoolId, date, label: 'Cash closure' });
      assert.equal(closureData.notes, closureNotes, 'Refusing to delete a cash closure from another run.');
      assert.equal(ledgerData.closureId, id, 'Refusing to delete an unrelated cash ledger day.');
      const closureMarkerMatches = closureData.testFixture === true && closureData.testRunId === testRunId;
      assert.ok(fixtureSchoolMatches || (closureMarkerMatches && ledgerMarkerMatches),
        'Refusing to delete a cash closure without an exact test-run marker.');
      transaction.delete(closureRef);
    } else {
      assert.equal(ledgerData.status, 'open', 'Refusing to delete an unpaired ledger that is not open.');
      assert.equal(ledgerData.closureId, undefined, 'Refusing to delete a ledger paired with another closure.');
    }
    transaction.delete(ledgerRef);
  });
  return id;
};
