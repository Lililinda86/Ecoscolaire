import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { initializeApp as initializeAdminApp, applicationDefault, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { chromium } from '@playwright/test';
import * as XLSX from 'xlsx';
import {
  StagingUiPreflightError,
  classifyBrowserLanding,
  inspectUiHttpPreflight,
  resolveExpectedStagingSha,
  selectStagingVercelUrl
} from '../tests/security/student-progressive-registration-staging-preflight-contract.mjs';

const EXPECTED_PROJECT = 'ecoscolaire-staging';
const PROD_PROJECT = 'ecoscolaire-c5861';
const REQUIRED_MISSING = ['dob', 'placeOfBirth', 'parentName', 'parentPhone', 'address', 'emergencyContact', 'medicalInformation'];
const ARTIFACT_DIR = path.resolve('artifacts/student-progressive-registration');
const PREFLIGHT_TIMEOUT_MS = 10_000;
const BROWSER_PREFLIGHT_TIMEOUT_MS = 8_000;

const runId = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
const prefix = `student-progressive-registration-${runId}`;
const schoolId = `${prefix}-school`;
const otherSchoolId = `${prefix}-other-school`;
const yearId = `${prefix}-year`;
const otherYearId = `${prefix}-other-year`;
const classId = `${prefix}-class`;
const otherClassId = `${prefix}-other-class`;
const legacyId = `${prefix}-legacy`;
const secretaryEmail = `${prefix}@example.test`;
const secretaryPassword = `Spr!${crypto.randomBytes(18).toString('base64url')}9a`;

const results = {
  workflow: process.env.GITHUB_WORKFLOW || null,
  run: process.env.GITHUB_RUN_ID || null,
  stagingSha: null,
  immutableUrl: null,
  project: EXPECTED_PROJECT,
  minimalStudent: 'NOT_RUN', missingDob: 'NOT_RUN', missingParentName: 'NOT_RUN', missingParentPhone: 'NOT_RUN',
  incompleteStatus: 'NOT_RUN', missingRegistrationFields: 'NOT_RUN', reload: 'NOT_RUN', completeTransition: 'NOT_RUN',
  transportIncomplete: 'NOT_RUN', falseTransportData: null, legacyStudent: 'NOT_RUN', excelImport: 'NOT_RUN',
  crossSchool: 'NOT_RUN', invalidClass: 'NOT_RUN', quota: 'NOT_RUN', unauthorizedFields: 'NOT_RUN',
  paymentsModified: null, studentFinanceModified: null, cleanup: 'NOT_RUN', residuals: null, orphans: null,
  productionModified: 'NO', failedScenario: null, failure: null
};

let currentScenario = 'PREFLIGHT';
let fixturesStarted = false;
let adminApp;
let adminDb;
let adminAuth;
let clientApp;
let clientAuth;
let browser;
let page;
let secretaryUid;
let minimalStudentId;
let financeUpdateTimeBeforeEdits;
const fixtureStudentIds = new Set([legacyId]);
let expectedSha;
let stagingUrl;

const failPreflight = (code, message) => { throw new StagingUiPreflightError(code, message); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const requirePreflight = (condition, code, message) => { if (!condition) failPreflight(code, message); };
const sameStrings = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function github(pathname) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${pathname}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  assert(response.ok, `GitHub preflight ${pathname}: HTTP ${response.status}`);
  return response.json();
}

async function httpAndDeploymentPreflight() {
  expectedSha = resolveExpectedStagingSha({
    eventName: process.env.GITHUB_EVENT_NAME,
    githubSha: process.env.GITHUB_SHA,
    githubRef: process.env.GITHUB_REF,
    dispatchSha: process.env.EXPECTED_STAGING_SHA
  });
  results.stagingSha = expectedSha;
  assert(process.env.FIREBASE_PROJECT_ID === EXPECTED_PROJECT, 'Firebase project mismatch');
  assert(process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'VERCEL_AUTOMATION_BYPASS_SECRET is missing');
  assert(process.env.GITHUB_TOKEN, 'GITHUB_TOKEN is missing');
  assert(process.env.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY is missing');
  assert(EXPECTED_PROJECT !== PROD_PROJECT && !schoolId.toLowerCase().includes('italo'), 'Production/Italo guard');

  const ref = await github('git/ref/heads/staging');
  const runs = await github('actions/workflows/deploy-staging.yml/runs?branch=staging&event=push&per_page=20');
  const deployRun = runs.workflow_runs?.find(run => run.head_sha === expectedSha && run.status === 'completed' && run.conclusion === 'success');
  const deployments = await github(`deployments?sha=${expectedSha}&per_page=20`);
  const deploymentRecords = [];
  let officialStagingDeploymentPass = false;
  for (const deployment of deployments) {
    const statuses = await github(`deployments/${deployment.id}/statuses`);
    if (
      deployment.sha === expectedSha &&
      deployment.ref === 'staging' &&
      /^staging$/i.test(String(deployment.environment || '')) &&
      !deployment.production_environment &&
      statuses.some(status => status.state === 'success' && /^staging$/i.test(String(status.environment || '')))
    ) {
      officialStagingDeploymentPass = true;
    }
    deploymentRecords.push({
      creatorLogin: deployment.creator?.login,
      sha: deployment.sha,
      ref: deployment.ref,
      environment: deployment.environment,
      productionEnvironment: Boolean(deployment.production_environment),
      statuses: statuses.map(status => ({
        state: status.state,
        environment: status.environment,
        environmentUrl: status.environment_url
      }))
    });
  }
  stagingUrl = selectStagingVercelUrl({
    expectedSha,
    branchSha: ref.object?.sha,
    stagingDeploymentPass: Boolean(deployRun) && officialStagingDeploymentPass,
    deployments: deploymentRecords
  });
  results.immutableUrl = stagingUrl;

  const response = await fetch(stagingUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    headers: {
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      'x-vercel-set-bypass-cookie': 'true'
    }
  });
  const html = await response.text();
  inspectUiHttpPreflight({
    selectedUrl: stagingUrl,
    finalUrl: response.url,
    status: response.status,
    body: html,
    bypassSecretPresent: Boolean(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
  });
  assert(process.env.GITHUB_ENV, 'GITHUB_ENV is missing');
  await appendFile(process.env.GITHUB_ENV, `STAGING_UI_HTTP_PREFLIGHT_VERIFIED=true\nSTAGING_URL=${stagingUrl}\n`);
  console.log(`HTTP PREFLIGHT PASS sha=${expectedSha} project=${EXPECTED_PROJECT} url=${stagingUrl}`);
}

function initializeAdminRuntime() {
  adminApp = initializeAdminApp({ credential: applicationDefault(), projectId: EXPECTED_PROJECT }, `spr-admin-${runId}`);
  adminDb = getAdminFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);
  assert(adminApp.options.projectId === EXPECTED_PROJECT, 'Admin runtime project mismatch');
}

async function setupFixtures() {
  fixturesStarted = true;
  const now = Timestamp.now();
  const school = {
    id: schoolId, schoolId, name: `SPR fixture ${runId}`, schoolCode: `SPR${runId}`.slice(0, 24),
    academicYear: '2026-2027', activeAcademicYearId: yearId, active: true, isActive: true,
    subscriptionPlan: 'starter', studentLimit: 20, studentsCount: 0,
    settings: { currency: 'XAF', defaultLanguage: 'fr' }, createdAt: now, updatedAt: now
  };
  const otherSchool = { ...school, id: otherSchoolId, schoolId: otherSchoolId, name: `SPR other fixture ${runId}`, activeAcademicYearId: otherYearId };
  await adminDb.collection('schools').doc(schoolId).create(school);
  await adminDb.collection('schools').doc(otherSchoolId).create(otherSchool);
  await adminDb.collection('academicYears').doc(yearId).create({ id: yearId, schoolId, name: '2026-2027', status: 'active', startDate: '2026-09-01', endDate: '2027-07-31', createdAt: now });
  await adminDb.collection('academicYears').doc(otherYearId).create({ id: otherYearId, schoolId: otherSchoolId, name: '2026-2027', status: 'active', createdAt: now });
  await adminDb.collection('classes').doc(classId).create({ id: classId, schoolId, academicYearId: yearId, name: 'CP', level: 'Primaire', type: 'francophone', section: 'francophone', isActive: true, createdAt: now });
  await adminDb.collection('classes').doc(otherClassId).create({ id: otherClassId, schoolId: otherSchoolId, academicYearId: otherYearId, name: 'CE1', level: 'Primaire', type: 'francophone', section: 'francophone', isActive: true, createdAt: now });
  const user = await adminAuth.createUser({ email: secretaryEmail, password: secretaryPassword, emailVerified: true, displayName: `SPR Secretary ${runId}` });
  secretaryUid = user.uid;
  await adminDb.collection('users').doc(secretaryUid).create({ id: secretaryUid, schoolId, email: secretaryEmail, role: 'secretary', active: true, isActive: true, createdAt: now });
  console.log(`FIXTURE READY prefix=${prefix}`);
}

function firebaseClientConfig() {
  return {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: EXPECTED_PROJECT,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
  };
}

async function setupCallableClient() {
  clientApp = initializeApp(firebaseClientConfig(), `spr-client-${runId}`);
  clientAuth = getAuth(clientApp);
  await signInWithEmailAndPassword(clientAuth, secretaryEmail, secretaryPassword);
}

const callablePayload = (studentId, targetClassId, extra = {}) => ({
  studentId,
  studentData: {
    name: `SECURE ${studentId}`, studentLastName: 'SECURE', studentFirstName: studentId,
    gender: 'F', section: 'francophone', classId: targetClassId, schoolId,
    studentStatus: 'nouveau', registrationYear: '2026-2027', ...extra.studentData
  },
  privateData: { ...extra.privateData }, financeData: { ...extra.financeData },
  parentPrivateData: {}, parentFinanceData: {}
});

async function callCreate(payload) {
  return (await httpsCallable(getFunctions(clientApp, 'us-central1'), 'createStudentSecure')(payload)).data;
}

async function expectCallableFailure(label, payload, businessCode) {
  try {
    await callCreate(payload);
    throw new Error(`${label}: callable unexpectedly succeeded`);
  } catch (error) {
    if (String(error.message).includes('unexpectedly succeeded')) throw error;
    const actual = error.details?.businessCode || error.details?.code || error.code || '';
    assert(String(actual).includes(businessCode) || String(error.message).includes(businessCode), `${label}: expected ${businessCode}, got ${actual || error.message}`);
  }
}

function formField(form, labelPattern, selector = 'input') {
  return form.locator('.form-group').filter({ has: form.locator('label').filter({ hasText: labelPattern }) }).locator(selector).first();
}

async function browserPreflight() {
  await page.goto(`${stagingUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: PREFLIGHT_TIMEOUT_MS });
  let hasLoginEmail = false;
  let hasAppShell = false;
  const deadline = Date.now() + BROWSER_PREFLIGHT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const finalHost = new URL(page.url()).hostname;
    if (/^(?:www\.)?vercel\.com$/i.test(finalHost)) {
      failPreflight('VERCEL_PROTECTED_URL', `Browser redirected to ${finalHost}`);
    }
    hasLoginEmail = await page.getByTestId('login-email').isVisible().catch(() => false);
    hasAppShell = await page.locator('[data-testid="sidebar"], [data-testid="app-shell"], #root main, #root nav').first().isVisible().catch(() => false);
    if (hasLoginEmail || hasAppShell) break;
    await page.waitForTimeout(200);
  }
  classifyBrowserLanding({ finalUrl: page.url(), hasLoginEmail, hasAppShell });
  console.log(`BROWSER PREFLIGHT PASS url=${page.url()}`);
}

async function openStudentsPage() {
  if (!(await page.getByTestId('login-email').isVisible().catch(() => false))) {
    await page.goto(`${stagingUrl}/#/login`, { waitUntil: 'domcontentloaded', timeout: PREFLIGHT_TIMEOUT_MS });
  }
  await page.getByTestId('login-email').fill(secretaryEmail);
  await page.getByTestId('login-password').fill(secretaryPassword);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('sidebar').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByTestId('nav-students').click();
  await page.getByRole('button', { name: 'Ajouter un élève' }).waitFor({ state: 'visible', timeout: 30000 });
}

async function waitForStudentByName(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const snap = await adminDb.collection('students').where('schoolId', '==', schoolId).where('name', '==', name).get();
    if (snap.size === 1) return snap.docs[0];
    await sleep(500);
  }
  throw new Error(`Student not persisted: ${name}`);
}

async function clickNext(form) {
  await form.getByRole('button', { name: 'Suivant' }).click();
}

async function openEdit(name) {
  const row = page.locator('tbody tr').filter({ hasText: name }).first();
  await row.getByRole('button', { name: `Actions pour ${name}` }).click();
  await row.locator('button[data-action="edit-student"]').click();
  const form = page.locator('form').filter({ hasText: 'Étape 1 sur 4' }).first();
  await form.waitFor({ state: 'visible' });
  return form;
}

async function scenarioMinimal() {
  const name = `MINIMAL ${runId}`;
  await page.getByRole('button', { name: 'Ajouter un élève' }).click();
  const form = page.locator('form').filter({ hasText: 'Étape 1 sur 4' }).first();
  await formField(form, /^Nom /).fill('MINIMAL');
  await formField(form, /^Prénom/).fill(runId);
  await formField(form, /^Sexe/, 'select').selectOption('F');
  await clickNext(form);
  await formField(form, /^Section/, 'select').selectOption('francophone');
  await formField(form, /^Classe/, 'select').selectOption(classId);
  await clickNext(form);
  await clickNext(form);
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  const row = page.locator('tbody tr').filter({ hasText: name }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.getByText('À compléter', { exact: true }).waitFor({ state: 'visible' });

  const doc = await waitForStudentByName(name);
  minimalStudentId = doc.id;
  fixtureStudentIds.add(doc.id);
  const data = doc.data();
  const privateSnap = await adminDb.collection('studentPrivate').doc(doc.id).get();
  const financeSnap = await adminDb.collection('studentFinance').doc(doc.id).get();
  assert(data.registrationFileStatus === 'incomplete', 'A: status is not incomplete');
  assert(sameStrings(data.missingRegistrationFields, REQUIRED_MISSING), `A: wrong missing fields ${JSON.stringify(data.missingRegistrationFields)}`);
  assert(typeof data.matricule === 'string' && data.matricule !== '' && data.matricule !== '-', 'A: matricule missing');
  assert(data.classId === classId && data.schoolId === schoolId, 'A: class/school mismatch');
  assert(!privateSnap.data()?.dob && !privateSnap.data()?.parentName && !privateSnap.data()?.parentPhone, 'A: optional identity fields unexpectedly persisted');
  financeUpdateTimeBeforeEdits = financeSnap.updateTime.toMillis();
  results.minimalStudent = results.missingDob = results.missingParentName = results.missingParentPhone = 'PASS';
  results.incompleteStatus = results.missingRegistrationFields = 'PASS';
}

async function scenarioReload() {
  const name = `MINIMAL ${runId}`;
  await page.reload({ waitUntil: 'domcontentloaded' });
  const row = page.locator('tbody tr').filter({ hasText: name }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  const badge = row.getByText('À compléter', { exact: true });
  await badge.waitFor({ state: 'visible' });
  const title = await badge.getAttribute('title');
  for (const expected of ['Date de naissance', 'Nom du responsable légal', 'Téléphone du responsable légal']) assert(title?.includes(expected), `B: missing-list title lacks ${expected}`);
  results.reload = 'PASS';
}

async function scenarioComplete() {
  const name = `MINIMAL ${runId}`;
  const form = await openEdit(name);
  await form.locator('input[type="date"]').fill('2018-02-03');
  await formField(form, /^Lieu de Naissance/).fill('Testville');
  await clickNext(form);
  await clickNext(form);
  await formField(form, /^Nom du Responsable/).fill('Responsable Fixture');
  await formField(form, /^Contact \(Téléphone\)/).fill('+237650336558');
  await formField(form, /^Adresse d'habitation/).fill('Adresse fixture');
  await formField(form, /^Contact d'Urgence/).fill('+237690112233');
  await clickNext(form);
  await form.locator('#student-no-medical-condition-checkbox').check();
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  const row = page.locator('tbody tr').filter({ hasText: name }).first();
  await row.getByText('Dossier complet', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const snap = await adminDb.collection('students').doc(minimalStudentId).get();
  assert(snap.data()?.registrationFileStatus === 'complete', 'C: status is not complete');
  assert(Array.isArray(snap.data()?.missingRegistrationFields) && snap.data().missingRegistrationFields.length === 0, 'C: missing fields not empty');
  results.completeTransition = 'PASS';
}

async function scenarioTransport() {
  const name = `MINIMAL ${runId}`;
  const form = await openEdit(name);
  await clickNext(form); await clickNext(form); await clickNext(form);
  await form.getByText('Utilise le transport scolaire', { exact: true }).locator('input').check();
  assert(await form.getByTestId('student-transport-zone-pk').inputValue() === '', 'D: false PK prefilled');
  assert(await form.getByTestId('student-transport-pickup-point').inputValue() === '', 'D: false pickup prefilled');
  await form.getByRole('button', { name: 'Enregistrer' }).click();
  const row = page.locator('tbody tr').filter({ hasText: name }).first();
  await row.getByText('À compléter', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const student = (await adminDb.collection('students').doc(minimalStudentId).get()).data();
  const priv = (await adminDb.collection('studentPrivate').doc(minimalStudentId).get()).data();
  const finance = await adminDb.collection('studentFinance').doc(minimalStudentId).get();
  assert(student.registrationFileStatus === 'incomplete', 'D: status is not incomplete');
  assert(student.missingRegistrationFields.includes('transportNeighborhood') && student.missingRegistrationFields.includes('transportPickupPoint'), 'D: transport missing fields absent');
  assert(priv.transportZonePk === undefined && !priv.transportPickupPoint && !priv.transportNeighborhood, 'D: false transport data persisted');
  assert(finance.data()?.transportMonthlyFee === undefined && finance.updateTime.toMillis() === financeUpdateTimeBeforeEdits, 'D: studentFinance modified');
  const payments = await adminDb.collection('payments').where('schoolId', '==', schoolId).get();
  assert(payments.empty, 'D: payment created/modified');
  results.transportIncomplete = 'PASS'; results.falseTransportData = 0; results.paymentsModified = 0; results.studentFinanceModified = 0;
}

async function scenarioLegacy() {
  const legacyName = `LEGACY ${runId}`;
  await adminDb.collection('students').doc(legacyId).create({
    id: legacyId, schoolId, name: legacyName, studentLastName: 'LEGACY', studentFirstName: runId,
    gender: 'M', section: 'francophone', classId, studentStatus: 'ancien', registrationYear: '2026-2027',
    schoolingStatus: 'active', matricule: `LEG-${runId}`, createdAt: Timestamp.now()
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const row = page.locator('tbody tr').filter({ hasText: legacyName }).first();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.getByText('À compléter', { exact: true }).waitFor({ state: 'visible' });
  const form = await openEdit(legacyName);
  await form.getByRole('button', { name: 'Annuler' }).click();
  const after = (await adminDb.collection('students').doc(legacyId).get()).data();
  assert(after.registrationFileStatus === undefined && after.missingRegistrationFields === undefined, 'E: legacy record was migrated on read');
  results.legacyStudent = 'PASS';
}

async function scenarioSecurity() {
  const crossId = `${prefix}-cross-denied`;
  const invalidId = `${prefix}-invalid-denied`;
  const quotaId = `${prefix}-quota-denied`;
  await expectCallableFailure('cross-school', callablePayload(crossId, otherClassId), 'INVALID_CLASS');
  assert(!(await adminDb.collection('students').doc(crossId).get()).exists, 'cross-school residue');
  results.crossSchool = 'PASS';
  await expectCallableFailure('invalid-class', callablePayload(invalidId, `${prefix}-missing-class`), 'INVALID_CLASS');
  assert(!(await adminDb.collection('students').doc(invalidId).get()).exists, 'invalid-class residue');
  results.invalidClass = 'PASS';

  const schoolRef = adminDb.collection('schools').doc(schoolId);
  const before = (await schoolRef.get()).data().studentsCount;
  await schoolRef.update({ studentLimit: before });
  await expectCallableFailure('quota', callablePayload(quotaId, classId), 'STUDENT_QUOTA_REACHED');
  assert((await schoolRef.get()).data().studentsCount === before, 'quota counter changed');
  await schoolRef.update({ studentLimit: 20 });
  results.quota = 'PASS';

  const sanitizedId = `${prefix}-sanitized`;
  fixtureStudentIds.add(sanitizedId);
  await callCreate(callablePayload(sanitizedId, classId, {
    studentData: { unauthorizedStudentField: 'blocked' }, privateData: { unauthorizedPrivateField: 'blocked' }, financeData: { unauthorizedFinanceField: 999 }
  }));
  const [student, priv, finance] = await Promise.all([
    adminDb.collection('students').doc(sanitizedId).get(), adminDb.collection('studentPrivate').doc(sanitizedId).get(), adminDb.collection('studentFinance').doc(sanitizedId).get()
  ]);
  assert(student.data().unauthorizedStudentField === undefined && priv.data().unauthorizedPrivateField === undefined && finance.data().unauthorizedFinanceField === undefined, 'unauthorized field persisted');
  results.unauthorizedFields = 'PASS';
}

async function scenarioExcel() {
  const importName = `IMPORT ${runId}`;
  const trigger = page.getByRole('button', { name: /import/i });
  assert(await trigger.count() > 0, 'F line 1: aucun bouton UI ne permet d’ouvrir l’import Excel');
  await trigger.first().click();
  const file = path.join(ARTIFACT_DIR, `minimal-${runId}.xlsx`);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['NOM', 'PRENOM', 'SEXE', 'SECTION', 'CLASSE'], ['IMPORT', runId, 'F', 'francophone', 'CP']
  ]), 'Eleves');
  XLSX.writeFile(workbook, file);
  await page.locator('input[type="file"][accept*=".xlsx"]').setInputFiles(file);
  await page.getByRole('button', { name: "Afficher l'aperçu avant import" }).click();
  await page.getByText(importName, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: "Confirmer l'importation" }).click();
  const doc = await waitForStudentByName(importName);
  fixtureStudentIds.add(doc.id);
  assert(doc.data().registrationFileStatus === 'incomplete' && sameStrings(doc.data().missingRegistrationFields, REQUIRED_MISSING), 'F: imported status/missing fields incorrect');
  results.excelImport = 'PASS';
}

async function cleanup() {
  if (!fixturesStarted || !adminDb) { results.cleanup = 'PASS'; results.residuals = 0; results.orphans = 0; return; }
  try { if (clientAuth) await signOut(clientAuth); } catch {}
  try { if (page) await page.waitForTimeout(1500); } catch {}
  const schoolIds = [schoolId, otherSchoolId];
  const collections = await adminDb.listCollections();
  for (const collection of collections) {
    for (const sid of schoolIds) {
      const snapshot = await collection.where('schoolId', '==', sid).get();
      for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
        const batch = adminDb.batch();
        snapshot.docs.slice(offset, offset + 400).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
    }
  }
  await Promise.all([
    adminDb.collection('schools').doc(schoolId).delete(), adminDb.collection('schools').doc(otherSchoolId).delete(),
    secretaryUid ? adminDb.collection('users').doc(secretaryUid).delete() : Promise.resolve()
  ]);
  if (secretaryUid) { try { await adminAuth.deleteUser(secretaryUid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; } }

  let residuals = 0;
  for (const collection of await adminDb.listCollections()) {
    for (const sid of schoolIds) residuals += (await collection.where('schoolId', '==', sid).get()).size;
  }
  for (const id of fixtureStudentIds) {
    for (const name of ['students', 'studentPrivate', 'studentFinance', 'studentParentPrivate', 'studentParentFinance']) {
      if ((await adminDb.collection(name).doc(id).get()).exists) residuals += 1;
    }
  }
  if ((await adminDb.collection('schools').doc(schoolId).get()).exists || (await adminDb.collection('schools').doc(otherSchoolId).get()).exists) residuals += 1;
  try { await adminAuth.getUserByEmail(secretaryEmail); residuals += 1; } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  results.residuals = residuals; results.orphans = residuals; results.cleanup = residuals === 0 ? 'PASS' : 'FAIL';
  if (residuals !== 0) throw new Error(`Cleanup residuals=${residuals}`);
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  try {
    requirePreflight(process.env.STAGING_UI_HTTP_PREFLIGHT_VERIFIED === 'true', 'HTTP_PREFLIGHT_NOT_VERIFIED', 'HTTP and deployment preflight must PASS before Chromium');
    assert(process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'VERCEL_AUTOMATION_BYPASS_SECRET is missing');
    expectedSha = resolveExpectedStagingSha({
      eventName: process.env.GITHUB_EVENT_NAME,
      githubSha: process.env.GITHUB_SHA,
      githubRef: process.env.GITHUB_REF,
      dispatchSha: process.env.EXPECTED_STAGING_SHA
    });
    stagingUrl = process.env.STAGING_URL?.replace(/\/$/, '');
    requirePreflight(Boolean(stagingUrl), 'MISSING_IMMUTABLE_URL', 'Resolved Staging URL is missing after HTTP preflight');
    results.stagingSha = expectedSha;
    results.immutableUrl = stagingUrl;
    initializeAdminRuntime();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR' });
    page = await context.newPage();
    await page.route(`${new URL(stagingUrl).origin}/**`, async route => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          'x-vercel-set-bypass-cookie': 'true'
        }
      });
    });
    page.on('dialog', dialog => dialog.accept().catch(() => {}));
    await browserPreflight();
    await setupFixtures();
    await setupCallableClient();
    await openStudentsPage();
    currentScenario = 'A'; await scenarioMinimal();
    currentScenario = 'B'; await scenarioReload();
    currentScenario = 'C'; await scenarioComplete();
    currentScenario = 'D'; await scenarioTransport();
    currentScenario = 'E'; await scenarioLegacy();
    currentScenario = 'SECURITY'; await scenarioSecurity();
    currentScenario = 'F'; await scenarioExcel();
  } catch (error) {
    results.failedScenario = currentScenario;
    results.failure = error?.stack || String(error);
    if (currentScenario === 'F') results.excelImport = 'FAIL';
    console.error(`VALIDATION FAIL scenario=${currentScenario}`, error);
    try { if (page) await page.screenshot({ path: path.join(ARTIFACT_DIR, `failure-${currentScenario}.png`), fullPage: true }); } catch {}
  } finally {
    try { await cleanup(); } catch (error) {
      results.cleanup = 'FAIL'; results.failure = `${results.failure || ''}\nCLEANUP: ${error?.stack || error}`.trim();
    }
    try { if (browser) await browser.close(); } catch {}
    try { if (clientApp) await deleteApp(clientApp); } catch {}
    try { if (adminApp) await deleteAdminApp(adminApp); } catch {}
    await writeFile(path.join(ARTIFACT_DIR, 'report.json'), JSON.stringify(results, null, 2));
    console.log(`STUDENT_PROGRESSIVE_REGISTRATION_REPORT=${JSON.stringify(results)}`);
  }
  if (results.failure || results.cleanup !== 'PASS') process.exitCode = 1;
}

async function preflightOnlyMain() {
  try {
    await httpAndDeploymentPreflight();
  } catch (error) {
    const classification = error?.code || 'STAGING_UI_PREFLIGHT_FAILED';
    console.error(`PREFLIGHT FAIL classification=${classification}: ${error?.stack || error}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  if (process.argv.includes('--preflight-only')) await preflightOnlyMain();
  else await main();
}
