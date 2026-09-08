import React from 'react';
import type { TuitionPaymentDeadlines } from '../../utils/tuitionDeadlines';

interface Props {
  academicYearName: string;
  value: TuitionPaymentDeadlines;
  disabled?: boolean;
  saving?: boolean;
  onChange: (value: TuitionPaymentDeadlines) => void;
  onSave: () => void;
}

const labels: Array<{ key: keyof TuitionPaymentDeadlines; label: string }> = [
  { key: 'T1', label: '1re tranche' },
  { key: 'T2', label: '2e tranche' },
  { key: 'T3', label: '3e tranche' }
];

export const TuitionDeadlineSettings: React.FC<Props> = ({
  academicYearName, value, disabled = false, saving = false, onChange, onSave
}) => (
  <div className="card" data-testid="tuition-deadline-settings">
    <h2>Paramètres &gt; Paiements : échéances de scolarité</h2>
    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
      Année scolaire <strong>{academicYearName || 'non configurée'}</strong>. Ces dates sont communes à
      l’école. Chaque classe utilise uniquement les tranches monétaires déjà configurées pour elle.
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'end' }}>
      {labels.map(({ key, label }) => (
        <label key={key} style={{ display: 'grid', gap: '0.35rem', minWidth: '180px' }}>
          {label}
          <input
            aria-label={`Échéance ${label}`}
            type="date"
            value={value[key]}
            disabled={disabled || saving}
            onChange={event => onChange({ ...value, [key]: event.target.value })}
          />
        </label>
      ))}
      <button type="button" onClick={onSave} disabled={disabled || saving || !academicYearName}>
        {saving ? 'Enregistrement…' : 'Enregistrer uniquement les échéances'}
      </button>
    </div>
    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 0 }}>
      Les montants, les tranches par classe et le calendrier Transport ne sont pas modifiés par cette action.
    </p>
  </div>
);
