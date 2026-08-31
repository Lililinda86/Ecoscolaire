import assert from "node:assert/strict";
import {
  applicationDefault,
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "@playwright/test";
import { deleteOwnedFixtureAudits } from "./payment-forward-recovery-cleanup.mjs";
import { selectStudentClassOption } from "./select-student-class-option.mjs";

const PROJECT = "ecoscolaire-staging";
const ACADEMIC_YEAR = "2026-2027";
const testRunId = process.env.LOT2_TEST_RUN_ID || "";
assert.match(testRunId, /^[0-9]+-[0-9]+$/);
const schoolId = "lot2-transport-student-staging-" + testRunId;
assert.notEqual(schoolId, "italo-gsb");
const yearId = "lot2-year-" + testRunId;
const classIds = {
  primary: "lot2-primary-" + testRunId,
  secondary: "lot2-secondary-" + testRunId,
};
const matricules = {
  main: "LOT2-MAIN-" + testRunId,
  incomplete: "LOT2-INCOMPLETE-" + testRunId,
  secondary: "LOT2-SECONDARY-" + testRunId,
};
const password = "Lot2!" + testRunId + "Aa";
const secretaryEmail = "lot2-" + testRunId + "@staging.ecoscolaire.test";
const tagged = { testFixture: true, testRunId };

let adminApp;
let db;
let adminAuth;
let secretaryUid;
let browser;
let browserContext;
const studentIds = new Set();
const tracked = [];

const track = (collection, id) => {
  tracked.push({ collection, id });
  return db.collection(collection).doc(id);
};

const normalizedText = (value) =>
  String(value || "").replace(/[\s\u00a0\u202f]+/g, " ").trim();

const requireStagingAppUrl = () => {
  assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, PROJECT);
  assert.match(process.env.EXPECTED_STAGING_SHA || "", /^[0-9a-f]{40}$/);
  assert.equal(process.env.TARGET_DEPLOYMENT_VERIFIED, "true");
  const url = new URL(process.env.STAGING_APP_URL || "");
  assert.equal(url.protocol, "https:");
  assert.match(
    url.hostname,
    /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/,
  );
  assert.ok(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  return url.origin;
};

const waitForStudentByMatricule = async (matricule) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const snapshot = await db.collection("students").where("schoolId", "==", schoolId).get();
    const match = snapshot.docs.find((document) => document.data().matricule === matricule);
    if (match) {
      studentIds.add(match.id);
      return { id: match.id, ...match.data() };
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail("Student " + matricule + " was not persisted.");
};

const readStudentContext = async (studentId) => {
  const [student, privateDocument, finance] = await Promise.all([
    db.collection("students").doc(studentId).get(),
    db.collection("studentPrivate").doc(studentId).get(),
    db.collection("studentFinance").doc(studentId).get(),
  ]);
  assert.equal(student.exists, true);
  assert.equal(finance.exists, true);
  return {
    student: student.data(),
    privateData: privateDocument.exists ? privateDocument.data() : null,
    finance: finance.data(),
  };
};

const studentForm = (page) =>
  page.locator("form").filter({ has: page.getByText(/Étape [1-4] sur 4/) }).last();

const fillRequiredSteps = async ({ page, matricule, lastName, firstName, classId, className }) => {
  const form = studentForm(page);
  await form.locator('input[placeholder="Laisser vide pour générer automatiquement"]').fill(matricule);
  await form.locator('input[placeholder="Ex: N’GONO"]').fill(lastName);
  await form.locator('input[placeholder="Ex: Mballa Élise"]').fill(firstName);
  await form.locator('input[type="date"]').fill("2015-02-10");
  await form.getByRole("button", { name: "Suivant" }).click();
  await selectStudentClassOption({ form, classId, expectedLabel: className });
  await form.getByRole("button", { name: "Suivant" }).click();
  const required = form.locator("input[required]");
  await required.nth(0).fill("Responsable " + lastName);
  await required.nth(1).fill("+237650336558");
  await form.getByRole("button", { name: "Suivant" }).click();
  await form.getByLabel("Aucune allergie ou condition médicale connue à signaler").check();
  return form;
};

const configureTransport = async (form, { enabled, pk, neighborhood, pickup }) => {
  const checkbox = form.getByLabel("Utilise le transport scolaire");
  if (enabled) await checkbox.check();
  else await checkbox.uncheck();
  if (pk !== undefined) await form.getByTestId("student-transport-zone-pk").fill(String(pk));
  if (neighborhood !== undefined) {
    await form.getByTestId("student-transport-neighborhood").fill(neighborhood);
  }
  if (pickup !== undefined) {
    await form.getByTestId("student-transport-pickup-point").fill(pickup);
  }
};

const saveStudentForm = async (page, form) => {
  await form.getByRole("button", { name: "Enregistrer" }).click();
  await form.waitFor({ state: "hidden", timeout: 30_000 });
  await page.getByRole("button", { name: "Ajouter un élève" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
};

const createStudentViaUi = async (page, options) => {
  await page.getByRole("button", { name: "Ajouter un élève" }).click();
  const form = await fillRequiredSteps({ page, ...options });
  await configureTransport(form, options.transport);
  const summary = normalizedText(await form.getByTestId("student-transport-summary").textContent());
  assert.match(summary, options.expectedSummary);
  await saveStudentForm(page, form);
  return waitForStudentByMatricule(options.matricule);
};

const openStudentForEdit = async (page, matricule) => {
  const search = page.getByLabel("Rechercher un élève");
  await search.fill(matricule);
  const row = page.locator("tbody tr").filter({ hasText: matricule });
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.getByRole("button", { name: /Actions pour/ }).click();
  await row.locator('[data-action="edit-student"]').click();
  const form = studentForm(page);
  await form.waitFor({ state: "visible", timeout: 20_000 });
  await form.getByRole("button", { name: "Suivant" }).click();
  await form.getByRole("button", { name: "Suivant" }).click();
  await form.getByRole("button", { name: "Suivant" }).click();
  return form;
};

const reloadAndOpen = async (page, matricule) => {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("heading", { name: "Élèves" }).waitFor({ timeout: 30_000 });
  return openStudentForEdit(page, matricule);
};

const assertTransportState = async (form, {
  enabled, pk, neighborhood, pickup, status,
}) => {
  assert.equal(await form.getByLabel("Utilise le transport scolaire").isChecked(), enabled);
  const summary = normalizedText(await form.getByTestId("student-transport-summary").textContent());
  assert.match(summary, new RegExp("Transport : " + (enabled ? "Oui" : "Non")));
  if (enabled) {
    assert.equal(await form.getByTestId("student-transport-zone-pk").inputValue(), pk || "");
    assert.equal(
      await form.getByTestId("student-transport-neighborhood").inputValue(),
      neighborhood || "",
    );
    assert.equal(
      await form.getByTestId("student-transport-pickup-point").inputValue(),
      pickup || "",
    );
    assert.match(summary, new RegExp("Statut Transport : " + status));
  }
};

const validateUi = async () => {
  const appUrl = requireStagingAppUrl();
  browser = await chromium.launch({ headless: true });
  browserContext = await browser.newContext();
  const page = await browserContext.newPage();
  await page.route(appUrl + "/**", async (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        "x-vercel-set-bypass-cookie": "true",
      },
    }),
  );
  page.on("dialog", async (dialog) => dialog.accept());

  await page.goto(appUrl + "/#/login", { waitUntil: "domcontentloaded", timeout: 30_000 });
  const scripts = await page.locator("script[src]").evaluateAll((items) =>
    items.map((item) => item.src));
  const bundle = scripts.find((url) => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(url));
  assert.ok(bundle);
  console.log(
    "BUNDLE_VERSION sha=" + process.env.EXPECTED_STAGING_SHA + " bundle=" + bundle,
  );

  await page.getByTestId("login-email").fill(secretaryEmail);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("sidebar").waitFor({ state: "visible", timeout: 30_000 });
  await page.goto(appUrl + "/#/students", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("heading", { name: "Élèves" }).waitFor({ timeout: 30_000 });

  const main = await createStudentViaUi(page, {
    matricule: matricules.main,
    lastName: "LOT2 COMPLETE",
    firstName: "Fixture",
    classId: classIds.primary,
    className: "LOT2 Primaire",
    transport: { enabled: true, pk: 28, neighborhood: "Quartier A", pickup: "Point A" },
    expectedSummary: /Transport : Oui.*Zone \/ PK : 28.*Quartier : Quartier A.*Point de ramassage : Point A.*Statut Transport : Configuré/,
  });
  let context = await readStudentContext(main.id);
  assert.equal(context.student.usesTransport, true);
  assert.equal(context.student.transportStatus, "active");
  assert.equal(context.privateData.transportZonePk, 28);
  assert.equal(context.privateData.transportNeighborhood, "Quartier A");
  assert.equal(context.privateData.transportPickupPoint, "Point A");
  const financeBaseline = JSON.stringify(context.finance);
  console.log("CREATE_COMPLETE PASS transport=true pk=28 neighborhood=Quartier_A pickup=Point_A status=active");

  let form = await reloadAndOpen(page, matricules.main);
  await assertTransportState(form, {
    enabled: true, pk: "28", neighborhood: "Quartier A", pickup: "Point A", status: "Configuré",
  });
  console.log("RELOAD PASS transport=true pk=28 neighborhood=Quartier_A pickup=Point_A");

  await form.getByTestId("student-transport-zone-pk").fill("35");
  await form.getByTestId("student-transport-neighborhood").fill("Quartier B");
  await form.getByTestId("student-transport-pickup-point").fill("Point B");
  await saveStudentForm(page, form);
  form = await reloadAndOpen(page, matricules.main);
  await assertTransportState(form, {
    enabled: true, pk: "35", neighborhood: "Quartier B", pickup: "Point B", status: "Configuré",
  });
  context = await readStudentContext(main.id);
  assert.deepEqual(
    [context.privateData.transportZonePk, context.privateData.transportNeighborhood,
      context.privateData.transportPickupPoint],
    [35, "Quartier B", "Point B"],
  );
  console.log("EDIT PASS pk=35 neighborhood=Quartier_B pickup=Point_B");

  await configureTransport(form, { enabled: false });
  assert.match(
    normalizedText(await form.getByTestId("student-transport-summary").textContent()),
    /Transport : Non/,
  );
  await saveStudentForm(page, form);
  form = await reloadAndOpen(page, matricules.main);
  await assertTransportState(form, { enabled: false });
  context = await readStudentContext(main.id);
  assert.equal(context.student.usesTransport, false);
  assert.equal(context.student.transportStatus, "none");
  assert.deepEqual(
    [context.privateData.transportZonePk, context.privateData.transportNeighborhood,
      context.privateData.transportPickupPoint],
    [35, "Quartier B", "Point B"],
  );
  console.log("DEACTIVATE PASS transport=false status=none history=preserved payments_deleted=0");

  await configureTransport(form, { enabled: true });
  await assertTransportState(form, {
    enabled: true, pk: "35", neighborhood: "Quartier B", pickup: "Point B", status: "Configuré",
  });
  await saveStudentForm(page, form);
  form = await reloadAndOpen(page, matricules.main);
  await assertTransportState(form, {
    enabled: true, pk: "35", neighborhood: "Quartier B", pickup: "Point B", status: "Configuré",
  });
  await form.getByRole("button", { name: "Annuler" }).click();
  context = await readStudentContext(main.id);
  assert.equal(context.student.usesTransport, true);
  assert.equal(context.student.transportStatus, "active");
  assert.equal(JSON.stringify(context.finance), financeBaseline);
  assert.equal(
    (await db.collection("payments").where("schoolId", "==", schoolId).get()).size,
    0,
  );
  console.log("REACTIVATE PASS transport=true history=restored status=active");
  console.log("NO_SIDE_EFFECT PASS payments=untouched studentFinance=untouched");

  const incomplete = await createStudentViaUi(page, {
    matricule: matricules.incomplete,
    lastName: "LOT2 INCOMPLETE",
    firstName: "Fixture",
    classId: classIds.primary,
    className: "LOT2 Primaire",
    transport: { enabled: true },
    expectedSummary: /Transport : Oui.*Zone \/ PK : À compléter.*Quartier : À compléter.*Point de ramassage : À compléter.*Statut Transport : À compléter/,
  });
  context = await readStudentContext(incomplete.id);
  assert.equal(context.student.usesTransport, true);
  assert.equal(context.student.transportStatus, "needs_configuration");
  assert.ok((context.finance.transportMonthlyFee || 0) === 0);
  assert.ok((context.finance.feeTransport || 0) === 0);
  console.log("PRIMARY_INCOMPLETE PASS saved=true status=needs_configuration false_tariff=0");

  const secondary = await createStudentViaUi(page, {
    matricule: matricules.secondary,
    lastName: "LOT2 SECONDARY",
    firstName: "Fixture",
    classId: classIds.secondary,
    className: "LOT2 Secondaire FREE",
    transport: { enabled: true },
    expectedSummary: /Transport : Oui.*Zone \/ PK : À compléter.*Statut Transport : Configuré/,
  });
  context = await readStudentContext(secondary.id);
  assert.equal(context.student.usesTransport, true);
  assert.equal(context.student.transportStatus, "active");
  assert.equal(context.privateData && context.privateData.transportZonePk, undefined);
  assert.ok((context.finance.transportMonthlyFee || 0) === 0);
  console.log("SECONDARY_FREE PASS saved=true status=active pk=absent free_compatible=true");
  console.log("LOT2_STAGING_UI PASS");
};

const deleteStudentFixture = async (studentId) => {
  const reference = db.collection("students").doc(studentId);
  const snapshot = await reference.get();
  if (!snapshot.exists) return;
  const data = snapshot.data();
  assert.equal(data.schoolId, schoolId);
  assert.equal(data.createdBy, secretaryUid);
  assert.match(data.matricule, /^LOT2-/);
  for (const collection of [
    "studentPrivate", "studentFinance", "studentParentPrivate", "studentParentFinance",
  ]) {
    const child = db.collection(collection).doc(studentId);
    const childSnapshot = await child.get();
    if (childSnapshot.exists) {
      assert.equal(childSnapshot.data().schoolId, schoolId);
      assert.equal(childSnapshot.data().studentId, studentId);
      await child.delete();
    }
  }
  for (const field of ["matriculeReservationId", "duplicateReservationId"]) {
    const reservationId = data[field];
    if (!reservationId) continue;
    const collection = field === "matriculeReservationId"
      ? "studentMatriculeReservations"
      : "studentDuplicateReservations";
    const reservation = db.collection(collection).doc(reservationId);
    const reservationSnapshot = await reservation.get();
    if (reservationSnapshot.exists) {
      assert.equal(reservationSnapshot.data().schoolId, schoolId);
      assert.ok(
        reservationSnapshot.data().studentId === studentId
          || reservationSnapshot.data().studentIds?.includes(studentId),
      );
      await reservation.delete();
    }
  }
  await reference.delete();
};

const cleanup = async () => {
  if (browserContext) {
    await browserContext.close();
    browserContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  const ownedStudents = await db.collection("students").where("schoolId", "==", schoolId).get();
  for (const document of ownedStudents.docs) {
    const data = document.data();
    assert.equal(data.schoolId, schoolId);
    assert.equal(data.createdBy, secretaryUid);
    assert.match(data.matricule, /^LOT2-/);
    studentIds.add(document.id);
  }
  await deleteOwnedFixtureAudits({
    db,
    testRunId,
    schoolIds: [schoolId],
    actorUids: secretaryUid ? [secretaryUid] : [],
    targetIds: [
      ...studentIds, secretaryUid, schoolId, yearId, ...Object.values(classIds),
    ].filter(Boolean),
  });
  for (const studentId of studentIds) await deleteStudentFixture(studentId);
  for (const { collection, id } of [...tracked].reverse()) {
    const snapshot = await db.collection(collection).doc(id).get();
    if (!snapshot.exists) continue;
    const data = snapshot.data();
    assert.equal(data.testFixture, true);
    assert.equal(data.testRunId, testRunId);
    await snapshot.ref.delete();
  }
  if (secretaryUid) {
    try {
      await adminAuth.deleteUser(secretaryUid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  const collectionCounts = {};
  for (const collection of [
    "students", "studentPrivate", "studentFinance", "studentParentPrivate",
    "studentParentFinance", "studentMatriculeReservations",
    "studentDuplicateReservations", "payments",
  ]) {
    collectionCounts[collection] =
      (await db.collection(collection).where("schoolId", "==", schoolId).get()).size;
  }
  const audit =
    (await db.collection("audit_logs").where("testRunId", "==", testRunId).get()).size;
  let auth = 0;
  if (secretaryUid) {
    try {
      await adminAuth.getUser(secretaryUid);
      auth = 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }
  const residuals = collectionCounts.students + collectionCounts.studentPrivate
    + collectionCounts.studentFinance + audit + auth;
  const orphans = Object.entries(collectionCounts)
    .filter(([name]) => !["students", "studentPrivate", "studentFinance"].includes(name))
    .reduce((sum, [, count]) => sum + count, 0);
  assert.equal(residuals, 0, "Residuals: " + JSON.stringify(collectionCounts));
  assert.equal(orphans, 0, "Orphans: " + JSON.stringify(collectionCounts));
  console.log("CLEANUP " + JSON.stringify({
    students: collectionCounts.students,
    studentPrivate: collectionCounts.studentPrivate,
    studentFinance: collectionCounts.studentFinance,
    Auth: auth,
    audit,
    residuals,
    orphans,
  }));
};

try {
  adminApp = initializeAdminApp(
    { credential: applicationDefault(), projectId: PROJECT },
    "lot2-student-admin-" + testRunId,
  );
  db = getFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);
  const secretary = await adminAuth.createUser({
    email: secretaryEmail,
    password,
    disabled: false,
  });
  secretaryUid = secretary.uid;
  await Promise.all([
    track("users", secretaryUid).create({
      id: secretaryUid,
      email: secretaryEmail,
      role: "secretary",
      schoolId,
      active: true,
      isActive: true,
      ...tagged,
    }),
    track("schools", schoolId).create({
      id: schoolId,
      name: "École fixture LOT 2 Transport Élève",
      academicYear: ACADEMIC_YEAR,
      activeAcademicYearId: yearId,
      active: true,
      subscriptionStatus: "active",
      studentsCount: 0,
      studentLimit: 20,
      ...tagged,
    }),
    track("academicYears", yearId).create({
      id: yearId,
      schoolId,
      name: ACADEMIC_YEAR,
      status: "active",
      ...tagged,
    }),
    track("classes", classIds.primary).create({
      id: classIds.primary,
      schoolId,
      academicYearId: yearId,
      name: "LOT2 Primaire",
      cycle: "primary",
      level: "primary",
      type: "francophone",
      section: "francophone",
      isActive: true,
      ...tagged,
    }),
    track("classes", classIds.secondary).create({
      id: classIds.secondary,
      schoolId,
      academicYearId: yearId,
      name: "LOT2 Secondaire FREE",
      cycle: "secondary",
      level: "secondaire",
      type: "francophone",
      section: "francophone",
      isActive: true,
      ...tagged,
    }),
  ]);
  await validateUi();
  await cleanup();
} catch (error) {
  console.error("VALIDATION_FAIL " + (error?.code || "UNKNOWN") + " " + (error?.message || error));
  try {
    if (db) await cleanup();
  } catch (cleanupError) {
    console.error("CLEANUP_FAIL " + (cleanupError?.message || cleanupError));
  }
  process.exitCode = 1;
} finally {
  if (adminApp) await deleteAdminApp(adminApp);
}
