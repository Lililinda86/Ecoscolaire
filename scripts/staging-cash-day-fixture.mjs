import assert from 'node:assert/strict';

const exactCashDayId = (schoolId, date) => {
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
    assertRunMarker({ data: closureData, testRunId, label: 'Cash closure', allowUnmarked: true });
    assertRunMarker({ data: ledgerData, testRunId, label: 'Cash ledger day', allowUnmarked: true });
    transaction.update(closureRef, { testFixture: true, testRunId });
    transaction.update(ledgerRef, { testFixture: true, testRunId });
  });
  return id;
};

export const cleanupCashDayFixture = async ({ db, schoolId, date, testRunId, closureNotes }) => {
  const id = exactCashDayId(schoolId, date);
  const closureRef = db.collection('cashClosures').doc(id);
  const ledgerRef = db.collection('cashLedgerDays').doc(id);
  await db.runTransaction(async (transaction) => {
    const [closure, ledger] = await Promise.all([
      transaction.get(closureRef),
      transaction.get(ledgerRef),
    ]);
    if (!closure.exists && !ledger.exists) return;
    assert.equal(closure.exists, true, 'Refusing to delete an unpaired cash ledger day.');
    assert.equal(ledger.exists, true, 'Refusing to delete an unpaired cash closure.');
    const closureData = closure.data() || {};
    const ledgerData = ledger.data() || {};
    assertExactDocument({ data: closureData, schoolId, date, label: 'Cash closure' });
    assertExactDocument({ data: ledgerData, schoolId, date, label: 'Cash ledger day' });
    assert.equal(closureData.notes, closureNotes, 'Refusing to delete a cash closure from another run.');
    assert.equal(ledgerData.closureId, id, 'Refusing to delete an unrelated cash ledger day.');
    assertRunMarker({ data: closureData, testRunId, label: 'Cash closure' });
    assertRunMarker({ data: ledgerData, testRunId, label: 'Cash ledger day' });
    transaction.delete(closureRef);
    transaction.delete(ledgerRef);
  });
  return id;
};
