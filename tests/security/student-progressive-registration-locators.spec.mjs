import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REGISTRATION_ACTION_NAMES,
  REGISTRATION_CONTROL_SCOPES,
  REGISTRATION_CONTROL_SELECTORS,
  REGISTRATION_CONTROL_STEPS,
  REGISTRATION_SCOPE_HEADINGS,
  requireRegistrationControlStep,
  requireUniqueRegistrationLocatorCount
} from './student-progressive-registration-locator-contract.mjs';

const studentsSource = readFileSync(new URL('../../src/pages/Students.tsx', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../scripts/test-student-progressive-registration-staging.mjs', import.meta.url), 'utf8');
const scenarioA = harnessSource.slice(
  harnessSource.indexOf('async function scenarioMinimal()'),
  harnessSource.indexOf('async function scenarioReload()')
);
const scenarioC = harnessSource.slice(
  harnessSource.indexOf('async function scenarioComplete()'),
  harnessSource.indexOf('async function scenarioTransport()')
);

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function sourceWindow(marker, before = 350, after = 500) {
  assert.equal(occurrences(studentsSource, marker), 1, `DOM marker must be unique: ${marker}`);
  const index = studentsSource.indexOf(marker);
  return studentsSource.slice(Math.max(0, index - before), index + marker.length + after);
}

function requireScenarioControl(name) {
  assert.match(scenarioA, new RegExp(`registrationControl\\(form, '${name}'\\)`));
  assert.match(harnessSource, /scope\.locator\(REGISTRATION_CONTROL_SELECTORS\[name\]\)/);
}

function requireScenarioCControl(name, step) {
  assert.equal(REGISTRATION_CONTROL_STEPS[name], step);
  assert.match(scenarioC, new RegExp(`registrationControl\\(form, '${name}', ${step}\\)`));
}

test('Nom locator matches the unique required text input in wizard step 1', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.lastName, 'input[required][placeholder="Ex: N’GONO"]');
  const block = sourceWindow('placeholder="Ex: N’GONO"', 900, 100);
  assert.match(block, /<label>Nom <span/);
  assert.match(block, /<input[\s\S]*?required[\s\S]*?value=\{currentStudent\.studentLastName \|\| ''\}/);
  requireScenarioControl('lastName');
});

test('Prénom locator matches the unique required input in wizard step 1', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.firstName, 'input[required][aria-describedby="student-first-name-error"]');
  const block = sourceWindow('aria-describedby="student-first-name-error"');
  assert.match(block, /<label>Prénom\(s\) <span/);
  assert.match(block, /<input[\s\S]*?required[\s\S]*?value=\{currentStudent\.studentFirstName \|\| ''\}/);
  requireScenarioControl('firstName');
});

test('Sexe locator matches the unique M/F select in wizard step 1', () => {
  const block = sourceWindow('value={currentStudent.gender}', 200, 400);
  assert.match(block, /<label>Sexe <span/);
  assert.match(block, /<option value="M">Masculin<\/option>/);
  assert.match(block, /<option value="F">Féminin<\/option>/);
  requireScenarioControl('gender');
});

test('Section locator matches the unique francophone/anglophone select in wizard step 2', () => {
  const block = sourceWindow('value={currentStudent.section}', 250, 700);
  assert.match(block, /t\('section', 'Section'\)/);
  assert.match(block, /<option value="francophone">Francophone<\/option>/);
  assert.match(block, /<option value="anglophone">Anglophone<\/option>/);
  requireScenarioControl('section');
});

test('Classe locator matches the unique required select in wizard step 2', () => {
  const block = sourceWindow("value={currentStudent.classId || ''}", 250, 300);
  assert.match(block, /<label>Classe <span/);
  assert.match(block, /<select[\s\S]*?required/);
  requireScenarioControl('classId');
});

test('Année locator matches the unique read-only active-year input in wizard step 2', () => {
  const block = sourceWindow('aria-label="Année scolaire active"', 500, 100);
  assert.match(block, /<label>Année Scolaire<\/label>/);
  assert.match(block, /<input[\s\S]*?readOnly/);
  assert.match(scenarioA, /academicYear\.inputValue\(\)/);
  requireScenarioControl('academicYear');
});

test('wizard navigation uses one exact form-scoped Suivant action', () => {
  assert.equal(REGISTRATION_ACTION_NAMES.next, 'Suivant');
  assert.match(harnessSource, /form\.getByRole\('button', \{ name: REGISTRATION_ACTION_NAMES\[name\], exact: true \}\)/);
  assert.equal(occurrences(scenarioA, 'await clickNext(form);'), 3);
});

test('save uses one exact form-scoped Enregistrer action', () => {
  assert.equal(REGISTRATION_ACTION_NAMES.save, 'Enregistrer');
  assert.match(scenarioA, /registrationAction\(form, 'save'\)/);
});

test('Date de naissance locator matches the unique date input in wizard step 1', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.dob, 'input[type="date"]');
  const block = sourceWindow("value={currentStudent.dob || ''}", 200, 200);
  assert.match(block, /<label>Date de Naissance<\/label>/);
  assert.match(block, /value=\{currentStudent\.dob \|\| ''\}/);
  assert.doesNotMatch(block, /readOnly/);
  requireScenarioCControl('dob', 1);
});

test('Lieu de naissance locator uses its exact unique placeholder in wizard step 1', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.placeOfBirth, 'input[placeholder="Ex: Yaoundé"]');
  const block = sourceWindow('placeholder="Ex: Yaoundé"', 300, 100);
  assert.match(block, /<label>Lieu de Naissance<\/label>/);
  assert.match(block, /value=\{currentStudent\.placeOfBirth \|\| ''\}/);
  assert.doesNotMatch(block, /readOnly/);
  requireScenarioCControl('placeOfBirth', 1);
});

test('responsable controls are scoped to the unique legal guardian section', () => {
  assert.equal(REGISTRATION_SCOPE_HEADINGS.guardian, '🏠 Responsable Légal Principal (à compléter)');
  for (const name of ['parentName', 'parentPhone', 'address', 'emergencyContact']) {
    assert.equal(REGISTRATION_CONTROL_SCOPES[name], 'guardian');
  }
  assert.match(harnessSource, /form\.getByRole\('heading', \{ name: REGISTRATION_SCOPE_HEADINGS\[scopeName\], exact: true \}\)\.locator\('\.\.'\)/);
});

test('Nom du responsable locator matches the exact guardian input in wizard step 3', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.parentName, 'input[placeholder="Ex: Paul Dupont"]');
  const block = sourceWindow('placeholder="Ex: Paul Dupont"', 250, 100);
  assert.match(block, /<label>Nom du Responsable<\/label>/);
  assert.match(block, /value=\{currentStudent\.parentName \|\| ''\}/);
  requireScenarioCControl('parentName', 3);
});

test('Téléphone responsable locator resolves the duplicate placeholder inside guardian scope', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.parentPhone, 'input[placeholder="Ex: +237650336558"]');
  assert.equal(occurrences(studentsSource, 'placeholder="Ex: +237650336558"'), 2);
  const block = sourceWindow('value={currentStudent.parentPhone || \'\'}', 250, 200);
  assert.match(block, /<label>Contact \(Téléphone\)<\/label>/);
  assert.match(block, /placeholder="Ex: \+237650336558"/);
  requireScenarioCControl('parentPhone', 3);
});

test('Adresse locator matches the exact guardian input in wizard step 3', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.address, 'input[placeholder="Ex: Akwa, Douala"]');
  const block = sourceWindow('placeholder="Ex: Akwa, Douala"', 250, 100);
  assert.match(block, /<label>Adresse d'habitation<\/label>/);
  assert.match(block, /value=\{currentStudent\.address \|\| ''\}/);
  requireScenarioCControl('address', 3);
});

test('Contact urgence locator matches the exact guardian input in wizard step 3', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.emergencyContact, 'input[placeholder="Numéro en cas d\'urgence"]');
  const block = sourceWindow('placeholder="Numéro en cas d\'urgence"', 250, 100);
  assert.match(block, /<label>Contact d'Urgence<\/label>/);
  assert.match(block, /value=\{currentStudent\.emergencyContact \|\| ''\}/);
  requireScenarioCControl('emergencyContact', 3);
});

test('medical information controls expose stable unique ids in wizard step 4', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.allergies, '#student-allergies-input');
  assert.equal(REGISTRATION_CONTROL_SELECTORS.medicalConditions, '#student-medical-conditions-input');
  assert.equal(REGISTRATION_CONTROL_STEPS.allergies, 4);
  assert.equal(REGISTRATION_CONTROL_STEPS.medicalConditions, 4);
  assert.match(sourceWindow('id="student-allergies-input"'), /<textarea[\s\S]*?value=\{currentStudent\.allergies \|\| ''\}/);
  assert.match(sourceWindow('id="student-medical-conditions-input"'), /<textarea[\s\S]*?value=\{currentStudent\.medicalConditions \|\| ''\}/);
});

test('absence de problème médical uses the stable checkbox id in wizard step 4', () => {
  assert.equal(REGISTRATION_CONTROL_SELECTORS.noMedicalCondition, '#student-no-medical-condition-checkbox');
  const block = sourceWindow('id="student-no-medical-condition-checkbox"', 250, 500);
  assert.match(block, /type="checkbox"/);
  assert.match(block, /checked=\{noMedicalConditionConfirmed\}/);
  assert.match(block, /Aucune allergie ou condition médicale connue à signaler/);
  requireScenarioCControl('noMedicalCondition', 4);
});

test('scenario C uses exact form-scoped wizard actions', () => {
  assert.equal(occurrences(scenarioC, 'await clickNext(form);'), 3);
  assert.match(scenarioC, /registrationAction\(form, 'save'\)/);
  assert.match(harnessSource, /form\.getByRole\('button', \{ name: REGISTRATION_ACTION_NAMES\[name\], exact: true \}\)/);
});

test('scenario C wrong wizard steps fail with an explicit classification', () => {
  assert.throws(() => requireRegistrationControlStep('placeOfBirth', 3), error => error?.code === 'WRONG_REGISTRATION_WIZARD_STEP');
  assert.doesNotThrow(() => requireRegistrationControlStep('placeOfBirth', 1));
});

test('scenario C missing and ambiguous controls fail immediately', () => {
  assert.throws(() => requireUniqueRegistrationLocatorCount('placeOfBirth', 0), error => error?.code === 'MISSING_REGISTRATION_CONTROL');
  assert.throws(() => requireUniqueRegistrationLocatorCount('parentPhone', 2), error => error?.code === 'AMBIGUOUS_REGISTRATION_CONTROL');
});

test('scenario C contains no re-rooted has locator, arbitrary first, global text locator, or sleep', () => {
  assert.doesNotMatch(harnessSource, /function formField\(/);
  assert.doesNotMatch(scenarioC, /filter\(\{\s*has:|\.first\(\)|page\.getByText\(|waitForTimeout\(|sleep\(/);
  assert.equal(occurrences(scenarioC, "registrationControl(form, '"), 7);
});

test('missing controls fail immediately with an explicit classification', () => {
  assert.throws(
    () => requireUniqueRegistrationLocatorCount('lastName', 0),
    error => error?.code === 'MISSING_REGISTRATION_CONTROL'
  );
});

test('duplicate controls fail immediately with an explicit ambiguity classification', () => {
  assert.throws(
    () => requireUniqueRegistrationLocatorCount('lastName', 2),
    error => error?.code === 'AMBIGUOUS_REGISTRATION_CONTROL'
  );
  assert.doesNotThrow(() => requireUniqueRegistrationLocatorCount('lastName', 1));
});

test('scenario A no longer uses approximate labels or global wizard text locators', () => {
  assert.doesNotMatch(scenarioA, /formField\(|hasText:\s*['"]Étape/);
  assert.match(harnessSource, /page\.getByTestId\('modal-content'\)/);
  assert.match(harnessSource, /const REGISTRATION_LOCATOR_TIMEOUT_MS = 5_000/);
});
