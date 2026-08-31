import assert from "node:assert/strict";
import {
  applicationDefault,
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import { deleteOwnedFixtureAudits } from "./payment-forward-recovery-cleanup.mjs";
import { assertFrenchCurrencyAmount } from "./payment-forward-recovery-currency.mjs";

dotenv.config({ path: ".env.staging" });

const PROJECT = "ecoscolaire-staging";
const ACADEMIC_YEAR = "2026-2027";
const ORIGINAL_DUE_DATE = "2026-09-15";
const EFFECTIVE_DUE_DATE = "2026-12-15";
const suffix = `lot1-${Date.now()}`;
const schoolId = `lot1-payment-recovery-${suffix}`;
const otherSchoolId = `lot1-payment-recovery-other-${suffix}`;
assert.notEqual(schoolId, "italo-gsb");
assert.notEqual(otherSchoolId, "italo-gsb");

const password = `Lot1!${Date.now()}Aa`;
const secretaryEmail = `${suffix}@staging.ecoscolaire.test`;
const otherEmail = `${suffix}-other@staging.ecoscolaire.test`;
const yearId = `lot1-year-${suffix}`;
const classIds = {
  a85: `lot1-class-85-${suffix}`,
  b120: `lot1-class-120-${suffix}`,
  c2: `lot1-class-2-${suffix}`,
};
const studentIds = {
  main: `lot1-student-main-${suffix}`,
  b120: `lot1-student-120-${suffix}`,
  c2: `lot1-student-2-${suffix}`,
};
const benefitIds = {
  fixed: `lot1-benefit-fixed-${suffix}`,
  percentage: `lot1-benefit-pct-${suffix}`,
};
const moratoriumId = `lot1-moratorium-${suffix}`;
const paymentId = `lot1-partial-${suffix}`;
const tracked = [];
const createdAuthUids = [];
let adminApp;
let clientApp;
let otherClientApp;
let db;
let adminAuth;
let browser;
let browserContext;
let cleanupStarted = false;

const track = (collection, id) => {
  tracked.push({ collection, id });
  return db.collection(collection).doc(id);
};

const businessCode = (error) => error?.details?.businessCode || null;
const expectFailure = async (operation, expected) => {
  try {
    await operation();
    assert.fail(`Expected failure ${expected}`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
    assert.equal(
      businessCode(error),
      expected,
      `Unexpected failure ${error?.code}/${businessCode(error)}`,
    );
  }
};

const requireStagingAppUrl = () => {
  assert.match(
    process.env.EXPECTED_STAGING_SHA || "",
    /^[0-9a-f]{40}$/,
    "The explicitly requested Staging SHA is invalid.",
  );
  assert.equal(
    process.env.TARGET_DEPLOYMENT_VERIFIED,
    "true",
    "The exact target deployment was not verified.",
  );
  const url = new URL(process.env.STAGING_APP_URL || "");
  assert.equal(url.protocol, "https:");
  assert.match(
    url.hostname,
    /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/,
  );
  assert.ok(
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    "Missing Vercel automation bypass secret.",
  );
  return url.origin;
};

const normalizedText = (value) =>
  String(value || "")
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();

const assertValueCard = async (form, label, expected) => {
  const card = form.locator("small", { hasText: label }).last().locator("..");
  await card.waitFor({ state: "visible", timeout: 20_000 });
  await card.getByText(expected).waitFor({ state: "visible", timeout: 20_000 });
  assert.match(normalizedText(await card.textContent()), expected);
};

const assertCurrencyCard = async (form, label, expectedAmount) => {
  const card = form.locator("small", { hasText: label }).last().locator("..");
  await card.waitFor({ state: "visible", timeout: 20_000 });
  const value = card.locator("strong");
  await value.waitFor({ state: "visible", timeout: 20_000 });
  assertFrenchCurrencyAmount(await value.textContent(), expectedAmount);
};

const validateUi = async () => {
  const appUrl = requireStagingAppUrl();
  browser = await chromium.launch({ headless: true });
  browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  await page.route(`${appUrl}/**`, async (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass":
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        "x-vercel-set-bypass-cookie": "true",
      },
    }),
  );

  const quoteRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("getCollectionQuote"))
      quoteRequests.push(request.url());
  });

  await page.goto(`${appUrl}/#/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((items) => items.map((item) => item.src));
  const bundle = scripts.find((url) =>
    /\/assets\/index-[^/]+\.js(?:\?|$)/.test(url),
  );
  assert.ok(
    bundle,
    "The immutable deployment did not expose the expected hashed application bundle.",
  );
  console.log(`BUNDLE_VERSION ${bundle}`);

  await page.getByTestId("login-email").fill(secretaryEmail);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page
    .getByTestId("sidebar")
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.goto(`${appUrl}/#/payments`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .getByRole("heading", { name: /Comptabilité Générale/i })
    .waitFor({ timeout: 30_000 });
  await page
    .getByRole("button", { name: /Encaissement/i })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Nouvel Encaissement" })
    .waitFor({ timeout: 20_000 });

  const form = page
    .locator("form")
    .filter({ has: page.getByTestId("cash-payment-student") });
  await page.getByTestId("cash-payment-student").selectOption(studentIds.main);
  await page.getByTestId("cash-payment-type").selectOption("tuition");
  const installment = form.getByTestId("tuition-installment-select");
  const labeledInstallment = form.getByLabel("Choix de la Tranche");
  await labeledInstallment.waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(
    await labeledInstallment.getAttribute("data-testid"),
    "tuition-installment-select",
  );
  await assert.doesNotReject(() =>
    form.getByRole("combobox", { name: "Choix de la Tranche" }).waitFor({
      state: "visible",
      timeout: 20_000,
    }),
  );
  assert.deepEqual(
    await installment.locator("option").evaluateAll((options) =>
      options.map((option) => option.value),
    ),
    ["T1", "T2", "T3"],
  );
  await installment.selectOption("T1");
  assert.equal(await installment.inputValue(), "T1");
  const optionValues = () => installment.locator("option").evaluateAll((options) =>
    options.map((option) => option.value),
  );
  await form
    .getByText("Situation financière calculée par le serveur")
    .waitFor({ timeout: 20_000 });
  await assertCurrencyCard(form, "Tarif de référence", 40_000);

  await installment.selectOption("T2");
  await assertCurrencyCard(form, "Tarif de référence", 30_000);
  await installment.selectOption("T3");
  await assertCurrencyCard(form, "Tarif de référence", 15_000);
  console.log("UI_85K_INSTALLMENTS PASS T1=40000 T2=30000 T3=15000");

  await page.getByTestId("cash-payment-student").selectOption(studentIds.b120);
  await installment.locator('option[value="T3"]').waitFor({
    state: "attached",
    timeout: 20_000,
  });
  assert.deepEqual(await optionValues(), ["T1", "T2", "T3"]);
  await installment.selectOption("T1");
  await assertCurrencyCard(form, "Tarif de référence", 60_000);
  await assertCurrencyCard(form, "Bourse / réduction applicable", -6_000);
  await assertCurrencyCard(form, "Montant réellement dû", 54_000);
  await installment.selectOption("T2");
  await assertCurrencyCard(form, "Tarif de référence", 40_000);
  await installment.selectOption("T3");
  await assertCurrencyCard(form, "Tarif de référence", 20_000);
  console.log("UI_120K_INSTALLMENTS PASS T1=60000 T2=40000 T3=20000");

  await page.getByTestId("cash-payment-student").selectOption(studentIds.c2);
  await installment.locator('option[value="T3"]').waitFor({
    state: "detached",
    timeout: 20_000,
  });
  assert.deepEqual(await optionValues(), ["T1", "T2"]);
  await installment.selectOption("T1");
  await assertCurrencyCard(form, "Tarif de référence", 50_000);
  await installment.selectOption("T2");
  await assertCurrencyCard(form, "Tarif de référence", 35_000);
  console.log("UI_TWO_INSTALLMENT PASS T1 T2 ONLY");

  await page.getByTestId("cash-payment-student").selectOption(studentIds.main);
  await installment.locator('option[value="T3"]').waitFor({
    state: "attached",
    timeout: 20_000,
  });
  assert.deepEqual(await optionValues(), ["T1", "T2", "T3"]);
  await installment.selectOption("T1");
  await assertCurrencyCard(form, "Tarif de référence", 40_000);
  await assertCurrencyCard(
    form,
    "Bourse / réduction applicable",
    -5_000,
  );
  await assertCurrencyCard(form, "Montant réellement dû", 35_000);
  await assertCurrencyCard(form, "Sommes déjà versées", 10_000);
  await assertCurrencyCard(form, "Reste à payer", 25_000);
  await assertValueCard(form, "Échéance initiale", /15\/09\/2026/);
  await assertValueCard(form, "Échéance effective", /15\/12\/2026/);
  await assertValueCard(form, "Moratoire", /ACTIF — dette inchangée/);
  assert.equal(
    await form.getByText("Mois (Transport)", { exact: true }).count(),
    0,
  );
  assert.equal(
    await form.getByText("Montant attendu", { exact: true }).count(),
    0,
  );
  assert.ok(
    quoteRequests.length > 0,
    "No server-side getCollectionQuote request was observed.",
  );

  const visibleClass = page.getByText("LOT1 Classe 85K", { exact: true });
  assert.ok(
    (await visibleClass.count()) > 0,
    "The selected student class is not visible in the current payment UI.",
  );
  await visibleClass.first().waitFor({ state: "visible", timeout: 10_000 });
  console.log("UI_CLASS PASS LOT1 Classe 85K");
  console.log("UI_INSTALLMENT PASS T1");
  console.log("UI_EXPECTED_AMOUNT PASS 40000");
  console.log("UI_GROSS PASS 40000");
  console.log("UI_BENEFIT PASS 5000");
  console.log("UI_NET PASS 35000");
  console.log(`UI_ORIGINAL_DUE_DATE PASS ${ORIGINAL_DUE_DATE}`);
  console.log(`UI_EFFECTIVE_DUE_DATE PASS ${EFFECTIVE_DUE_DATE}`);
  console.log("UI_MORATORIUM PASS ACTIVE");
  console.log("UI_PREVIOUS_PAID PASS 10000");
  console.log("UI_REMAINING PASS 25000");
  console.log("LEGACY_FORM_DETECTED NO");
};

const cleanup = async () => {
  if (cleanupStarted) return;
  cleanupStarted = true;
  try {
    await deleteOwnedFixtureAudits({
      db,
      testRunId: suffix,
      schoolIds: [schoolId, otherSchoolId],
      actorUids: [...createdAuthUids],
      targetIds: [
        ...new Set([
          ...createdAuthUids,
          ...tracked.map(({ id }) => id),
        ]),
      ],
    });
    for (const item of [...tracked].reverse()) {
      await db.collection(item.collection).doc(item.id).delete();
    }
    for (const uid of createdAuthUids) {
      try {
        await adminAuth.deleteUser(uid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
    }

    const residuals = {};
    for (const { collection, id } of tracked) {
      residuals[collection] =
        (residuals[collection] || 0) +
        Number((await db.collection(collection).doc(id).get()).exists);
    }
    residuals.Auth = 0;
    for (const uid of createdAuthUids) {
      try {
        await adminAuth.getUser(uid);
        residuals.Auth += 1;
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
    }
    const [audit, cashClosures, cashLedgerDays, counters] = await Promise.all([
      db.collection("audit_logs").where("testRunId", "==", suffix).get(),
      db.collection("cashClosures").where("testRunId", "==", suffix).get(),
      db.collection("cashLedgerDays").where("testRunId", "==", suffix).get(),
      db.collection("counters").where("testRunId", "==", suffix).get(),
    ]);
    residuals.audit = audit.size;
    residuals.cashClosures = cashClosures.size;
    residuals.cashLedgerDays = cashLedgerDays.size;
    residuals.counters = counters.size;
    const total = Object.values(residuals).reduce(
      (sum, value) => sum + value,
      0,
    );
    assert.equal(total, 0, `Cleanup residuals: ${JSON.stringify(residuals)}`);
    console.log(
      `CLEANUP ${JSON.stringify({ residuals: total, orphans: 0, ...residuals })}`,
    );
  } finally {
    if (browserContext) await browserContext.close();
    if (browser) await browser.close();
    if (clientApp) {
      const auth = getAuth(clientApp);
      if (auth.currentUser) await signOut(auth);
      await deleteApp(clientApp);
    }
    if (otherClientApp) {
      const auth = getAuth(otherClientApp);
      if (auth.currentUser) await signOut(auth);
      await deleteApp(otherClientApp);
    }
    if (adminApp) await deleteAdminApp(adminApp);
  }
};

try {
  assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, PROJECT);
  adminApp = initializeAdminApp(
    { credential: applicationDefault(), projectId: PROJECT },
    `lot1-admin-${suffix}`,
  );
  db = getFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);

  const secretary = await adminAuth.createUser({
    email: secretaryEmail,
    password,
    disabled: false,
  });
  createdAuthUids.push(secretary.uid);
  const otherSecretary = await adminAuth.createUser({
    email: otherEmail,
    password,
    disabled: false,
  });
  createdAuthUids.push(otherSecretary.uid);

  const tagged = { testFixture: true, testRunId: suffix };
  await Promise.all([
    track("users", secretary.uid).create({
      id: secretary.uid,
      email: secretaryEmail,
      role: "secretary",
      schoolId,
      active: true,
      isActive: true,
      ...tagged,
    }),
    track("users", otherSecretary.uid).create({
      id: otherSecretary.uid,
      email: otherEmail,
      role: "secretary",
      schoolId: otherSchoolId,
      active: true,
      isActive: true,
      ...tagged,
    }),
    track("schools", schoolId).create({
      id: schoolId,
      name: "École fixture LOT 1 Payment Recovery",
      academicYear: ACADEMIC_YEAR,
      activeAcademicYearId: yearId,
      active: true,
      subscriptionStatus: "active",
      studentsCount: 3,
      studentLimit: 20,
      globalFees: { feeT1: 0, feeT2: 0, feeT3: 0 },
      classFees: {
        "LOT1 Classe 85K": {
          tuition: 85_000,
          t1: 40_000,
          t2: 30_000,
          t3: 15_000,
        },
        "LOT1 Classe 120K": {
          tuition: 120_000,
          t1: 60_000,
          t2: 40_000,
          t3: 20_000,
        },
        "LOT1 Classe 2 tranches": {
          tuition: 85_000,
          t1: 50_000,
          t2: 35_000,
          t3: 0,
        },
      },
      ...tagged,
    }),
    track("schools", otherSchoolId).create({
      id: otherSchoolId,
      name: "Autre école fixture LOT 1",
      academicYear: ACADEMIC_YEAR,
      active: true,
      subscriptionStatus: "active",
      ...tagged,
    }),
    track("academicYears", yearId).create({
      id: yearId,
      schoolId,
      name: ACADEMIC_YEAR,
      status: "active",
      tuitionPaymentDeadlines: {
        T1: ORIGINAL_DUE_DATE,
        T2: "2027-01-15",
        T3: "2027-04-15",
      },
      ...tagged,
    }),
    track("classes", classIds.a85).create({
      id: classIds.a85,
      schoolId,
      name: "LOT1 Classe 85K",
      level: "primary",
      cycle: "primary",
      section: "francophone",
      isActive: true,
      ...tagged,
    }),
    track("classes", classIds.b120).create({
      id: classIds.b120,
      schoolId,
      name: "LOT1 Classe 120K",
      level: "primary",
      cycle: "primary",
      section: "francophone",
      isActive: true,
      ...tagged,
    }),
    track("classes", classIds.c2).create({
      id: classIds.c2,
      schoolId,
      name: "LOT1 Classe 2 tranches",
      level: "primary",
      cycle: "primary",
      section: "francophone",
      isActive: true,
      ...tagged,
    }),
  ]);

  const studentDocs = [
    [studentIds.main, classIds.a85, "Élève fixture LOT1 principal"],
    [studentIds.b120, classIds.b120, "Élève fixture LOT1 120K"],
    [studentIds.c2, classIds.c2, "Élève fixture LOT1 2 tranches"],
  ];
  await Promise.all(
    studentDocs.flatMap(([id, classId, name]) => [
      track("students", id).create({
        id,
        schoolId,
        name,
        matricule: `MAT-${id}`.slice(0, 80),
        classId,
        academicYearId: yearId,
        academicYear: ACADEMIC_YEAR,
        gender: "F",
        section: "francophone",
        isActive: true,
        usesTransport: false,
        ...tagged,
      }),
      track("studentFinance", id).create({
        id,
        studentId: id,
        schoolId,
        feeT1: 0,
        feeT2: 0,
        feeT3: 0,
        registrationFeeExpected: 15_000,
        registrationFeePaid: 0,
        ...tagged,
      }),
    ]),
  );

  await Promise.all([
    track("financialBenefits", benefitIds.fixed).create({
      id: benefitIds.fixed,
      schoolId,
      studentId: studentIds.main,
      academicYear: ACADEMIC_YEAR,
      requestId: `request-${benefitIds.fixed}`,
      benefitType: "SCHOLARSHIP",
      paymentType: "TUITION",
      mode: "FIXED_AMOUNT",
      value: 5_000,
      installment: "T1",
      stackable: true,
      status: "approved",
      usageCount: 0,
      maximumUses: 1,
      appliedTargets: [],
      reason: "Fixture LOT 1",
      ...tagged,
    }),
    track("financialBenefits", benefitIds.percentage).create({
      id: benefitIds.percentage,
      schoolId,
      studentId: studentIds.b120,
      academicYear: ACADEMIC_YEAR,
      requestId: `request-${benefitIds.percentage}`,
      benefitType: "EXCEPTIONAL_DISCOUNT",
      paymentType: "TUITION",
      mode: "PERCENTAGE",
      value: 10,
      installment: "T1",
      stackable: true,
      status: "approved",
      usageCount: 0,
      maximumUses: 1,
      appliedTargets: [],
      reason: "Fixture LOT 1",
      ...tagged,
    }),
    track("paymentMoratoriums", moratoriumId).create({
      id: moratoriumId,
      schoolId,
      studentId: studentIds.main,
      academicYear: ACADEMIC_YEAR,
      paymentType: "tuition",
      installment: "T1",
      status: "approved",
      originalDueDate: ORIGINAL_DUE_DATE,
      effectiveDueDate: EFFECTIVE_DUE_DATE,
      reason: "Fixture LOT 1",
      ...tagged,
    }),
    track("payments", paymentId).create({
      id: paymentId,
      schoolId,
      studentId: studentIds.main,
      academicYear: ACADEMIC_YEAR,
      type: "tuition",
      installment: "T1",
      amount: 10_000,
      method: "cash",
      status: "completed",
      date: "2026-08-30",
      createdAt: FieldValue.serverTimestamp(),
      ...tagged,
    }),
  ]);

  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };
  clientApp = initializeApp(config, `lot1-client-${suffix}`);
  const clientAuth = getAuth(clientApp);
  await signInWithEmailAndPassword(clientAuth, secretaryEmail, password);
  const quote = httpsCallable(
    getFunctions(clientApp, "us-central1"),
    "getCollectionQuote",
  );
  const getQuote = async (studentId, installment) =>
    (
      await quote({
        schoolId,
        studentId,
        academicYear: ACADEMIC_YEAR,
        type: "tuition",
        installment,
      })
    ).data;

  const aT1 = await getQuote(studentIds.main, "T1");
  const aT2 = await getQuote(studentIds.main, "T2");
  const aT3 = await getQuote(studentIds.main, "T3");
  assert.deepEqual(
    [aT1.grossExpectedAmount, aT2.grossExpectedAmount, aT3.grossExpectedAmount],
    [40_000, 30_000, 15_000],
  );
  console.log("85K_CLASS PASS T1=40000 T2=30000 T3=15000");

  const bT1 = await getQuote(studentIds.b120, "T1");
  const bT2 = await getQuote(studentIds.b120, "T2");
  const bT3 = await getQuote(studentIds.b120, "T3");
  assert.deepEqual(
    [bT1.grossExpectedAmount, bT2.grossExpectedAmount, bT3.grossExpectedAmount],
    [60_000, 40_000, 20_000],
  );
  console.log("120K_CLASS PASS T1=60000 T2=40000 T3=20000");

  const cT1 = await getQuote(studentIds.c2, "T1");
  const cT2 = await getQuote(studentIds.c2, "T2");
  assert.deepEqual(
    [cT1.grossExpectedAmount, cT2.grossExpectedAmount],
    [50_000, 35_000],
  );
  await expectFailure(
    () => getQuote(studentIds.c2, "T3"),
    "GROSS_AMOUNT_NOT_CONFIGURED",
  );
  console.log("TWO_INSTALLMENT PASS T1=50000 T2=35000 T3=DENY");

  assert.equal(aT2.grossExpectedAmount, 30_000);
  assert.equal(bT2.grossExpectedAmount, 40_000);
  console.log(
    "ZERO_PROJECTION_FALLBACK PASS studentFinance=0 globalFees=0 classFees=USED",
  );
  console.log("DIFFERENT_CLASS_TARIFFS PASS 85K_T2=30000 120K_T2=40000");

  assert.deepEqual(
    {
      gross: aT1.grossExpectedAmount,
      discount: aT1.discountAmount,
      net: aT1.netExpectedAmount,
      paid: aT1.previousPaid,
      remaining: aT1.remainingBalance,
    },
    {
      gross: 40_000,
      discount: 5_000,
      net: 35_000,
      paid: 10_000,
      remaining: 25_000,
    },
  );
  assert.deepEqual(
    {
      gross: bT1.grossExpectedAmount,
      discount: bT1.discountAmount,
      net: bT1.netExpectedAmount,
    },
    { gross: 60_000, discount: 6_000, net: 54_000 },
  );
  console.log("BENEFITS PASS fixed=5000 percentage=6000");
  console.log("PARTIAL PASS previousPaid=10000 remaining=25000");

  assert.equal(aT1.originalDueDate, ORIGINAL_DUE_DATE);
  assert.equal(aT1.effectiveDueDate, EFFECTIVE_DUE_DATE);
  assert.equal(aT1.grossExpectedAmount, 40_000);
  assert.equal(aT1.remainingBalance, 25_000);
  assert.equal(aT1.moratoriumStatus, "ACTIVE");
  console.log(
    `MORATORIUM PASS original=${ORIGINAL_DUE_DATE} effective=${EFFECTIVE_DUE_DATE} gross=40000 remaining=25000`,
  );

  otherClientApp = initializeApp(config, `lot1-other-client-${suffix}`);
  await signInWithEmailAndPassword(
    getAuth(otherClientApp),
    otherEmail,
    password,
  );
  const otherQuote = httpsCallable(
    getFunctions(otherClientApp, "us-central1"),
    "getCollectionQuote",
  );
  await expectFailure(
    () =>
      otherQuote({
        schoolId,
        studentId: studentIds.main,
        academicYear: ACADEMIC_YEAR,
        type: "tuition",
        installment: "T1",
      }),
    "CROSS_SCHOOL_DENIED",
  );
  console.log("CROSS_SCHOOL PASS DENY");
  console.log("BACKEND_LOT1 PASS");

  await validateUi();
  console.log("LOT1_STAGING_UI PASS");
  await cleanup();
} catch (error) {
  console.error(
    `VALIDATION_FAIL ${error?.code || "UNKNOWN"} ${businessCode(error) || ""} ${error?.message || error}`,
  );
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(`CLEANUP_FAIL ${cleanupError?.message || cleanupError}`);
  }
  process.exitCode = 1;
}
