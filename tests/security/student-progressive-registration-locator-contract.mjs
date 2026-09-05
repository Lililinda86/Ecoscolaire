export const REGISTRATION_CONTROL_SELECTORS = Object.freeze({
  lastName: 'input[required][placeholder="Ex: N’GONO"]',
  firstName: 'input[required][aria-describedby="student-first-name-error"]',
  gender: 'select:has(option[value="M"]):has(option[value="F"])',
  dob: 'input[type="date"]',
  placeOfBirth: 'input[placeholder="Ex: Yaoundé"]',
  section: 'select:has(option[value="francophone"]):has(option[value="anglophone"])',
  classId: 'select[required]',
  academicYear: 'input[readonly][aria-label="Année scolaire active"]',
  parentName: 'input[placeholder="Ex: Paul Dupont"]',
  parentPhone: 'input[placeholder="Ex: +237650336558"]',
  address: 'input[placeholder="Ex: Akwa, Douala"]',
  emergencyContact: 'input[placeholder="Numéro en cas d\'urgence"]',
  allergies: '#student-allergies-input',
  medicalConditions: '#student-medical-conditions-input',
  noMedicalCondition: '#student-no-medical-condition-checkbox'
});

export const REGISTRATION_CONTROL_STEPS = Object.freeze({
  lastName: 1,
  firstName: 1,
  gender: 1,
  dob: 1,
  placeOfBirth: 1,
  section: 2,
  classId: 2,
  academicYear: 2,
  parentName: 3,
  parentPhone: 3,
  address: 3,
  emergencyContact: 3,
  allergies: 4,
  medicalConditions: 4,
  noMedicalCondition: 4
});

export const REGISTRATION_CONTROL_SCOPES = Object.freeze({
  parentName: 'guardian',
  parentPhone: 'guardian',
  address: 'guardian',
  emergencyContact: 'guardian'
});

export const REGISTRATION_SCOPE_HEADINGS = Object.freeze({
  guardian: '🏠 Responsable Légal Principal (à compléter)'
});

export const REGISTRATION_ACTION_NAMES = Object.freeze({
  next: 'Suivant',
  save: 'Enregistrer'
});
export const REGISTRATION_STATUS_NAMES = Object.freeze({
  incomplete: 'À compléter',
  complete: 'Dossier complet'
});


export function requireUniqueRegistrationLocatorCount(name, count) {
  if (count === 0) {
    const error = new Error(`Registration control is missing: ${name}`);
    error.code = 'MISSING_REGISTRATION_CONTROL';
    throw error;
  }
  if (count !== 1) {
    const error = new Error(`Registration control is ambiguous: ${name} matched ${count} elements`);
    error.code = 'AMBIGUOUS_REGISTRATION_CONTROL';
    throw error;
  }
}
export async function waitForUniqueRegistrationLocator(locator, name, timeout = 5_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
  } catch (error) {
    requireUniqueRegistrationLocatorCount(name, await locator.count());
    throw error;
  }
  requireUniqueRegistrationLocatorCount(name, await locator.count());
  return locator;
}


export function requireRegistrationControlStep(name, actualStep) {
  const expectedStep = REGISTRATION_CONTROL_STEPS[name];
  if (expectedStep !== actualStep) {
    const error = new Error(`Registration control ${name} belongs to wizard step ${expectedStep}, not ${actualStep}`);
    error.code = 'WRONG_REGISTRATION_WIZARD_STEP';
    throw error;
  }
}
