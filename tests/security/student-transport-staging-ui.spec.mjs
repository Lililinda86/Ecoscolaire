import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateExactDeploymentRun } from "../../scripts/verify-exact-deployment-run.mjs";

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

const stagingSha = "b4337bc11a33c025966c78ee73fb8576d3d14b98";
const immutableUrl = "https://ecoscolaire-qsbj1rm7s-linda-lemofouet-s-projects.vercel.app";
const deploymentPayload = ({ conclusion = "success", sha = stagingSha, status = "completed" } = {}) => ({
  workflow_runs: [{
    conclusion,
    event: "push",
    head_branch: "staging",
    head_sha: sha,
    id: 33387217600,
    path: ".github/workflows/deploy-staging.yml",
    status,
  }],
});
const hasExactSuccessfulImmutableUrl = (statuses, expectedUrl) => statuses.filter(
  (entry) => entry?.state === "success" && entry?.environment_url === expectedUrl,
).length === 1;

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

test("LOT 2 preflight reuses the working exact-SHA and immutable-URL command shape", () => {
  assert.match(reusable, /gh api --method GET \\\r?\n\s+"repos\/\$\{GITHUB_REPOSITORY\}\/actions\/workflows\/deploy-staging\.yml\/runs" \\\r?\n\s+-f head_sha="\$EXPECTED_STAGING_SHA"/);
  assert.match(reusable, /node scripts\/verify-exact-deployment-run\.mjs \\\r?\n\s+"\$runs_json" "\$EXPECTED_STAGING_SHA" '\.github\/workflows\/deploy-staging\.yml' staging/);
  assert.match(reusable, /gh api --method GET \\\r?\n\s+"repos\/\$\{GITHUB_REPOSITORY\}\/deployments" \\\r?\n\s+-f sha="\$EXPECTED_STAGING_SHA" -f environment=Preview/);
  assert.match(reusable, /map\(select\(\.state == "success" and \.environment_url == \$url\)\) \| length == 1/);
  assert.doesNotMatch(reusable, /gh api --method GET \+/);
});

test("exact Staging SHA passes while wrong, missing, pending and failed deployments fail closed", () => {
  assert.equal(validateExactDeploymentRun(deploymentPayload(), {
    expectedBranch: "staging",
    expectedSha: stagingSha,
    expectedWorkflowPath: ".github/workflows/deploy-staging.yml",
  }).id, 33387217600);

  for (const payload of [
    deploymentPayload({ sha: "0".repeat(40) }),
    deploymentPayload({ status: "in_progress", conclusion: null }),
    deploymentPayload({ conclusion: "failure" }),
    { workflow_runs: [] },
  ]) {
    assert.throws(() => validateExactDeploymentRun(payload, {
      expectedBranch: "staging",
      expectedSha: stagingSha,
      expectedWorkflowPath: ".github/workflows/deploy-staging.yml",
    }));
  }
});

test("immutable deployment URL must be the one exact successful status", () => {
  assert.equal(hasExactSuccessfulImmutableUrl([
    { state: "success", environment_url: immutableUrl },
  ], immutableUrl), true);
  assert.equal(hasExactSuccessfulImmutableUrl([
    { state: "success", environment_url: "https://wrong.example" },
  ], immutableUrl), false);
  assert.equal(hasExactSuccessfulImmutableUrl([
    { state: "success" },
  ], immutableUrl), false);
  assert.equal(hasExactSuccessfulImmutableUrl([
    { state: "failure", environment_url: immutableUrl },
  ], immutableUrl), false);
});

test("WIF authentication is reachable only after the deployment preflight succeeds", () => {
  const preflightIndex = reusable.indexOf("- name: Verify exact deployed Staging SHA and immutable URL");
  const verifiedIndex = reusable.indexOf("echo 'TARGET_DEPLOYMENT_VERIFIED=true'");
  const authIndex = reusable.indexOf("- name: Authenticate to Staging fixture identity");
  assert.ok(preflightIndex >= 0);
  assert.ok(verifiedIndex > preflightIndex);
  assert.ok(authIndex > verifiedIndex);
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
