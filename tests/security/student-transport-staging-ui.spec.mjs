import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
const callerPath = ".github/workflows/transport-payments-release-runner.yml";
const reusablePath = ".github/workflows/student-transport-staging-ui.yml";
const [caller, reusable, harness, ci, paymentsUi] = await Promise.all([
  read(callerPath),
  read(reusablePath),
  read("scripts/test-student-transport-staging.mjs"),
  read(".github/workflows/ci.yml"),
  read("src/pages/Payments.tsx"),
]);

test("LOT 2 operation routes only to the reusable student Transport UI workflow", () => {
  assert.match(caller, /options: \[transport, lot1_tuition_ui, lot2_transport_student\]/);
  const transportJob = caller.match(
    /  isolated-transport-release:\r?\n[\s\S]*?(?=\r?\n  lot1-tuition-ui:)/,
  )?.[0];
  const lot1Job = caller.match(
    /  lot1-tuition-ui:\r?\n[\s\S]*?(?=\r?\n  lot2-transport-student-ui:)/,
  )?.[0];
  const lot2Job = caller.match(/  lot2-transport-student-ui:\r?\n[\s\S]*$/)?.[0];
  assert.ok(transportJob);
  assert.ok(lot1Job);
  assert.ok(lot2Job);
  assert.match(transportJob, /inputs\.operation == 'transport'/);
  assert.doesNotMatch(transportJob, /lot2_transport_student/);
  assert.match(lot1Job, /inputs\.operation == 'lot1_tuition_ui'/);
  assert.doesNotMatch(lot1Job, /lot2_transport_student/);
  assert.match(lot2Job, /inputs\.operation == 'lot2_transport_student'/);
  assert.match(lot2Job, /inputs\.confirmation == 'RUN_LOT2_TRANSPORT_STUDENT_UI'/);
  assert.match(lot2Job, /uses: \.\/\.github\/workflows\/student-transport-staging-ui\.yml/);
  assert.doesNotMatch(
    lot2Job,
    /test-transport-payments-production|payment-forward-recovery-staging-ui|lot1_tuition_ui|lot3/,
  );
});

test("authorized caller identity, Staging environment and OIDC remain strict", () => {
  assert.equal(
    "Lililinda86/Ecoscolaire/" + callerPath + "@refs/heads/staging",
    "Lililinda86/Ecoscolaire/.github/workflows/transport-payments-release-runner.yml@refs/heads/staging",
  );
  assert.equal(
    "Lililinda86/Ecoscolaire/" + reusablePath + "@refs/heads/staging",
    "Lililinda86/Ecoscolaire/.github/workflows/student-transport-staging-ui.yml@refs/heads/staging",
  );
  assert.match(reusable, /workflow_call:/);
  assert.match(reusable, /environment: staging/);
  assert.match(
    reusable,
    /permissions:\n\s+actions: read\n\s+contents: read\n\s+id-token: write/,
  );
  assert.match(reusable, /test "\$GITHUB_REF" = 'refs\/heads\/staging'/);
  assert.match(reusable, /test "\$GITHUB_SHA" = "\$EXPECTED_STAGING_SHA"/);
  assert.match(
    reusable,
    /LOT2_TEST_RUN_ID: \$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.doesNotMatch(caller + reusable, /credentials_json/);
  assert.doesNotMatch(caller + reusable, /gcloud iam|add-iam-policy-binding|providers (?:create|update)/);
});

test("LOT 2 runner requests only the existing eight fixture lifecycle permissions", () => {
  const permissions = [
    "datastore.entities.create", "datastore.entities.get", "datastore.entities.list",
    "datastore.entities.update", "datastore.entities.delete", "firebaseauth.users.create",
    "firebaseauth.users.get", "firebaseauth.users.delete",
  ];
  for (const permission of permissions) assert.match(reusable, new RegExp(permission));
  assert.doesNotMatch(
    reusable,
    /firebaseauth\.users\.update|firebaseauth\.users\.list|roles\/|Owner|Editor|Admin/,
  );
  assert.doesNotMatch(harness, /setCustomUserClaims|listUsers/);
});

test("harness covers complete create, reload, edit, deactivate and reactivate", () => {
  for (const marker of [
    "CREATE_COMPLETE PASS", "RELOAD PASS", "EDIT PASS", "DEACTIVATE PASS",
    "REACTIVATE PASS", "PRIMARY_INCOMPLETE PASS", "SECONDARY_FREE PASS",
    "NO_SIDE_EFFECT PASS",
  ]) assert.match(harness, new RegExp(marker));
  assert.match(harness, /pk: 28, neighborhood: "Quartier A", pickup: "Point A"/);
  assert.match(harness, /fill\("35"\)/);
  assert.match(harness, /fill\("Quartier B"\)/);
  assert.match(harness, /fill\("Point B"\)/);
  assert.match(harness, /transportStatus, "needs_configuration"/);
  assert.match(harness, /transportStatus, "active"/);
  assert.match(harness, /context\.privateData && context\.privateData\.transportZonePk, undefined/);
});

test("cleanup is exact, fixture-owned and includes all required residual counts", () => {
  assert.match(harness, /const schoolId = "lot2-transport-student-staging-" \+ testRunId/);
  assert.match(harness, /assert\.notEqual\(schoolId, "italo-gsb"\)/);
  assert.match(harness, /assert\.equal\(data\.schoolId, schoolId\)/);
  assert.match(harness, /assert\.equal\(data\.createdBy, secretaryUid\)/);
  assert.match(harness, /assert\.match\(data\.matricule, \/\^LOT2-\//);
  assert.match(harness, /ownedStudents = await db\.collection\("students"\)\.where\("schoolId", "==", schoolId\)/);
  assert.match(harness, /deleteOwnedFixtureAudits/);
  assert.match(harness, /collectionCounts\.students/);
  assert.match(harness, /collectionCounts\.studentPrivate/);
  assert.match(harness, /collectionCounts\.studentFinance/);
  assert.match(harness, /Auth: auth/);
  assert.match(harness, /audit,/);
  assert.match(harness, /orphans,/);
  assert.doesNotMatch(harness, /recursiveDelete|listUsers|collectionGroup/);
});

test("CI checks the harness and protected business files remain outside the harness", () => {
  assert.match(ci, /node --check scripts\/test-student-transport-staging\.mjs/);
  assert.match(ci, /tests\/security\/student-transport-staging-ui\.spec\.mjs/);
  assert.doesNotMatch(harness + reusable, /functions\/src|firestore\.rules/);
  assert.match(paymentsUi, /export default Payments|const Payments/);
});
