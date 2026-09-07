/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FinancialSettingsReadOnly } from '../../src/components/Settings/FinancialSettingsReadOnly';

vi.mock('../../src/components/Settings/SchoolFeeCatalog', () => ({
  SchoolFeeCatalog: () => <section>Catalogue financier en lecture seule</section>
}));
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({
  db: {
    school: {
      id: 'school-a', academicYear: '2026-2027', activeAcademicYearId: 'year-a',
      classFees: { CP: { registration: 15000, t1: 60000, t2: 50000, t3: 40000 } },
      transportPolicy: {
        billingPeriods: ['2026-09', '2026-10'],
        pkRates: { pk14To33: 4000, pk34To42: 5000 }
      }
    },
    academicYears: [{
      id: 'year-a', schoolId: 'school-a', name: '2026-2027',
      tuitionPaymentDeadlines: { T1: '2026-09-05', T2: '2027-01-10', T3: '2027-04-10' }
    }],
    classes: [{ id: 'class-a', schoolId: 'school-a', name: 'CP', type: 'francophone' }]
  }
}) }));

afterEach(cleanup);

it('shows only the financial information needed by a secretary', () => {
  render(<FinancialSettingsReadOnly />);
  expect(screen.getByRole('heading', { name: 'Paramètres financiers' })).toBeTruthy();
  expect(screen.getByText('2026-09-05')).toBeTruthy();
  expect(screen.getByText('60 000 FCFA')).toBeTruthy();
  expect(screen.getByText('4 000 FCFA / mois')).toBeTruthy();
  expect(screen.getByText('Catalogue financier en lecture seule')).toBeTruthy();
  expect(screen.queryByText(/Campay Secret/i)).toBeNull();
  expect(screen.queryByText(/Gouvernance/i)).toBeNull();
  expect(screen.queryByText(/Audit Logs/i)).toBeNull();
  expect(screen.queryByText(/Rôles & sécurité/i)).toBeNull();
});
