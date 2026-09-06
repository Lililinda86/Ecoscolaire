import type { ObligationSnapshot } from './financialObligationSnapshots';
type Data = Record<string, unknown>;

/** Prefer a published historical gross tariff to today's configuration when no obligation snapshot exists.
 * Never infer a gross tariff from the amount received or from a discounted net amount. */
export function recoverHistoricalTariffs(existing: Record<string, ObligationSnapshot>, payments: Data[],
  scope: { schoolId: string; studentId: string; academicYear: string; classId: string }) {
  const result = { ...existing };
  const ordered = [...payments].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  for (const payment of ordered) {
    if (payment.schoolId !== scope.schoolId || payment.studentId !== scope.studentId || payment.academicYear !== scope.academicYear
      || typeof payment.amount !== 'number' || payment.amount <= 0
      || ['pending', 'failed', 'cancelled', 'canceled'].includes(String(payment.status || '').toLowerCase())) continue;
    const lines = payment.type === 'collection' && Array.isArray(payment.lineItems) ? payment.lineItems as Data[] : [payment];
    for (const line of lines) {
      const key = typeof line.key === 'string' ? line.key : line.type === 'tuition' ? `tuition:${line.installment}`
        : line.type === 'transport' && line.period ? `transport:${line.period}` : String(line.type);
      if (!/^(tuition:T[123]|transport:\d{4}-(0[1-9]|1[0-2])|registration_fee|uniforms|other:.+)$/.test(key) || result[key]) continue;
      const gross = line.grossExpectedAmount;
      if (typeof gross !== 'number' || !Number.isSafeInteger(gross) || gross <= 0) continue;
      const due = typeof line.originalDueDate === 'string' ? line.originalDueDate : null;
      result[key] = { ...scope, key, category: String(line.category || line.type), cycle: String(payment.cycle || ''),
        classId: String(payment.classId || scope.classId), grossExpectedAmount: gross, originalDueDate: due,
        tariffVersion: `legacy-payment:${String(payment.paymentId || payment.id || 'snapshot')}`,
        recoveredFromPayment: true, zonePk: line.zonePk ?? (payment.transportContext as Data | undefined)?.zonePk ?? null };
    }
  }
  return result;
}
