import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REGISTRATION_ACTION_NAMES,
  REGISTRATION_CONTROL_SELECTORS,
  requireUniqueRegistrationLocatorCount
} from './student-progressive-registration-locator-contract.mjs';

const studentsSource = readFileSync(new URL('../../src/pages/Students.tsx', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../scripts/test-student-progressive-registration-staging.mjs', import.meta.url), 'utf8');
const scenarioA = harnessSource.slice(
  harnessSource.indexOf('async function scenarioMinimal()'),
  harnessSource.indexOf('async function scenarioReload()')
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
  assert.match(harnessSource, /form\.locator\(REGISTRATION_CONTROL_SELECTORS\[name\]\)/);
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
