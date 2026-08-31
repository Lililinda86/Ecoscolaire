import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertLabelledFrenchCurrencyAmount,
  parseLabelledFrenchCurrencyAmount,
} from "../../scripts/payment-forward-recovery-currency.mjs";

const caller = await readFile(".github/workflows/transport-payments-release-runner.yml", "utf8");
const reusable = await readFile(".github/workflows/transport-payment-context-staging-ui.yml", "utf8");
const harness = await readFile("scripts/test-transport-payment-context-staging.mjs", "utf8");
const payments = await readFile("src/pages/Payments.tsx", "utf8");

test("lot3 operation is isolated behind the already authorized WIF caller", () => {
  assert.match(caller, /options: \[transport, lot1_tuition_ui, lot2_transport_student, lot3_transport_payment_ui\]/);
  const job = caller.match(/  lot3-transport-payment-ui:\r?\n[\s\S]*$/)?.[0] || "";
  assert.match(job, /inputs\.operation == 'lot3_transport_payment_ui'/);
  assert.match(job, /inputs\.confirmation == 'RUN_LOT3_TRANSPORT_PAYMENT_UI'/);
  assert.match(job, /uses: \.\/\.github\/workflows\/transport-payment-context-staging-ui\.yml/);
  assert.doesNotMatch(job, /test-transport-payments-production|lot1_tuition_ui|lot2_transport_student/);
  assert.match(job, /permissions:\r?\n\s+actions: read\r?\n\s+contents: read\r?\n\s+id-token: write/);
});

test("reusable workflow is exact-SHA, immutable-URL, Staging-only and fail-closed", () => {
  assert.match(reusable, /workflow_call:/);
  assert.match(reusable, /github\.ref == 'refs\/heads\/staging'/);
  assert.match(reusable, /test "\$GITHUB_SHA" = "\$EXPECTED_STAGING_SHA"/);
  assert.match(reusable, /verify-exact-deployment-run\.mjs/);
  assert.match(reusable, /environment_url == \$url/);
  assert.match(reusable, /environment: staging/);
  assert.match(reusable, /github-ecoscolaire-staging/);
  assert.match(reusable, /italo-transport-runner-staging@ecoscolaire-staging/);
  assert.doesNotMatch(reusable, /credentials_json|firebaseauth\.users\.update|roles\/(?:owner|editor|firebaseauth\.admin|datastore\.user)/i);
  assert.match(reusable, /Guard Staging[\s\S]*?Install Chromium/);
});

test("lot3 harness is run-scoped, never targets italo-gsb and cleans every fixture family", () => {
  assert.match(harness, /LOT3_TEST_RUN_ID/);
  assert.match(harness, /assert\.notEqual\(schoolId, "italo-gsb"\)/);
  assert.doesNotMatch(harness, /setCustomUserClaims|listUsers/);
  for (const collection of [
    "students", "studentPrivate", "studentFinance", "payments", "receipts",
    "transportPaymentAllocations", "financialBenefits", "paymentMoratoriums",
    "audit_logs", "cashClosures", "cashLedgerDays",
  ]) assert.match(harness, new RegExp(`"${collection}"`));
  assert.match(harness, /testFixture: true, testRunId/);
  assert.match(harness, /residualCounts\.counters/);
  assert.match(harness, /const orphans = Object\.values\(residualCounts\)\.reduce/);
  assert.match(harness, /CLEANUP PASS/);
});

test("lot3 UI proves context, server tariffs, periods, preview, free and incomplete states", () => {
  for (const testId of [
    "transport-student-context", "transport-zone-pk", "transport-neighborhood",
    "transport-pickup", "transport-policy", "transport-rate",
    "transport-installments-scroll", "transport-payment-preview",
    "transport-existing-credit", "transport-generated-credit", "transport-final-credit",
  ]) assert.match(payments, new RegExp(`data-testid="${testId}"`));
  assert.match(harness, /label: "Tarif applicable", expected: 4000, suffix: "\/ période"/);
  assert.match(harness, /label: "Tarif applicable", expected: 5000, suffix: "\/ période"/);
  for (const creditLabel of ["Crédit existant", "Crédit généré", "Crédit final prévu"]) {
    assert.match(harness, new RegExp(`label: "${creditLabel}"`));
  }
  assert.match(harness, /transport-free-secondary/);
  assert.match(harness, /transport-configuration-incomplete/);
  assert.match(harness, /Mois \(Transport\)/);
  assert.match(harness, /receipt\.transportContext/);
});

test("historical policy remains unchanged and client never derives a rate from address text", () => {
  assert.doesNotMatch(harness, /transportPaymentPolicy\.ts/);
  assert.doesNotMatch(payments, /transportNeighborhood[\s\S]{0,180}(?:4000|5000)/);
  assert.doesNotMatch(payments, /transportPickupPoint[\s\S]{0,180}(?:4000|5000)/);
  assert.match(payments, /collectionQuote\.monthlyGrossAmount/);
});

test("labelled transport tariff parsing is strict, Unicode-safe and period-scoped", () => {
  for (const text of [
    "Tarif applicable : 4 000 FCFA / période",
    "Tarif applicable : 4\u202f000 FCFA / période",
    "Tarif applicable : 4\u00a0000 FCFA / période",
    "Tarif applicable : 4000 FCFA / période",
  ]) {
    assert.equal(parseLabelledFrenchCurrencyAmount(text, {
      label: "Tarif applicable", suffix: "/ période",
    }), 4000);
    assert.doesNotThrow(() => assertLabelledFrenchCurrencyAmount(text, {
      label: "Tarif applicable", expected: 4000, suffix: "/ période",
    }));
  }
  for (const wrongText of [
    "Tarif applicable : 5 000 FCFA / période",
    "Tarif applicable : 40 000 FCFA / période",
  ]) {
    assert.throws(() => assertLabelledFrenchCurrencyAmount(wrongText, {
      label: "Tarif applicable", expected: 4000, suffix: "/ période",
    }));
  }
  assert.throws(() => assertLabelledFrenchCurrencyAmount("Tarif applicable : 4 000 FCFA", {
    label: "Tarif applicable", expected: 4000, suffix: "/ période",
  }));
  assert.throws(() => assertLabelledFrenchCurrencyAmount(
    "Autre montant : 4 000 FCFA / période Tarif applicable : 5 000 FCFA / période",
    { label: "Tarif applicable", expected: 4000, suffix: "/ période" },
  ));
});

test("remaining labelled Lot 3 credit assertions use the same strict parser", () => {
  for (const [label, expected] of [
    ["Crédit existant", 500],
    ["Crédit généré", 1000],
    ["Crédit final prévu", 1500],
  ]) {
    assert.doesNotThrow(() => assertLabelledFrenchCurrencyAmount(
      `${label} : ${expected.toLocaleString("fr-FR")} FCFA`,
      { label, expected },
    ));
    assert.throws(() => assertLabelledFrenchCurrencyAmount(
      `${label} : ${expected + 1} FCFA`,
      { label, expected },
    ));
  }
});
