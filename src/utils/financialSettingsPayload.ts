import type { School } from '../types';

// Input normalization only. No debt, discount, allocation or payable amount is computed here.
export function financialSettingsPayload(school: School) {
  return {
    globalFees: { feeT1: 0, feeT2: 0, feeT3: 0, feeTransport: 0, feeUniforms: 0, ...school.globalFees },
    classFees: school.classFees || {},
    transportPolicy: { feePolicyId: school.transportPolicy?.feePolicyId || null,
      billingPeriods: school.transportPolicy?.billingPeriods || [],
      pkRates: school.transportPolicy?.pkRates || { pk14To33: 4000, pk34To42: 5000 } }
  };
}
export const stableConfiguration = (value: unknown): string => {
  const normalized = (item: unknown): unknown => Array.isArray(item) ? item.map(normalized)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalized(child)])) : item;
  return JSON.stringify(normalized(value));
};
