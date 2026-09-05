export const REGISTRATION_CONTROL_SELECTORS = Object.freeze({
  lastName: 'input[required][placeholder="Ex: N’GONO"]',
  firstName: 'input[required][aria-describedby="student-first-name-error"]',
  gender: 'select:has(option[value="M"]):has(option[value="F"])',
  section: 'select:has(option[value="francophone"]):has(option[value="anglophone"])',
  classId: 'select[required]',
  academicYear: 'input[readonly][aria-label="Année scolaire active"]'
});

export const REGISTRATION_ACTION_NAMES = Object.freeze({
  next: 'Suivant',
  save: 'Enregistrer'
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
