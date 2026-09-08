export type TuitionPaymentDeadlines = { T1: string; T2: string; T3: string };
export type TuitionInstallment = 'T1' | 'T2' | 'T3';

export const getConfiguredTuitionInstallments = (fees: {
  feeT1?: number; feeT2?: number; feeT3?: number;
} | null | undefined): TuitionInstallment[] => (['T1', 'T2', 'T3'] as TuitionInstallment[])
  .filter(installment => {
    const amount = fees?.[`fee${installment}` as 'feeT1' | 'feeT2' | 'feeT3'];
    return typeof amount === 'number' && Number.isSafeInteger(amount) && amount > 0;
  });

const isDate = (value: string): boolean => {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export const validateTuitionPaymentDeadlines = (
  academicYearName: string,
  deadlines: TuitionPaymentDeadlines
): string | null => {
  const match = /^(\d{4})-(\d{4})$/.exec(academicYearName);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return "L’année scolaire active est invalide.";
  const values = [deadlines.T1, deadlines.T2, deadlines.T3];
  if (!values.every(isDate)) return 'Chaque échéance doit être une date calendrier valide.';
  if (!(deadlines.T1 < deadlines.T2 && deadlines.T2 < deadlines.T3)) {
    return 'Les échéances T1, T2 et T3 doivent être strictement chronologiques.';
  }
  if (values.some(value => value < `${match[1]}-01-01` || value > `${match[2]}-12-31`)) {
    return 'Les échéances doivent appartenir aux années civiles couvertes par l’année scolaire.';
  }
  return null;
};
