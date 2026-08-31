import type { ClassSection, Student } from '../types';

export const isValidTransportZonePk = (zonePk: unknown): zonePk is number =>
  typeof zonePk === 'number'
  && Number.isSafeInteger(zonePk)
  && zonePk >= 14
  && zonePk <= 42;

export const isSecondaryClass = (classData?: Partial<ClassSection>): boolean =>
  classData?.cycle === 'secondary'
  || classData?.level === 'secondaire'
  || classData?.catalogLevelId?.includes('-secondary-') === true;

export const resolveTransportEnrollmentStatus = ({
  usesTransport,
  transportZonePk,
  classData
}: {
  usesTransport: boolean;
  transportZonePk: unknown;
  classData?: Partial<ClassSection>;
}): NonNullable<Student['transportStatus']> => {
  if (!usesTransport) return 'none';
  if (isSecondaryClass(classData)) return 'active';
  return isValidTransportZonePk(transportZonePk) ? 'active' : 'needs_configuration';
};

export const getTransportEnrollmentStatusLabel = (
  status: NonNullable<Student['transportStatus']>
): string => {
  if (status === 'active') return 'Configuré';
  if (status === 'needs_configuration') return 'À compléter';
  if (status === 'suspended') return 'Suspendu';
  return 'Inactif';
};
