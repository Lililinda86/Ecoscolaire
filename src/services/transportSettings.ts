import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../db/firebase';
import type { School } from '../types';
import { financialSettingsPayload, stableConfiguration } from '../utils/financialSettingsPayload';

export interface TransportSettingsDraft {
  enabled: boolean;
  periods: string;
  pk14To33: string;
  pk34To42: string;
}

export function transportSettingsPolicy(year: string, draft: TransportSettingsDraft) {
  if (!/^\d{4}-\d{4}$/.test(year) || Number(year.slice(5)) !== Number(year.slice(0, 4)) + 1) {
    throw new Error('Année scolaire active invalide.');
  }
  const periods = [...new Set(draft.periods.split(/[\s,;]+/).filter(Boolean))].sort();
  if (draft.enabled && !periods.length) throw new Error('Transport non enregistré : renseignez les mois facturables validés (YYYY-MM).');
  if (periods.length > 12 || periods.some(p => !/^\d{4}-(0[1-9]|1[0-2])$/.test(p) || p < `${year.slice(0, 4)}-09` || p > `${year.slice(5)}-08`)) {
    throw new Error('Les mois facturables doivent appartenir à l’année scolaire (septembre à août, 12 mois maximum).');
  }
  const rate = (value: string) => {
    if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
      throw new Error('Le tarif Transport doit être un entier strictement positif.');
    }
    return Number(value);
  };
  return { feePolicyId: draft.enabled ? 'ITALO_PK_2026' as const : null, billingPeriods: periods,
    pkRates: { pk14To33: rate(draft.pk14To33), pk34To42: rate(draft.pk34To42) } };
}

// The existing versioned callable is the only writer. No obligation or payment is written here.
export async function saveTransportSettings(school: School, draft: TransportSettingsDraft, reason: string): Promise<School> {
  const transportPolicy = transportSettingsPolicy(school.academicYear, draft);
  const configuration = { ...financialSettingsPayload(school), transportPolicy };
  let expectedVersion = school.financialTariffVersion || null;
  if (stableConfiguration(configuration) !== stableConfiguration(financialSettingsPayload(school))) {
    if (!reason.trim()) throw new Error('Transport non enregistré : indiquez le motif de la modification.');
    const response = await httpsCallable<Record<string, unknown>, { version: string }>(functions, 'manageSchoolFee')({
      schoolId: school.id, action: 'configure', academicYear: school.academicYear,
      expectedVersion, reason: reason.trim(), configuration
    });
    expectedVersion = response.data.version;
  }
  const snapshot = await getDocFromServer(doc(db, 'schools', school.id));
  if (!snapshot.exists()) throw new Error('Établissement introuvable : enregistrement non confirmé.');
  const saved = { ...snapshot.data(), id: snapshot.id } as School;
  if ((saved.financialTariffVersion || null) !== expectedVersion
      || stableConfiguration(financialSettingsPayload(saved)) !== stableConfiguration(configuration)) {
    throw new Error('La configuration serveur diffère : rechargez les paramètres avant de réessayer.');
  }
  return saved;
}
