import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectStudentClassOption } from "../../scripts/select-student-class-option.mjs";
import { validateExactDeploymentRun } from "../../scripts/verify-exact-deployment-run.mjs";

const read = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
const callerPath = ".github/workflows/transport-payments-release-runner.yml";
const reusablePath = ".github/workflows/student-transport-staging-ui.yml";
const [caller, reusable, harness, classSelectHelper, ci, paymentsUi] = await Promise.all([
  read(callerPath),
  read(reusablePath),
  read("scripts/test-student-transport-staging.mjs"),
  read("scripts/select-student-class-option.mjs"),
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


const fakeClassForm = (definitions) => {
  const selects = definitions.map((definition) => ({
    options: Array.isArray(definition) ? definition : definition.options,
    selectedValue: "",
  }));

  const createSelectLocator = (matches) => ({
    waitFor: async () => {
      if (matches.length === 0) throw new Error("class select not attached");
    },
    count: async () => matches.length,
    selectOption: async ({ value }) => {
      const select = matches[0];
      if (!select?.options.some((option) => option.value === value)) {
        throw new Error("option value not found in resolved select");
      }
      select.selectedValue = value;
    },
    inputValue: async () => matches[0]?.selectedValue ?? "",
    locator: (selector) => {
      assert.equal(selector, "option:checked");
      return {
        textContent: async () => matches[0]?.options.find(
          (option) => option.value === matches[0].selectedValue,
        )?.label ?? null,
      };
    },
  });

  return {
    selects,
    locator: (selector) => {
      const optionMatch = selector.match(/^option\[value="([A-Za-z0-9_-]+)"\]$/);
      if (optionMatch) {
        const value = optionMatch[1];
        const matches = selects.flatMap((select) => select.options
          .filter((option) => option.value === value)
          .map((option) => ({ option, select })));
        return {
          waitFor: async () => {
            if (matches.length === 0) throw new Error("class option not attached");
          },
          count: async () => matches.length,
          getAttribute: async (name) => (
            name === "value" ? matches[0]?.option.value ?? null : null
          ),
          textContent: async () => matches[0]?.option.label ?? null,
        };
      }

      const selectMatch = selector.match(
        /^select:has\(option\[value="([A-Za-z0-9_-]+)"\]\)$/,
      );
      assert.ok(selectMatch, `unexpected locator: ${selector}`);
      const value = selectMatch[1];
      return createSelectLocator(
        selects.filter((select) => select.options.some((option) => option.value === value)),
      );
    },
  };
};

test("grouped primary class option resolves and selects exactly", async () => {
  const form = fakeClassForm([{
    options: [
      { value: "lot2-primary-123-1", label: "LOT2 Primaire", group: "PRIMAIRE" },
    ],
  }]);
  const select = await selectStudentClassOption({
    form,
    classId: "lot2-primary-123-1",
    expectedLabel: "LOT2 Primaire",
  });
  assert.equal(await select.inputValue(), "lot2-primary-123-1");
});

test("grouped secondary class option resolves and selects exactly", async () => {
  const form = fakeClassForm([{
    options: [
      {
        value: "lot2-secondary-123-1",
        label: "LOT2 Secondaire FREE",
        group: "SECONDAIRE",
      },
    ],
  }]);
  const select = await selectStudentClassOption({
    form,
    classId: "lot2-secondary-123-1",
    expectedLabel: "LOT2 Secondaire FREE",
  });
  assert.equal(await select.inputValue(), "lot2-secondary-123-1");
});

test("direct class option under select remains supported", async () => {
  const form = fakeClassForm([[
    { value: "lot2-primary-123-1", label: "LOT2 Primaire" },
  ]]);
  const select = await selectStudentClassOption({
    form,
    classId: "lot2-primary-123-1",
    expectedLabel: "LOT2 Primaire",
  });
  assert.equal(await select.inputValue(), "lot2-primary-123-1");
});

test("class option isolates the exact select among multiple selects", async () => {
  const form = fakeClassForm([
    [{ value: "unrelated", label: "Autre contrôle" }],
    [{ value: "lot2-primary-123-1", label: "LOT2 Primaire", group: "PRIMAIRE" }],
  ]);
  await selectStudentClassOption({
    form,
    classId: "lot2-primary-123-1",
    expectedLabel: "LOT2 Primaire",
  });
  assert.equal(form.selects[0].selectedValue, "");
  assert.equal(form.selects[1].selectedValue, "lot2-primary-123-1");
});

test("class selection fails closed when the exact option is absent", async () => {
  const form = fakeClassForm([[{ value: "another-class", label: "Autre classe" }]]);
  await assert.rejects(
    selectStudentClassOption({
      form,
      classId: "lot2-primary-123-1",
      expectedLabel: "LOT2 Primaire",
    }),
    /class option not attached/,
  );
});

test("class selection rejects the right value with the wrong label", async () => {
  const form = fakeClassForm([[
    { value: "lot2-primary-123-1", label: "Mauvaise classe", group: "PRIMAIRE" },
  ]]);
  await assert.rejects(
    selectStudentClassOption({
      form,
      classId: "lot2-primary-123-1",
      expectedLabel: "LOT2 Primaire",
    }),
  );
});

test("class selection rejects the right label with the wrong value", async () => {
  const form = fakeClassForm([[
    { value: "wrong-primary-123-1", label: "LOT2 Primaire", group: "PRIMAIRE" },
  ]]);
  await assert.rejects(
    selectStudentClassOption({
      form,
      classId: "lot2-primary-123-1",
      expectedLabel: "LOT2 Primaire",
    }),
    /class option not attached/,
  );
});

test("class selection rejects duplicate selects containing the same value", async () => {
  const form = fakeClassForm([
    [{ value: "lot2-primary-123-1", label: "LOT2 Primaire" }],
    [{ value: "lot2-primary-123-1", label: "LOT2 Primaire", group: "PRIMAIRE" }],
  ]);
  await assert.rejects(
    selectStudentClassOption({
      form,
      classId: "lot2-primary-123-1",
      expectedLabel: "LOT2 Primaire",
    }),
    /expected one class option/,
  );
});

test("LOT 2 harness uses a form-scoped grouped-option locator and exact labels", () => {
  assert.match(harness, /selectStudentClassOption\(\{ form, classId, expectedLabel: className \}\)/);
  assert.match(
    classSelectHelper,
    /form\.locator\(`select:has\(option\[value="\$\{classId\}"\]\)\`\)/,
  );
  assert.doesNotMatch(classSelectHelper, /parent::select/);
  assert.match(harness, /className: "LOT2 Primaire"/);
  assert.match(harness, /className: "LOT2 Secondaire FREE"/);
});
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

test("LOT 2 workflow rejects template plus artifacts across every shell command family", () => {
  assert.doesNotMatch(reusable, /\+\s*https?:\/\//);
  assert.doesNotMatch(reusable, /\+\s*['"]https?:\/\//);
  assert.doesNotMatch(reusable, /['"]https?:\/\/[^'"\r\n]+['"]\s*\+\s{2,}/);
  assert.doesNotMatch(
    reusable,
    /(?:gh api|curl|gcloud|node scripts\/verify-exact-deployment-run\.mjs)[^\r\n]*\+\s{2,}/,
  );
  assert.doesNotMatch(reusable, /for permission in[^\r\n]*\+\s{2,}/);
  for (const command of [
    "gh api --method GET",
    "curl --fail --silent --show-error",
    "gcloud config get-value project",
    "gcloud auth print-access-token",
    "node scripts/verify-exact-deployment-run.mjs",
  ]) assert.match(reusable, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("IAM guard keeps the exact identity and permissions and runs before Chromium or fixtures", () => {
  assert.match(
    reusable,
    /workload_identity_provider: projects\/411364288790\/locations\/global\/workloadIdentityPools\/italo-transport-staging\/providers\/github-ecoscolaire-staging/,
  );
  assert.match(
    reusable,
    /service_account: italo-transport-runner-staging@ecoscolaire-staging\.iam\.gserviceaccount\.com/,
  );
  assert.doesNotMatch(reusable, /credentials_json/);
  assert.match(reusable, /response="\$\(curl --fail --silent --show-error \\r?\n/);
  assert.match(reusable, /cloudresourcemanager\.googleapis\.com\/v1\/projects\/ecoscolaire-staging:testIamPermissions/);
  for (const permission of [
    "datastore.entities.create", "datastore.entities.get", "datastore.entities.list",
    "datastore.entities.update", "datastore.entities.delete", "firebaseauth.users.create",
    "firebaseauth.users.get", "firebaseauth.users.delete",
  ]) assert.match(reusable, new RegExp(permission.replaceAll(".", "\\.")));
  assert.doesNotMatch(reusable, /firebaseauth\.users\.update|firebaseauth\.users\.list|roles\/|Owner|Editor|Admin/);
  const guardIndex = reusable.indexOf("- name: Guard Staging target and exact fixture lifecycle permissions");
  const chromiumIndex = reusable.indexOf("- name: Install Chromium");
  const fixtureIndex = reusable.indexOf("- name: Run the single isolated LOT 2 student Transport UI validation");
  assert.ok(guardIndex >= 0 && chromiumIndex > guardIndex && fixtureIndex > chromiumIndex);
  assert.match(reusable, /set -euo pipefail/);
  assert.match(reusable, /jq -e --arg permission/);
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
