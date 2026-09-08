import type { ReactNode } from 'react';
import { formatCurrency } from '../utils/paymentReceipt';
import './AccountFeeGroups.css';

export interface AccountFeeGroup {
  key: string;
  label: string;
  lineKeys: string[];
  transportRates?: Array<{ zonePk: number | null; monthlyAmount: number }>;
  totals: { totalBilled: number; totalBenefits: number; totalPaid: number; totalRemaining: number; overdueAmount: number };
}

/** Summaries are authoritative account projections; never recompute a debt here. */
export function AccountFeeGroups<T extends { key: string }>({ groups, lines, renderLine }: {
  groups?: AccountFeeGroup[];
  lines: T[];
  renderLine: (line: T) => ReactNode;
}) {
  if (!groups) return <>{lines.map(renderLine)}</>;
  return <>{groups.map(group => <details className="account-fee-group" key={group.key} open={group.key === 'registration'}>
    <summary>
      <strong>{group.label}</strong>
      <span className="fee-group-totals">
        <span>Total : {formatCurrency(group.totals.totalBilled)}</span>
        {group.totals.totalBenefits > 0 && <span>Avantages : {formatCurrency(group.totals.totalBenefits)}</span>}
        <span>Payé : {formatCurrency(group.totals.totalPaid)}</span>
        <b>Reste : {formatCurrency(group.totals.totalRemaining)}</b>
      </span>
      <span className="fee-group-toggle">{group.key === 'transport' ? 'Voir les mois' : 'Voir les échéances'} ({group.lineKeys.length})</span>
      {group.transportRates?.map(rate => <span className="fee-group-totals" key={`${rate.zonePk}:${rate.monthlyAmount}`}>{rate.zonePk === null ? 'Transport' : `PK${rate.zonePk}`} · Tarif établi : {formatCurrency(rate.monthlyAmount)}/mois</span>)}
    </summary>
    <div className="fee-group-lines">{group.lineKeys.map(key => lines.find(line => line.key === key)).filter((line): line is T => !!line).map(renderLine)}</div>
  </details>)}</>;
}
