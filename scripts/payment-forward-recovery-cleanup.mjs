import assert from "node:assert/strict";

const SYSTEM_FINANCE_ACTOR = "system:updateStudentFinancialStatus";
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const exactSet = (values, label) => {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} must not be empty.`);
  return new Set(values);
};

const financeOwnership = ({ studentIds, schoolId, testRunId }) => {
  assert.match(testRunId, /^[A-Za-z0-9_-]{1,128}$/, "Invalid fixture testRunId.");
  assert.ok(typeof schoolId === "string" && schoolId.length > 0, "Invalid fixture schoolId.");
  assert.notEqual(schoolId, "italo-gsb", "The real school is never a cleanup target.");
  return { studentIds: exactSet(studentIds, "studentIds"), schoolId, testRunId };
};

export const isOwnedFixtureAudit = (data, ownership) =>
  data?.testFixture === true &&
  data?.testRunId === ownership.testRunId &&
  ownership.schoolIds.has(data?.schoolId) &&
  ownership.actorUids.has(data?.actorUid) &&
  ownership.targetIds.has(data?.targetId);

export const isOwnedFixtureStudentFinance = (documentId, data, ownership) => {
  if (!data || ownership.schoolId === "italo-gsb") return false;
  if (!ownership.studentIds.has(documentId)) return false;
  if (data.id !== documentId || data.studentId !== documentId) return false;
  if (data.schoolId !== ownership.schoolId) return false;
  if (data.testRunId !== undefined && data.testRunId !== ownership.testRunId) return false;
  if (data.testFixture !== undefined && data.testFixture !== true) return false;
  const hasFixtureMarker = data.testRunId !== undefined || data.testFixture !== undefined;
  return hasFixtureMarker || data.createdBy === SYSTEM_FINANCE_ACTOR;
};

const timestampKey = (value) => {
  if (value?.toMillis instanceof Function) return value.toMillis();
  if (value?.toDate instanceof Function) return value.toDate().getTime();
  return value?.seconds ?? value?._seconds ?? value ?? null;
};

const financeStateKey = (snapshots) => JSON.stringify(snapshots.map(({ id, snapshot }) => {
  const data = snapshot.exists ? snapshot.data() : null;
  return [id, snapshot.exists, timestampKey(data?.createdAt), timestampKey(data?.updatedAt),
    data?.createdBy ?? null, data?.updatedBy ?? null];
}));

const readFinance = async (db, studentIds) => Promise.all(studentIds.map(async (id) => ({
  id,
  ref: db.collection("studentFinance").doc(id),
  snapshot: await db.collection("studentFinance").doc(id).get(),
})));

const expectedFieldsMatch = (data, expected = {}) =>
  Object.entries(expected).every(([field, value]) => data?.[field] === value);

export const waitForStudentFinanceTriggerConvergence = async ({
  db,
  studentIds,
  schoolId,
  testRunId,
  expectedTriggerFields = {},
  timeoutMs = 20_000,
  pollMs = 250,
  stableReads = 2,
}) => {
  const ownership = financeOwnership({ studentIds, schoolId, testRunId });
  const deadline = Date.now() + timeoutMs;
  let previousKey = null;
  let stableCount = 0;

  while (Date.now() <= deadline) {
    const records = await readFinance(db, studentIds);
    for (const { id, snapshot } of records) {
      if (!snapshot.exists) continue;
      assert.ok(
        isOwnedFixtureStudentFinance(id, snapshot.data(), ownership),
        `Refusing foreign studentFinance convergence target ${id}.`,
      );
    }
    const triggerReady = Object.entries(expectedTriggerFields).every(([id, expected]) => {
      const record = records.find((item) => item.id === id);
      if (!record?.snapshot.exists) return false;
      const data = record.snapshot.data();
      return (data.updatedBy === SYSTEM_FINANCE_ACTOR || data.createdBy === SYSTEM_FINANCE_ACTOR) &&
        expectedFieldsMatch(data, expected);
    });
    const key = financeStateKey(records);
    stableCount = triggerReady && key === previousKey ? stableCount + 1 : triggerReady ? 1 : 0;
    if (stableCount >= stableReads) return records;
    previousKey = key;
    await delay(pollMs);
  }
  assert.fail("Timed out waiting for the exact studentFinance trigger projection to stabilize.");
};

export const deleteOwnedStudentFinanceFinal = async ({
  db,
  studentIds,
  schoolId,
  testRunId,
  verificationReads = 2,
  pollMs = 250,
}) => {
  const ownership = financeOwnership({ studentIds, schoolId, testRunId });
  let deleted = 0;
  const records = await readFinance(db, studentIds);
  for (const { id, ref, snapshot } of records) {
    if (!snapshot.exists) continue;
    assert.ok(
      isOwnedFixtureStudentFinance(id, snapshot.data(), ownership),
      `Refusing to delete foreign studentFinance document ${id}.`,
    );
    await ref.delete();
    deleted += 1;
  }
  for (let pass = 0; pass < verificationReads; pass += 1) {
    await delay(pollMs);
    const lateRecords = await readFinance(db, studentIds);
    const recreated = lateRecords.filter(({ snapshot }) => snapshot.exists);
    assert.equal(
      recreated.length,
      0,
      `studentFinance recreated after final cleanup: ${recreated.map(({ id }) => id).join(",")}`,
    );
  }
  return deleted;
};

export const deleteOwnedFixtureAudits = async ({
  db,
  testRunId,
  schoolIds,
  actorUids,
  targetIds,
}) => {
  assert.match(testRunId, /^[A-Za-z0-9_-]{1,128}$/, "Invalid fixture testRunId.");
  const ownership = {
    testRunId,
    schoolIds: exactSet(schoolIds, "schoolIds"),
    actorUids: exactSet(actorUids, "actorUids"),
    targetIds: exactSet(targetIds, "targetIds"),
  };
  const snapshot = await db
    .collection("audit_logs")
    .where("testRunId", "==", testRunId)
    .get();
  const owned = snapshot.docs.filter((document) =>
    isOwnedFixtureAudit(document.data(), ownership),
  );
  await Promise.all(owned.map((document) => document.ref.delete()));
  return owned.length;
};
