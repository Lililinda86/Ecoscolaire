import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertFixtureCashDayOpen,
  cleanupCashDayFixture,
  markCashDayFixture,
} from '../../scripts/staging-cash-day-fixture.mjs';

const fakeDb = (entries = {}) => {
  const documents = new Map(Object.entries(entries));
  const ref = (collection, id) => ({
    key: `${collection}/${id}`,
    async get() {
      const data = documents.get(this.key);
      return { exists: data !== undefined, data: () => data, ref: this };
    },
  });
  return {
    documents,
    collection: (name) => ({ doc: (id) => ref(name, id) }),
    runTransaction: async (operation) => operation({
      get: (documentRef) => documentRef.get(),
      update: (documentRef, patch) => documents.set(documentRef.key, {
        ...documents.get(documentRef.key), ...patch,
      }),
      delete: (documentRef) => documents.delete(documentRef.key),
    }),
  };
};

const fixtureDocuments = ({ schoolId, date, testRunId, marked = false }) => {
  const id = `${schoolId}__${date}`;
  const marker = marked ? { testFixture: true, testRunId } : {};
  return {
    [`cashClosures/${id}`]: {
      schoolId, date, notes: `E2E ${testRunId}`, ...marker,
    },
    [`cashLedgerDays/${id}`]: {
      schoolId, date, closureId: id, status: 'closed', ...marker,
    },
  };
};

const markAndCleanup = async (db, schoolId, date, testRunId) => {
  const options = { db, schoolId, date, testRunId, closureNotes: `E2E ${testRunId}` };
  await markCashDayFixture(options);
  await cleanupCashDayFixture(options);
};

test('close then cleanup removes the exact cash closure and cash ledger day', async () => {
  const schoolId = 'tuition-deadlines-staging-run-a';
  const date = '2026-08-29';
  const db = fakeDb(fixtureDocuments({ schoolId, date, testRunId: 'run-a' }));
  await markAndCleanup(db, schoolId, date, 'run-a');
  assert.equal(db.documents.has(`cashClosures/${schoolId}__${date}`), false);
  assert.equal(db.documents.has(`cashLedgerDays/${schoolId}__${date}`), false);
  await assertFixtureCashDayOpen({ db, schoolId, date });
});

test('cleanup never deletes a real or unmarked cash day', async () => {
  const schoolId = 'real-school';
  const date = '2026-08-29';
  const db = fakeDb(fixtureDocuments({ schoolId, date, testRunId: 'test-run' }));
  await assert.rejects(() => cleanupCashDayFixture({
    db, schoolId, date, testRunId: 'test-run', closureNotes: 'E2E test-run',
  }));
  assert.equal(db.documents.has(`cashClosures/${schoolId}__${date}`), true);
  assert.equal(db.documents.has(`cashLedgerDays/${schoolId}__${date}`), true);
});

test('two runs on the same date cannot contaminate each other', async () => {
  const date = '2026-08-29';
  const schoolA = 'tuition-deadlines-staging-run-a';
  const schoolB = 'tuition-deadlines-staging-run-b';
  const db = fakeDb({
    ...fixtureDocuments({ schoolId: schoolA, date, testRunId: 'run-a' }),
    ...fixtureDocuments({ schoolId: schoolB, date, testRunId: 'run-b', marked: true }),
  });
  await markAndCleanup(db, schoolA, date, 'run-a');
  assert.equal(db.documents.has(`cashLedgerDays/${schoolB}__${date}`), true);
  assert.equal(db.documents.has(`cashClosures/${schoolB}__${date}`), true);
});

test('same-date different-school cleanup is isolated', async () => {
  const date = '2026-08-29';
  const fixtureSchool = 'tuition-deadlines-staging-run-a';
  const otherSchool = 'other-fixture-run-a';
  const db = fakeDb({
    ...fixtureDocuments({ schoolId: fixtureSchool, date, testRunId: 'run-a' }),
    ...fixtureDocuments({ schoolId: otherSchool, date, testRunId: 'run-a', marked: true }),
  });
  await markAndCleanup(db, fixtureSchool, date, 'run-a');
  assert.equal(db.documents.has(`cashLedgerDays/${otherSchool}__${date}`), true);
});

test('cleanup is idempotent and the next tuition scenario starts open', async () => {
  const schoolId = 'tuition-deadlines-staging-run-a';
  const date = '2026-08-29';
  const db = fakeDb(fixtureDocuments({ schoolId, date, testRunId: 'run-a' }));
  await markAndCleanup(db, schoolId, date, 'run-a');
  await cleanupCashDayFixture({
    db, schoolId, date, testRunId: 'run-a', closureNotes: 'E2E run-a',
  });
  await assertFixtureCashDayOpen({ db, schoolId, date });
});
