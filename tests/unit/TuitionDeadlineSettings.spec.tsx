// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TuitionDeadlineSettings } from '../../src/components/Settings/TuitionDeadlineSettings';
import {
  getConfiguredTuitionInstallments,
  validateTuitionPaymentDeadlines
} from '../../src/utils/tuitionDeadlines';

describe('TuitionDeadlineSettings', () => {
  it('shows the dates and exposes a deadline-only save', async () => {
    const onSave = vi.fn();
    render(<TuitionDeadlineSettings
      academicYearName="2026-2027"
      value={{ T1: '2026-10-05', T2: '2026-12-05', T3: '2027-02-05' }}
      onChange={vi.fn()}
      onSave={onSave}
    />);
    expect((screen.getByLabelText('Échéance 1re tranche') as HTMLInputElement).value).toBe('2026-10-05');
    expect((screen.getByLabelText('Échéance 2e tranche') as HTMLInputElement).value).toBe('2026-12-05');
    expect((screen.getByLabelText('Échéance 3e tranche') as HTMLInputElement).value).toBe('2027-02-05');
    expect(screen.getByText(/montants, les tranches par classe et le calendrier Transport ne sont pas modifiés/i))
      .not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer uniquement les échéances/i }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('validates chronological dates inside the selected academic year', () => {
    expect(validateTuitionPaymentDeadlines('2026-2027', {
      T1: '2026-10-05', T2: '2026-12-05', T3: '2027-02-05'
    })).toBeNull();
    expect(validateTuitionPaymentDeadlines('2026-2027', {
      T1: '2026-12-05', T2: '2026-10-05', T3: '2027-02-05'
    })).toMatch(/chronologiques/);
  });

  it('does not expose a third installment when its configured amount is zero', () => {
    expect(getConfiguredTuitionInstallments({ feeT1: 70000, feeT2: 50000, feeT3: 0 }))
      .toEqual(['T1', 'T2']);
  });
});
