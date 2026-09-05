import type { Student } from '../types';

export type RegistrationFileStatus = 'incomplete' | 'complete';

export const REGISTRATION_FIELD_LABELS: Record<string, string> = {
  dob: 'Date de naissance',
  placeOfBirth: 'Lieu de naissance',
  parentName: 'Nom du responsable légal',
  parentPhone: 'Téléphone du responsable légal',
  address: 'Adresse d’habitation',
  emergencyContact: 'Contact d’urgence',
  medicalInformation: 'Informations médicales ou confirmation d’absence',
  transportNeighborhood: 'Zone de transport',
  transportPickupPoint: 'Point de ramassage'
};

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

export const getMissingRegistrationFields = (student: Partial<Student>): string[] => {
  const missing: string[] = [];
  if (!hasText(student.dob)) missing.push('dob');
  if (!hasText(student.placeOfBirth)) missing.push('placeOfBirth');
  if (!hasText(student.parentName)) missing.push('parentName');
  if (!hasText(student.parentPhone)) missing.push('parentPhone');
  if (!hasText(student.address)) missing.push('address');
  if (!hasText(student.emergencyContact)) missing.push('emergencyContact');
  if (!hasText(student.allergies) && !hasText(student.medicalConditions) && student.noKnownMedicalCondition !== true) {
    missing.push('medicalInformation');
  }
  if (student.usesTransport === true) {
    if (!hasText(student.transportNeighborhood)) missing.push('transportNeighborhood');
    if (!hasText(student.transportPickupPoint)) missing.push('transportPickupPoint');
  }
  return missing;
};

export const getEffectiveRegistrationFile = (
  student: Partial<Student>
): { status: RegistrationFileStatus; missingFields: string[] } => {
  const missingFields = getMissingRegistrationFields(student);
  return { status: missingFields.length === 0 ? 'complete' : 'incomplete', missingFields };
};

export const getRegistrationFileFields = (student: Partial<Student>): {
  registrationFileStatus: RegistrationFileStatus;
  missingRegistrationFields: string[];
} => {
  const registrationFile = getEffectiveRegistrationFile(student);
  return {
    registrationFileStatus: registrationFile.status,
    missingRegistrationFields: registrationFile.missingFields
  };
};

export const getMissingStrictCreationFields = (student: Partial<Student>): string[] => {
  const missing: string[] = [];
  const hasLegacyIdentity = hasText(student.name);
  if (!hasText(student.studentLastName) && !hasLegacyIdentity) missing.push('studentLastName');
  if (!hasText(student.studentFirstName) && !hasLegacyIdentity) missing.push('studentFirstName');
  if (student.gender !== 'M' && student.gender !== 'F') missing.push('gender');
  if (student.section !== 'francophone' && student.section !== 'anglophone') missing.push('section');
  if (!hasText(student.classId)) missing.push('classId');
  if (!hasText(student.registrationYear)) missing.push('registrationYear');
  if (!hasText(student.schoolId)) missing.push('schoolId');
  return missing;
};
