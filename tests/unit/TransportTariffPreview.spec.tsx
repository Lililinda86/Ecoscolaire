/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { TransportTariffPreview } from '../../src/components/TransportTariffPreview';
const mock = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mock.call }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each([0, 4000, 5000])('renders the server amount %i without calculating a tariff', async amount => {
  mock.call.mockResolvedValue({ data: { transportTariff: { monthlyGrossAmount: amount } } });
  render(<TransportTariffPreview schoolId="test-school" classId="test-class" zonePk={18} />);
  await waitFor(() => expect(screen.getByTestId('student-transport-tariff').textContent?.replace(/\s/g, '')).toContain(`${amount}FCFA`));
  expect(mock.call).toHaveBeenCalledWith({ schoolId: 'test-school', classId: 'test-class', zonePk: 18 });
  expect(screen.getByTestId('student-transport-tariff').textContent?.match(/FCFA/g)).toHaveLength(1);
});
it('does not invent a price when the server is unavailable', async () => {
  mock.call.mockRejectedValue(new Error('unavailable'));
  render(<TransportTariffPreview schoolId="test-school" classId="test-class" zonePk={36} />);
  await waitFor(() => expect(screen.getByText(/Tarif indisponible/)).toBeTruthy());
  expect(screen.getByTestId('student-transport-tariff').textContent).not.toContain('5000');
});
