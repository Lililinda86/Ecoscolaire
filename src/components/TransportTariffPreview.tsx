import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';
import { formatCurrency } from '../utils/paymentReceipt';

export function TransportTariffPreview({ schoolId, classId, zonePk }: { schoolId: string; classId?: string; zonePk?: number }) {
  const key = JSON.stringify([schoolId, classId, zonePk]);
  const [result, setResult] = useState<{ key: string; tariff: number | null; error: string } | null>(null);
  const tariff = result?.key === key ? result.tariff : null;
  const error = result?.key === key ? result.error : '';
  useEffect(() => {
    let active = true;
    if (!classId || !zonePk) return;
    const call = httpsCallable<Record<string, unknown>, { transportTariff: { monthlyGrossAmount: number } }>(functions, 'getSchoolFeeCatalog');
    void call({ schoolId, classId, zonePk }).then(result => {
      if (active) setResult({ key, tariff: result.data.transportTariff.monthlyGrossAmount, error: '' });
    }).catch(() => { if (active) setResult({ key, tariff: null, error: 'Tarif indisponible : vérifiez la classe et le point de ramassage.' }); });
    return () => { active = false; };
  }, [schoolId, classId, zonePk, key]);
  return <p aria-live="polite" data-testid="student-transport-tariff">
    Tarif mensuel : {tariff === null ? (error || 'Sélectionnez la classe et le PK pour obtenir le tarif serveur.') : `${formatCurrency(tariff)} FCFA — calculé automatiquement`}
    <br /><small>Un nouvel abonnement ou un changement de PK prend effet sur les prochaines mensualités non payées. Les mensualités historiques sont conservées.</small>
  </p>;
}
