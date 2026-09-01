import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertLabelledFrenchCurrencyAmount,
  parseLabelledFrenchCurrencyAmount,
} from "../../scripts/payment-forward-recovery-currency.mjs";
import {
  assertScopedReceiptLabelledCurrency,
  assertScopedReceiptSiblingCurrency,
  assertStructuredReceiptAllocationRows,
  assertTransportBenefitAppliedToQuote,
  exactReceiptRowSelector,
} from "../../scripts/transport-payment-context-assertions.mjs";

const caller = await readFile(".github/workflows/transport-payments-release-runner.yml", "utf8");
const reusable = await readFile(".github/workflows/transport-payment-context-staging-ui.yml", "utf8");
const harness = await readFile("scripts/test-transport-payment-context-staging.mjs", "utf8");
const transportAssertions = await readFile("scripts/transport-payment-context-assertions.mjs", "utf8");
const payments = await readFile("src/pages/Payments.tsx", "utf8");
const receiptHistory = await readFile("src/components/ReceiptHistory.tsx", "utf8");

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

test("lot3 cleanup converges payment triggers before exact finance and counter cleanup", () => {
  assert.match(harness,
    /deleteTaggedDocuments\("payments"\)[\s\S]*?deleteTaggedDocuments\("transportPaymentAllocations"\)[\s\S]*?waitForStudentFinanceTriggerConvergence/);
  assert.match(harness,
    /waitForStudentFinanceTriggerConvergence[\s\S]*?projectionActorIds: createdAuthUids[\s\S]*?transportPaid: 0/);
  assert.match(harness,
    /waitForStudentFinanceTriggerConvergence[\s\S]*?tracked[\s\S]*?deleteOwnedStudentFinanceFinal/);
  assert.match(harness,
    /deleteOwnedStudentFinanceFinal[\s\S]*?verificationReads: 3[\s\S]*?deleteUser[\s\S]*?deleteTaggedDocuments\("audit_logs"\)[\s\S]*?deleteOwnedFixtureReceiptCounter/);
  assert.doesNotMatch(harness, /setTimeout\(resolve => setTimeout|setTimeout\(resolve, 750\)/);
  assert.match(harness, /collection === "studentFinance"[\s\S]*?Object\.values\(studentIds\)[\s\S]*?snapshot\.exists/);
  assert.match(harness, /residualCounts\.counters[\s\S]*?const orphans/);
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

test("lot3 UI explicitly proves partial state, ordered allocations, benefit isolation and moratorium dates", () => {
  assert.match(harness, /assertTransportInstallmentRow\(form,[\s\S]*?previousPaid: 1000,[\s\S]*?remaining: 2000,[\s\S]*?status: "PARTIEL"/);
  assert.match(harness, /expectedAllocations = \[[\s\S]*?2026-09[\s\S]*?amount: 2000[\s\S]*?2026-10[\s\S]*?amount: 4000[\s\S]*?2026-11[\s\S]*?amount: 4000[\s\S]*?CREDIT[\s\S]*?amount: 1000/);
  assert.match(harness, /LOT3-TUITION-ISOLATED/);
  assert.match(harness, /forbiddenReferences: \["LOT3-TUITION-ISOLATED"\]/);
  assert.match(harness, /const quote = await waitForQuote/);
  assert.match(harness, /quote\.getByText\([\s\S]*?DISCOUNT_VOUCHER/);
  assert.match(harness, /collection-quote-gross[\s\S]*?12_000/);
  assert.match(harness, /collection-quote-net[\s\S]*?11_000/);
  assert.match(harness, /quote\.getByText\("Bourse \/ réduction applicable"/);
  assert.match(harness, /quote\.getByText\("Échéance initiale"[\s\S]*?15\/09\/2026/);
  assert.match(harness, /quote\.getByText\("Échéance effective"[\s\S]*?15\/12\/2026/);
});

test("lot3 receipt UI proves class, allocations and remaining balance", () => {
  assert.match(receiptHistory, /displayModel\.className[\s\S]*?>Classe</);
  assert.match(receiptHistory, /transport-receipt-allocation-\$\{displayModel\.id\}/);
  assert.match(receiptHistory, />Reste à payer<[\s\S]*?formattedRemainingBalance/);
  assert.match(harness, /receiptDetail\.getByText\("LOT3 Primaire", \{ exact: true \}\)/);
  assert.match(harness, /receiptAllocation\.locator\("\.receipt-history-allocation-row"\)/);
  assert.match(harness, /assertScopedReceiptLabelledCurrency\(receiptDetail,[\s\S]*?Crédit disponible[\s\S]*?1500/);
  assert.match(harness, /assertScopedReceiptSiblingCurrency\(receiptDetail,[\s\S]*?Reste à payer[\s\S]*?0/);
  assert.doesNotMatch(harness, /parseFrenchCurrencyAmount\(await receiptCredit\.textContent\(\)\)/);
  assert.match(harness, /page\.locator\(exactReceiptRowSelector\(receipt\.receiptNumber\)\)/);
  assert.match(harness, /receiptDetail\.getByTestId\(`transport-receipt-context-/);
  assert.doesNotMatch(harness, /page\.getByText\(receipt\.receiptNumber/);
});

const structuredAllocationRows = (items) => ({
  count: async () => items.length,
  nth: index => ({
    locator: selector => {
      const key = selector === ":scope > span"
        ? "labels"
        : selector === ":scope > strong" ? "amounts" : null;
      assert.ok(key, `Unexpected structured allocation selector: ${selector}`);
      const values = items[index]?.[key] || [];
      return {
        count: async () => values.length,
        textContent: async () => values[0] ?? null,
      };
    },
  }),
});

const receiptAllocations = [
  { kind: "INSTALLMENT", period: "2026-09", amount: 2000 },
  { kind: "INSTALLMENT", period: "2026-10", amount: 4000 },
  { kind: "INSTALLMENT", period: "2026-11", amount: 4000 },
  { kind: "CREDIT", period: null, amount: 1000 },
];

const receiptAllocationDom = [
  { labels: ["Période 2026-09"], amounts: ["2 000 FCFA"] },
  { labels: ["Période 2026-10"], amounts: ["4\u00a0000 FCFA"] },
  { labels: ["Période 2026-11"], amounts: ["4\u202f000 FCFA"] },
  { labels: ["Crédit Transport"], amounts: ["1000 FCFA"] },
];

test("structured receipt allocations read split labels and amounts in strict order", async () => {
  await assert.doesNotReject(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(receiptAllocationDom), receiptAllocations,
  ));
});

test("structured receipt allocations reject wrong amounts and labels", async () => {
  const wrongAmount = structuredClone(receiptAllocationDom);
  wrongAmount[1].amounts = ["5 000 FCFA"];
  await assert.rejects(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(wrongAmount), receiptAllocations,
  ));

  const wrongLabel = structuredClone(receiptAllocationDom);
  wrongLabel[0].labels = ["Période septembre 2026"];
  await assert.rejects(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(wrongLabel), receiptAllocations,
  ));
});

test("structured receipt allocations reject permutations and missing credit", async () => {
  const permuted = [receiptAllocationDom[1], receiptAllocationDom[0],
    receiptAllocationDom[2], receiptAllocationDom[3]];
  await assert.rejects(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(permuted), receiptAllocations,
  ));
  await assert.rejects(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(receiptAllocationDom.slice(0, 3)), receiptAllocations,
  ));
});

test("structured receipt allocations reject any unexpected fifth row", async () => {
  const extraRow = [...receiptAllocationDom,
    { labels: ["Crédit Transport"], amounts: ["1 FCFA"] }];
  await assert.rejects(assertStructuredReceiptAllocationRows(
    structuredAllocationRows(extraRow), receiptAllocations,
  ));
});

const textLocator = (texts, siblingTexts = []) => ({
  count: async () => texts.length,
  textContent: async () => texts[0] ?? null,
  locator: selector => {
    assert.equal(selector, "xpath=following-sibling::div[1]");
    return textLocator(siblingTexts);
  },
});

const receiptDetailFixture = ({
  creditTexts = ["Crédit disponible : 1 500 FCFA"],
  remainingLabels = ["Reste à payer"],
  remainingAmounts = ["0 FCFA"],
} = {}) => ({
  getByText: (label, { exact }) => {
    if (label === "Crédit disponible") {
      assert.equal(exact, false);
      return textLocator(creditTexts);
    }
    if (label === "Reste à payer") {
      assert.equal(exact, true);
      return textLocator(remainingLabels, remainingAmounts);
    }
    return textLocator([]);
  },
});

test("receipt final credit is Unicode-safe, value-strict and receipt-scoped", async () => {
  for (const creditText of [
    "Crédit disponible : 1 500 FCFA",
    "Crédit disponible : 1\u00a0500 FCFA",
    "Crédit disponible : 1\u202f500 FCFA",
    "Crédit disponible : 1500 FCFA",
  ]) {
    await assert.doesNotReject(assertScopedReceiptLabelledCurrency(
      receiptDetailFixture({ creditTexts: [creditText] }),
      { label: "Crédit disponible", expected: 1500 },
    ));
  }

  for (const wrongCredit of [
    "Crédit disponible : 500 FCFA",
    "Crédit disponible : 15 000 FCFA",
  ]) {
    await assert.rejects(assertScopedReceiptLabelledCurrency(
      receiptDetailFixture({ creditTexts: [wrongCredit] }),
      { label: "Crédit disponible", expected: 1500 },
    ));
  }

  const unrelatedPageText = "Crédit disponible : 1 500 FCFA";
  assert.match(unrelatedPageText, /1 500 FCFA/);
  await assert.rejects(assertScopedReceiptLabelledCurrency(
    receiptDetailFixture({ creditTexts: ["Crédit disponible : 500 FCFA"] }),
    { label: "Crédit disponible", expected: 1500 },
  ));
});

test("receipt remaining reads the exact sibling amount and rejects a wrong balance", async () => {
  await assert.doesNotReject(assertScopedReceiptSiblingCurrency(
    receiptDetailFixture(),
    { label: "Reste à payer", expected: 0 },
  ));
  await assert.rejects(assertScopedReceiptSiblingCurrency(
    receiptDetailFixture({ remainingAmounts: ["1 500 FCFA"] }),
    { label: "Reste à payer", expected: 0 },
  ));
});

test("transport benefit assertion is quote-scoped, amount-strict and Tuition-isolated", () => {
  const base = {
    quoteText: "DISCOUNT_VOUCHER (LOT3-BON-1000) : - 1 000 FCFA",
    benefitTexts: ["• DISCOUNT_VOUCHER (LOT3-BON-1000) : - 1\u202f000 FCFA"],
    reference: "LOT3-BON-1000",
    benefitType: "DISCOUNT_VOUCHER",
    expectedDiscount: 1000,
    gross: 12000,
    discount: 1000,
    net: 11000,
    forbiddenReferences: ["LOT3-TUITION-ISOLATED"],
  };
  assert.doesNotThrow(() => assertTransportBenefitAppliedToQuote(base));
  assert.doesNotThrow(() => assertTransportBenefitAppliedToQuote({
    ...base,
    pageText: `${base.quoteText} Bon de réduction — 1 000 FCFA — LOT3-BON-1000 — cumulable`,
  }));
  assert.throws(() => assertTransportBenefitAppliedToQuote({
    ...base,
    quoteText: "Aucun avantage appliqué",
    benefitTexts: [],
  }));
  assert.throws(() => assertTransportBenefitAppliedToQuote({
    ...base,
    benefitTexts: ["• DISCOUNT_VOUCHER (LOT3-BON-1000) : - 2 000 FCFA"],
  }));
  assert.doesNotThrow(() => assertTransportBenefitAppliedToQuote({
    ...base,
    pageText: `${base.quoteText} LOT3-TUITION-ISOLATED`,
  }));
  assert.throws(() => assertTransportBenefitAppliedToQuote({
    ...base,
    quoteText: `${base.quoteText} LOT3-TUITION-ISOLATED`,
  }));
});

test("receipt selector targets one exact row even when receipt contents are similar", () => {
  const selector = exactReceiptRowSelector("REC-LOT3-100");
  assert.equal(selector,
    '[data-receipt-row="true"][data-receipt-number="REC-LOT3-100"]:visible');
  assert.doesNotMatch(selector, /hasText|\.first\(|\.nth\(0\)/);
  assert.notEqual(selector, exactReceiptRowSelector("REC-LOT3-1000"));
  assert.throws(() => exactReceiptRowSelector(""));
});

test("known Lot 3 text assertions are scoped to their semantic payment contexts", () => {
  assert.doesNotMatch(harness, /page\.getByText\(/);
  assert.equal((harness.match(/form\.getByText\(/g) || []).length, 1);
  assert.match(harness, /form\.getByText\("Mois \(Transport\)"/);
  assert.doesNotMatch(harness, /form\.getByText\("LOT3-BON-1000"/);
  assert.doesNotMatch(harness, /form\.getByText\("LOT3-TUITION-ISOLATED"/);
  assert.match(harness, /quote\.getByText\(\/ACTIF — dette inchangée\//);
  assert.match(harness, /receiptDetail\.getByText\("LOT3 Primaire"/);
  assert.match(harness, /assertScopedReceiptLabelledCurrency\(receiptDetail/);
  assert.match(harness, /assertScopedReceiptSiblingCurrency\(receiptDetail/);
  assert.match(transportAssertions, /receiptDetail\.getByText\(label, \{ exact: false \}\)/);
  assert.match(transportAssertions, /receiptDetail\.getByText\(label, \{ exact: true \}\)/);
  assert.doesNotMatch(harness, /\.nth\(0\)/);
  assert.match(harness, /assert\.equal\(await rows\.count\(\), 1[\s\S]*?rows\.first\(\)/);
});

test("moratorium status and dates are read only from the current quote", () => {
  const unrelatedPageText = [
    "ACTIF — dette inchangée 01/01/2025 01/02/2025",
    "ACTIF — dette inchangée 02/02/2025 02/03/2025",
  ];
  assert.equal(unrelatedPageText.length, 2);
  assert.match(harness, /quote\.getByText\(\/ACTIF — dette inchangée\//);
  assert.match(harness, /quote\.getByText\("Échéance initiale"/);
  assert.match(harness, /quote\.getByText\("Échéance effective"/);
  assert.doesNotMatch(harness, /form\.getByText\(\/ACTIF — dette inchangée\//);
  assert.doesNotMatch(harness, /form\.getByText\("Échéance (?:initiale|effective)"/);
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
