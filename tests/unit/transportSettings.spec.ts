import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { School } from '../../src/types';
const mocks = vi.hoisted(() => ({ read: vi.fn(), call: vi.fn() }));
vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`, getDocFromServer: mocks.read }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
import { saveTransportSettings, transportSettingsPolicy } from '../../src/services/transportSettings';

const school = { id: 'legacy', academicYear: '2026-2027', transportPolicy: { secretaryManageAll: true } } as School;
const draft = { enabled: true, periods: '2026-10, 2026-09', pk14To33: '4000', pk34To42: '5000' };
beforeEach(() => vi.resetAllMocks());
describe('Transport persistence', () => {
  it('reproduces the legacy OFF case: missing months must not claim persistence or write', async () => {
    await expect(saveTransportSettings(school, { ...draft, periods: '' }, 'activation')).rejects.toThrow('mois facturables');
    expect(mocks.call).not.toHaveBeenCalled();
    expect(school.transportPolicy?.feePolicyId).toBeUndefined();
  });
  it('requires a reason and rejects out-of-year months and nonpositive rates without writing', async () => {
    await expect(saveTransportSettings(school, draft, '')).rejects.toThrow('motif');
    for (const periods of ['2026-08', '2027-09', '2026-13']) expect(() => transportSettingsPolicy(school.academicYear, { ...draft, periods })).toThrow();
    for (const pk14To33 of ['0', '-1', '1.5', '9007199254740992']) expect(() => transportSettingsPolicy(school.academicYear, { ...draft, pk14To33 })).toThrow();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('publishes the canonical legacy payload, then reads the actual server document', async () => {
    const stored = { ...school, financialTariffVersion: 'v1', transportPolicy: { ...school.transportPolicy, ...transportSettingsPolicy(school.academicYear, draft) } };
    mocks.call.mockResolvedValue({ data: { version: 'v1' } });
    mocks.read.mockResolvedValue({ exists: () => true, id: school.id, data: () => stored });
    expect(await saveTransportSettings(school, draft, 'activation')).toEqual(stored);
    expect(mocks.call.mock.calls[0][0]).toMatchObject({ schoolId: school.id, action: 'configure', expectedVersion: null,
      configuration: { transportPolicy: { feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10'], pkRates: { pk14To33: 4000, pk34To42: 5000 } } } });
    expect(mocks.read).toHaveBeenCalledWith('schools/legacy');
  });
  it('keeps periods and rates when disabling and supports reactivation', () => {
    const off = transportSettingsPolicy(school.academicYear, { ...draft, enabled: false });
    expect(off).toEqual({ ...transportSettingsPolicy(school.academicYear, draft), feePolicyId: null });
  });
  it('rejects silent backend no-op, stale values and failed server confirmation', async () => {
    mocks.call.mockResolvedValue({ data: { version: 'v1' } });
    mocks.read.mockResolvedValue({ exists: () => true, id: school.id, data: () => school });
    await expect(saveTransportSettings(school, draft, 'activation')).rejects.toThrow('configuration serveur diffère');
    mocks.read.mockRejectedValue(new Error('offline'));
    await expect(saveTransportSettings(school, draft, 'activation')).rejects.toThrow('offline');
  });
  it('surfaces RBAC and optimistic concurrency rejection', async () => {
    for (const message of ['permission-denied', 'Les tarifs ont changé']) {
      mocks.call.mockRejectedValue(new Error(message));
      await expect(saveTransportSettings(school, draft, 'activation')).rejects.toThrow(message);
    }
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
