import type { AdvantageTarget } from './StudentAccountBenefitsDrawer';
import type { FinancialBenefitMode } from '../types';
import { formatCurrency } from '../utils/paymentReceipt';

interface Props {
  target: AdvantageTarget | null;
  moratorium: boolean;
  mode: FinancialBenefitMode;
  value: string;
  newDueDate: string;
}

const dateLabel = (date?: string | null) => {
  if (!date) return 'Non renseignée';
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : date;
};

export default function AdvantageRequestPreview({ target, moratorium, mode, value, newDueDate }: Props) {
  const current = target?.netExpectedAmount;
  const requested = Number(value);
  const valid = value.trim() !== '' && Number.isSafeInteger(requested) && requested > 0
    && (mode !== 'PERCENTAGE' || requested <= 100);
  // Informational arithmetic only: never submitted, applied to account state, or used as a quote.
  const estimate = valid && current !== undefined && Number.isSafeInteger(current) && current >= 0
    ? mode === 'PERCENTAGE' ? Math.round(current * requested / 100) : requested
    : null;
  const after = estimate !== null && current !== undefined && estimate <= current ? current - estimate : null;
  return <section className="advantage-preview wide-field" aria-label="Aperçu">
    <h3>APERÇU</h3>
    {!target ? <p>Sélectionnez un frais concerné pour afficher l’aperçu.</p> : moratorium ? <>
      <dl>
        <div><dt>Montant dû</dt><dd>{target.remainingBalance !== undefined ? formatCurrency(target.remainingBalance) : 'Non disponible'} — INCHANGÉ</dd></div>
        <div><dt>Échéance actuelle</dt><dd>{dateLabel(target.effectiveDueDate || target.originalDueDate)}</dd></div>
        <div><dt>Nouvelle échéance demandée</dt><dd>{dateLabel(newDueDate)}</dd></div>
      </dl>
      <p>Le moratoire reporte l'échéance mais ne réduit pas le montant dû.</p>
    </> : <>
      <dl>
        <div><dt>Tarif actuel</dt><dd>{current !== undefined ? formatCurrency(current) : 'Non disponible pour ce périmètre'}</dd></div>
        <div><dt>Réduction demandée</dt><dd>{valid ? mode === 'PERCENTAGE' ? `−${requested} %` : `−${formatCurrency(requested)}` : 'À renseigner'}</dd></div>
        {mode === 'PERCENTAGE' && <div><dt>Réduction estimée</dt><dd>{estimate !== null ? `−${formatCurrency(estimate)}` : 'Non disponible'}</dd></div>}
        <div><dt>Après approbation</dt><dd>{after !== null ? formatCurrency(after) : 'Estimation non disponible'}</dd></div>
      </dl>
      <p>Estimation indicative sur le tarif actuel, hors vérification du cumul et des conditions d’éligibilité. Le montant final sera déterminé par l’application.</p>
    </>}
    <p className="advantage-preview-approval">Cet avantage ne modifiera le compte de l'élève qu'après approbation.</p>
  </section>;
}
