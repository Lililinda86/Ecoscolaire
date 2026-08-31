import assert from "node:assert/strict";

const exactSet = (values, label) => {
  assert.ok(Array.isArray(values) && values.length > 0, `${label} must not be empty.`);
  return new Set(values);
};

export const isOwnedFixtureAudit = (data, ownership) =>
  data?.testFixture === true &&
  data?.testRunId === ownership.testRunId &&
  ownership.schoolIds.has(data?.schoolId) &&
  ownership.actorUids.has(data?.actorUid) &&
  ownership.targetIds.has(data?.targetId);

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
