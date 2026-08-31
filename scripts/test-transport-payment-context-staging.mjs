import assert from "node:assert/strict";
import { applicationDefault, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import { deleteOwnedStudentFinanceFinal } from "./payment-forward-recovery-cleanup.mjs";
import {
  assertLabelledFrenchCurrencyAmount,
  parseFrenchCurrencyAmount,
} from "./payment-forward-recovery-currency.mjs";

dotenv.config({ path: ".env.staging" });

const PROJECT = "ecoscolaire-staging";
const ACADEMIC_YEAR = "2026-2027";
const testRunId = process.env.LOT3_TEST_RUN_ID || `local-${Date.now()}`;
assert.match(testRunId, /^[A-Za-z0-9_-]{1,128}$/);
const schoolId = `lot3-transport-payment-${testRunId}`;
assert.notEqual(schoolId, "italo-gsb");
const yearId = `lot3-year-${testRunId}`;
const classIds = {
  primary: `lot3-primary-${testRunId}`,
  secondary: `lot3-secondary-${testRunId}`,
};
const studentIds = {
  pk28: `lot3-pk28-${testRunId}`,
  pk35: `lot3-pk35-${testRunId}`,
  incomplete: `lot3-incomplete-${testRunId}`,
  secondary: `lot3-secondary-student-${testRunId}`,
};
const secretaryEmail = `lot3-${testRunId}@staging.ecoscolaire.test`;
const password = `Lot3!${Date.now()}Aa`;
const tagged = { testFixture: true, testRunId };
const periods = ["2026-09", "2026-10", "2026-11"];
const tracked = [];
const createdAuthUids = [];
let adminApp;
let db;
let adminAuth;
let browser;
let browserContext;

const track = (collection, id) => {
  tracked.push({ collection, id });
  return db.collection(collection).doc(id);
};

const stagingUrl = () => {
  assert.equal(process.env.TARGET_DEPLOYMENT_VERIFIED, "true");
  assert.match(process.env.EXPECTED_STAGING_SHA || "", /^[0-9a-f]{40}$/);
  const url = new URL(process.env.STAGING_APP_URL || "");
  assert.match(url.hostname, /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
  assert.ok(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  return url.origin;
};

const normalized = (value) => String(value || "").replace(/[\s\u00a0\u202f]+/g, " ").trim();
const waitForQuote = async (form, expectedGross) => {
  const quote = form.getByTestId("collection-quote-current");
  await quote.waitFor({ state: "visible", timeout: 30_000 });
  const gross = form.getByTestId("collection-quote-gross");
  await gross.waitFor({ state: "visible" });
  assert.equal(parseFrenchCurrencyAmount(await gross.textContent()), expectedGross);
  return quote;
};

const createStudentFixture = async ({ id, name, classId, zonePk, status, neighborhood, pickup }) => {
  await Promise.all([
    track("students", id).create({
      id, schoolId, name, matricule: `MAT-${id}`.slice(0, 80), classId,
      academicYearId: yearId, academicYear: ACADEMIC_YEAR, gender: "F",
      section: "francophone", usesTransport: true, transportStatus: status, ...tagged,
    }),
    track("studentPrivate", id).create({
      id, studentId: id, schoolId,
      ...(zonePk === undefined ? {} : { transportZonePk: zonePk }),
      transportNeighborhood: neighborhood || "", transportPickupPoint: pickup || "", ...tagged,
    }),
  ]);
};

const deleteExactOwned = async (collection, id) => {
  const ref = db.collection(collection).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  assert.ok(
    (data.testFixture === true && data.testRunId === testRunId)
      || id === `receipts_${schoolId}`
      || id.startsWith(`${schoolId}__`),
    `Refusing to delete unowned ${collection}/${id}`,
  );
  await ref.delete();
};

const cleanup = async () => {
  if (browserContext) await browserContext.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (!db) return;
  const dynamic = [
    "transportPaymentAllocations", "payments", "receipts", "financialBenefits",
    "paymentMoratoriums", "audit_logs", "cashClosures", "cashLedgerDays",
  ];
  for (const collection of dynamic) {
    const snapshot = await db.collection(collection).where("testRunId", "==", testRunId).get();
    for (const document of snapshot.docs) {
      assert.equal(document.data().testFixture, true);
      assert.equal(document.data().schoolId, schoolId);
      await document.ref.delete();
    }
  }
  for (const collection of ["cashClosures", "cashLedgerDays"]) {
    const schoolScoped = await db.collection(collection).where("schoolId", "==", schoolId).get();
    for (const document of schoolScoped.docs) {
      assert.equal(document.data().schoolId, schoolId);
      assert.notEqual(document.data().schoolId, "italo-gsb");
      await document.ref.delete();
    }
  }
  for (const { collection, id } of [...tracked].reverse()) await deleteExactOwned(collection, id);
  await new Promise(resolve => setTimeout(resolve, 750));
  await deleteOwnedStudentFinanceFinal({
    db, studentIds: Object.values(studentIds), schoolId, testRunId, verificationReads: 3,
  });
  await deleteExactOwned("counters", `receipts_${schoolId}`);
  for (const uid of createdAuthUids) await adminAuth.deleteUser(uid).catch(error => {
    if (error?.code !== "auth/user-not-found") throw error;
  });
  const residualCollections = [
    "students", "studentPrivate", "studentFinance", "payments", "receipts",
    "transportPaymentAllocations", "financialBenefits", "paymentMoratoriums",
    "audit_logs", "cashClosures", "cashLedgerDays",
  ];
  const residualCounts = {};
  for (const collection of residualCollections) {
    const field = collection === "cashClosures" || collection === "cashLedgerDays"
      ? "schoolId" : "testRunId";
    const value = field === "schoolId" ? schoolId : testRunId;
    residualCounts[collection] = (await db.collection(collection).where(field, "==", value).get()).size;
  }
  residualCounts.counters = Number((await db.collection("counters").doc(`receipts_${schoolId}`).get()).exists);
  const orphans = Object.values(residualCounts).reduce((total, count) => total + count, 0);
  assert.equal(orphans, 0);
  for (const uid of createdAuthUids) {
    await assert.rejects(adminAuth.getUser(uid), error => error?.code === "auth/user-not-found");
  }
  console.log(`CLEANUP PASS ${JSON.stringify(residualCounts)} Auth=0 orphans=${orphans}`);
};

try {
  const appUrl = stagingUrl();
  adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: PROJECT }, `lot3-${testRunId}`);
  db = getFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);
  assert.equal(adminApp.options.projectId, PROJECT);

  const secretary = await adminAuth.createUser({ email: secretaryEmail, password, displayName: "Secrétaire LOT3" });
  createdAuthUids.push(secretary.uid);
  await Promise.all([
    track("users", secretary.uid).create({
      id: secretary.uid, uid: secretary.uid, email: secretaryEmail, name: "Secrétaire LOT3",
      role: "secretary", schoolId, isActive: true, ...tagged,
    }),
    track("schools", schoolId).create({
      id: schoolId, name: "École fixture LOT3", academicYear: ACADEMIC_YEAR,
      activeAcademicYearId: yearId, active: true, subscriptionStatus: "active",
      transportPolicy: { feePolicyId: "ITALO_PK_2026", billingPeriods: periods },
      paymentDeadlines: { transport: {
        "2026-09": "2026-09-15", "2026-10": "2026-10-15", "2026-11": "2026-11-15",
      } }, ...tagged,
    }),
    track("academicYears", yearId).create({
      id: yearId, schoolId, name: ACADEMIC_YEAR, status: "active", ...tagged,
    }),
    track("classes", classIds.primary).create({
      id: classIds.primary, schoolId, name: "LOT3 Primaire", cycle: "primary",
      level: "primaire", type: "francophone", section: "francophone", isActive: true, ...tagged,
    }),
    track("classes", classIds.secondary).create({
      id: classIds.secondary, schoolId, name: "LOT3 Secondaire", cycle: "secondary",
      level: "secondaire", type: "francophone", section: "francophone", isActive: true, ...tagged,
    }),
  ]);

  await createStudentFixture({
    id: studentIds.pk28, name: "LOT3 Élève PK28", classId: classIds.primary, zonePk: 28,
    status: "active", neighborhood: "Quartier A", pickup: "Point A",
  });
  await createStudentFixture({
    id: studentIds.pk35, name: "LOT3 Élève PK35", classId: classIds.primary, zonePk: 35,
    status: "active", neighborhood: "Quartier B", pickup: "Point B",
  });
  await createStudentFixture({
    id: studentIds.incomplete, name: "LOT3 Élève incomplet", classId: classIds.primary,
    status: "needs_configuration", neighborhood: "Quartier C", pickup: "",
  });
  await createStudentFixture({
    id: studentIds.secondary, name: "LOT3 Élève secondaire", classId: classIds.secondary,
    status: "active", neighborhood: "Quartier S", pickup: "Point S",
  });

  const benefitId = `lot3-benefit-${testRunId}`;
  const moratoriumId = `lot3-moratorium-${testRunId}`;
  const priorAllocationId = `lot3-prior-${testRunId}`;
  const priorCreditId = `lot3-credit-${testRunId}`;
  await Promise.all([
    track("financialBenefits", benefitId).create({
      id: benefitId, schoolId, studentId: studentIds.pk28, academicYear: ACADEMIC_YEAR,
      requestId: `request-${benefitId}`, benefitType: "DISCOUNT_VOUCHER",
      paymentType: "TRANSPORT", mode: "FIXED_AMOUNT", value: 1000,
      transportStartPeriod: periods[0], transportEndPeriod: periods[0], stackable: true,
      status: "approved", usageCount: 0, maximumUses: 1, appliedTargets: [],
      reference: "LOT3-BON-1000", reason: "Fixture LOT3", ...tagged,
    }),
    track("paymentMoratoriums", moratoriumId).create({
      id: moratoriumId, schoolId, studentId: studentIds.pk28, academicYear: ACADEMIC_YEAR,
      paymentType: "transport", period: periods[0], status: "approved",
      originalDueDate: "2026-09-15", effectiveDueDate: "2026-12-15",
      reason: "Fixture LOT3", ...tagged,
    }),
    track("transportPaymentAllocations", priorAllocationId).create({
      id: priorAllocationId, allocationId: priorAllocationId, schoolId, studentId: studentIds.pk28,
      academicYear: ACADEMIC_YEAR, paymentId: `seed-payment-${testRunId}`,
      receiptId: `seed-payment-${testRunId}`, kind: "INSTALLMENT", period: periods[0],
      amount: 1000, status: "POSTED", sequence: 0, byTransportPaymentEngine: true, ...tagged,
    }),
    track("transportPaymentAllocations", priorCreditId).create({
      id: priorCreditId, allocationId: priorCreditId, schoolId, studentId: studentIds.pk28,
      academicYear: ACADEMIC_YEAR, paymentId: `seed-credit-${testRunId}`,
      receiptId: `seed-credit-${testRunId}`, kind: "CREDIT", period: null,
      amount: 500, status: "POSTED", sequence: 0, byTransportPaymentEngine: true, ...tagged,
    }),
  ]);

  browser = await chromium.launch({ headless: true });
  browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  await page.route(`${appUrl}/**`, route => route.continue({ headers: {
    ...route.request().headers(),
    "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    "x-vercel-set-bypass-cookie": "true",
  } }));
  await page.goto(`${appUrl}/#/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByTestId("login-email").fill(secretaryEmail);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 30_000 });
  await page.goto(`${appUrl}/#/payments`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("open-cash-payment").click();
  const form = page.getByTestId("cash-payment-student").locator("xpath=ancestor::form[1]");
  await form.getByTestId("cash-payment-student").selectOption(studentIds.pk28);
  await form.getByTestId("cash-payment-type").selectOption("transport");
  await waitForQuote(form, 12_000);
  assert.equal(normalized(await form.getByTestId("transport-student-class").textContent()), "LOT3 Primaire");
  assert.equal(normalized(await form.getByTestId("transport-zone-pk").textContent()), "PK28");
  assert.equal(normalized(await form.getByTestId("transport-neighborhood").textContent()), "Quartier A");
  assert.equal(normalized(await form.getByTestId("transport-pickup").textContent()), "Point A");
  assert.match(normalized(await form.getByTestId("transport-policy").textContent()), /ITALO PK/);
  assertLabelledFrenchCurrencyAmount(await form.getByTestId("transport-rate").textContent(), {
    label: "Tarif applicable", expected: 4000, suffix: "/ période",
  });
  assert.equal(await form.getByTestId("transport-installments-scroll").locator("tbody tr").count(), 3);
  await form.getByText("LOT3-BON-1000", { exact: false }).waitFor();
  await form.getByText(/ACTIF — dette inchangée/).waitFor();
  assertLabelledFrenchCurrencyAmount(await form.getByTestId("transport-existing-credit").textContent(), {
    label: "Crédit existant", expected: 500,
  });
  assert.equal(await form.getByText("Mois (Transport)", { exact: false }).count(), 0);

  await form.getByTestId("cash-payment-amount").fill("11000");
  await form.getByTestId("transport-payment-preview").waitFor({ state: "visible" });
  assertLabelledFrenchCurrencyAmount(await form.getByTestId("transport-generated-credit").textContent(), {
    label: "Crédit généré", expected: 1000,
  });
  assertLabelledFrenchCurrencyAmount(await form.getByTestId("transport-final-credit").textContent(), {
    label: "Crédit final prévu", expected: 1500,
  });

  await form.getByTestId("cash-payment-student").selectOption(studentIds.pk35);
  await waitForQuote(form, 15_000);
  assertLabelledFrenchCurrencyAmount(await form.getByTestId("transport-rate").textContent(), {
    label: "Tarif applicable", expected: 5000, suffix: "/ période",
  });
  await form.getByTestId("cash-payment-student").selectOption(studentIds.secondary);
  await form.getByTestId("transport-free-secondary").waitFor({ state: "visible" });
  assert.match(normalized(await form.getByTestId("transport-rate").textContent()), /Gratuit — Secondaire/);
  assert.equal(await form.getByTestId("cash-payment-submit").isDisabled(), true);
  await form.getByTestId("cash-payment-student").selectOption(studentIds.incomplete);
  await form.getByTestId("transport-configuration-incomplete").waitFor({ state: "visible" });
  assert.equal(await form.getByTestId("cash-payment-submit").isDisabled(), true);

  await form.getByTestId("cash-payment-student").selectOption(studentIds.pk28);
  await waitForQuote(form, 12_000);
  await form.getByTestId("cash-payment-amount").fill("11000");
  page.once("dialog", dialog => dialog.accept());
  await form.getByTestId("cash-payment-submit").click();
  await page.getByTestId("modal-content").waitFor({ state: "hidden", timeout: 30_000 });
  const receiptSnapshot = await db.collection("receipts").where("testRunId", "==", testRunId).get();
  const ownedReceipts = receiptSnapshot.docs.filter(document => document.data().studentId === studentIds.pk28);
  assert.equal(ownedReceipts.length, 1);
  const receiptDocument = ownedReceipts[0];
  const receipt = receiptDocument.data();
  assert.deepEqual(receipt.transportContext, {
    zonePk: 28, neighborhood: "Quartier A", pickupPoint: "Point A",
    feePolicyId: "ITALO_PK_2026", monthlyGrossAmount: 4000,
    transportState: "BILLABLE", billingPeriods: periods,
  });
  assert.equal(receipt.transportCredit, 1500);
  await page.getByRole("button", { name: "Reçus", exact: true }).click();
  await page.getByText(receipt.receiptNumber, { exact: true }).waitFor({ timeout: 20_000 });
  const receiptRow = page.locator('[data-receipt-row="true"]:visible').filter({ hasText: receipt.receiptNumber });
  const toggle = receiptRow.getByTestId(`receipt-detail-toggle-${receiptDocument.id}`);
  await toggle.click();
  const receiptContext = page.getByTestId(`transport-receipt-context-${receiptDocument.id}`);
  await receiptContext.waitFor({ state: "visible" });
  assert.match(normalized(await receiptContext.textContent()), /PK28.*Quartier A.*Point A.*ITALO PK.*4 000 FCFA/s);
  console.log(`LOT3_UI PASS staging_sha=${process.env.EXPECTED_STAGING_SHA} receipt=${receipt.receiptNumber}`);
} finally {
  await cleanup();
  if (adminApp) await deleteAdminApp(adminApp).catch(() => {});
}
