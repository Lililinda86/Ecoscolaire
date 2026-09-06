/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentAccountBenefitsDrawer from '../../src/components/StudentAccountBenefitsDrawer';

const drawerCss = readFileSync(resolve(process.cwd(), 'src/components/StudentAccountBenefitsDrawer.css'), 'utf8');

const mocks = vi.hoisted(() => ({
  benefitDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  moratoriumDocs: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
  calls: [] as Array<{ name: string; payload: Record<string, unknown> }>,
  responses: new Map<string, Record<string, unknown>>(),
  readGate: undefined as Promise<void> | undefined,
  actionGate: undefined as Promise<void> | undefined
}));

vi.mock('../../src/db/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name: string) => name),
  where: vi.fn((...args) => args),
  query: vi.fn((...args) => args),
  getDocs: vi.fn(async (queryValue: unknown[]) => {
    if (mocks.readGate) await mocks.readGate;
    return { docs: queryValue[0] === 'financialBenefits' ? mocks.benefitDocs : mocks.moratoriumDocs };
  })
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions, name: string) => async (payload: Record<string, unknown>) => {
    mocks.calls.push({ name, payload });
    if (mocks.actionGate) await mocks.actionGate;
    return { data: mocks.responses.get(name) || { status: 'draft', benefitId: 'benefit-new', moratoriumId: 'moratorium-new' } };
  })
}));

const targets = [
  {
    key: 'registration_fee', type: 'registration_fee' as const, label: 'Inscription',
    installment: null, period: null, originalDueDate: '2026-08-15', effectiveDueDate: '2026-08-15'
  },
  {
    key: 'tuition:T1', type: 'tuition' as const, label: 'Scolarité T1',
    installment: 'T1' as const, period: null, originalDueDate: '2026-09-05', effectiveDueDate: '2026-09-05'
  },
  {
    key: 'transport:2026-09', type: 'transport' as const, label: 'Transport septembre',
    installment: null, period: '2026-09', originalDueDate: '2026-09-10', effectiveDueDate: '2026-09-10'
  },
  {
    key: 'uniforms', type: 'uniforms' as const, label: 'Tenue scolaire',
    installment: null, period: null, originalDueDate: null, effectiveDueDate: null
  }
];

const renderDrawer = (role: 'secretary' | 'director' | 'accountant' = 'secretary', overrides = {}) => {
  const props = {
    open: true,
    schoolId: 'school-1',
    studentId: 'student-1',
    academicYear: '2026-2027',
    currentRole: role,
    targets,
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides
  };
  render(<StudentAccountBenefitsDrawer {...props} />);
  return props;
};

const deferredRead = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

describe('StudentAccountBenefitsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.benefitDocs = [];
    mocks.moratoriumDocs = [];
    mocks.calls = [];
    mocks.responses.clear();
    mocks.readGate = undefined;
    mocks.actionGate = undefined;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exposes the supported types and draft/submission actions to a secretary', async () => {
    renderDrawer('secretary');

    expect(await screen.findByRole('dialog', { name: 'Ajouter un avantage ou aménagement' })).toBeTruthy();
    const type = screen.getByLabelText('Type') as HTMLSelectElement;
    expect(Array.from(type.options).map(option => option.textContent)).toEqual([
      'Bourse', 'Réduction familiale', 'Bon de réduction', 'Remise exceptionnelle', 'Moratoire'
    ]);
    expect(screen.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soumettre pour approbation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
  });

  it('creates a scoped scholarship draft without applying a financial change', async () => {
    const creationResponse = deferredRead();
    mocks.actionGate = creationResponse.promise;
    renderDrawer('secretary');
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:T1' } });
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Bourse sociale documentée' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));

    try {
      await waitFor(() => expect(mocks.calls.some(call => call.name === 'createFinancialBenefit')).toBe(true));
      expect(screen.queryByText('Brouillon enregistré.')).toBeNull();
    } finally {
      // Recording the callable does not mean its response reached the UI.
      creationResponse.resolve();
    }
    const creation = mocks.calls.find(call => call.name === 'createFinancialBenefit');
    expect(creation?.payload).toMatchObject({
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYear: '2026-2027',
      benefitType: 'SCHOLARSHIP',
      paymentType: 'TUITION',
      installment: 'T1',
      mode: 'FIXED_AMOUNT',
      value: 12000
    });
    expect(mocks.calls.some(call => call.name === 'submitFinancialBenefit')).toBe(false);
    expect(await screen.findByText('Brouillon enregistré.')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Enregistrer le brouillon' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('supports percentage, annual tuition scope and voucher reference validation', async () => {
    renderDrawer('secretary');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'DISCOUNT_VOUCHER' } });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'PERCENTAGE' } });
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:ALL_TUITION' } });
    fireEvent.change(screen.getByLabelText(/^Pourcentage/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Bon familial annuel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre pour approbation' }));
    expect((await screen.findByRole('alert')).textContent).toContain('référence du bon');

    fireEvent.change(screen.getByLabelText('Code / référence'), { target: { value: 'BON-2026-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre pour approbation' }));
    await waitFor(() => expect(mocks.calls.some(call => call.name === 'submitFinancialBenefit')).toBe(true));
    expect(mocks.calls.find(call => call.name === 'createFinancialBenefit')?.payload).toMatchObject({
      installment: 'ALL_TUITION', mode: 'PERCENTAGE', value: 10, reference: 'BON-2026-01'
    });
  });

  it('creates and submits a moratorium while keeping the amount explicitly unchanged', async () => {
    renderDrawer('secretary');
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'MORATORIUM' } });
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:T1' } });

    expect(screen.getByDisplayValue('05/09/2026')).toBeTruthy();
    expect(screen.getByText('Montant dû inchangé.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nouvelle échéance'), { target: { value: '2026-11-05' } });
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Délai accordé par la direction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre pour approbation' }));

    await waitFor(() => expect(mocks.calls.some(call => call.name === 'submitPaymentMoratorium')).toBe(true));
    expect(mocks.calls.find(call => call.name === 'createPaymentMoratorium')?.payload).toMatchObject({
      paymentType: 'tuition', installment: 'T1', effectiveDueDate: '2026-11-05'
    });
  });

  describe('director decisions', () => {
    beforeEach(() => {
      mocks.benefitDocs = [{
        id: 'benefit-pending',
        data: () => ({
          schoolId: 'school-1', studentId: 'student-1', academicYear: '2026-2027',
          benefitType: 'FAMILY_DISCOUNT', paymentType: 'TUITION', installment: 'T1',
          mode: 'PERCENTAGE', value: 5, stackable: true, reason: 'Famille', status: 'pending'
        })
      }];
    });

    it('exposes decision buttons only after pending requests have loaded', async () => {
      const read = deferredRead();
      mocks.readGate = read.promise;
      const { onChanged } = renderDrawer('director');
      const history = within(screen.getByRole('region', { name: 'Demandes de l’élève' }));

      try {
        // The form option exists before the request: its text is not a readiness signal.
        expect((await screen.findByText('Réduction familiale')).tagName).toBe('OPTION');
        expect(history.getByRole('status').textContent).toBe('Chargement des demandes…');
        expect(history.queryByRole('button', { name: 'Approuver' })).toBeNull();
        expect(history.queryByRole('button', { name: 'Refuser' })).toBeNull();
      } finally {
        await act(async () => { read.resolve(); await read.promise; });
      }

      expect(await history.findByRole('button', { name: 'Approuver' })).toBeTruthy();
      expect(await history.findByRole('button', { name: 'Refuser' })).toBeTruthy();
      expect(history.getByText('Réduction familiale')).toBeTruthy();
      expect(history.queryByRole('status')).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it.each([
      { action: 'approve', button: 'Approuver', message: 'Demande approuvée.', refreshCount: 1 },
      { action: 'reject', button: 'Refuser', message: 'Demande refusée.', refreshCount: 0 }
    ] as const)('lets a director $action a pending request and refreshes the account only on approval', async ({ action, button, message, refreshCount }) => {
      const user = userEvent.setup();
      const onChanged = vi.fn();
      const reason = 'Pièce justificative manquante';
      if (action === 'reject') vi.spyOn(window, 'prompt').mockReturnValue(reason);
      renderDrawer('director', { onChanged });
      const history = within(screen.getByRole('region', { name: 'Demandes de l’élève' }));
      const decisionButton = await history.findByRole('button', { name: button });
      expect(history.getByText('Réduction familiale')).toBeTruthy();

      const refresh = deferredRead();
      mocks.readGate = refresh.promise;
      try {
        await user.click(decisionButton);
        expect(await screen.findByText(message)).toBeTruthy();
        expect(mocks.calls).toEqual([{
          name: `${action}FinancialBenefit`,
          payload: { benefitId: 'benefit-pending', ...(action === 'reject' ? { reason } : {}) }
        }]);
        expect(history.getByRole('status').textContent).toBe('Chargement des demandes…');
        // A recorded callable does not mean the refresh or onChanged has completed.
        expect(onChanged).not.toHaveBeenCalled();
      } finally {
        await act(async () => { refresh.resolve(); await refresh.promise; });
      }

      await waitFor(() => expect((history.getByRole('button', { name: 'Actualiser' }) as HTMLButtonElement).disabled).toBe(false));
      expect(history.queryByRole('status')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe(message);
      expect(onChanged).toHaveBeenCalledTimes(refreshCount);
      expect(mocks.calls).toHaveLength(1);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('closes with Escape only when no unsaved information exists and restores focus', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const props = renderDrawer('secretary');
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    cleanup();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it.each([360, 768, 1440])('keeps the drawer usable at %ipx', width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    renderDrawer('secretary');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('defines a right-side desktop drawer and full-width mobile layout', () => {
    expect(drawerCss).toMatch(/justify-content:\s*flex-end/);
    expect(drawerCss).toMatch(/width:\s*min\(560px,\s*94vw\)/);
    expect(drawerCss).toMatch(/@media\s*\(max-width:\s*560px\)[\s\S]*\.advantage-drawer\s*\{[^}]*width:\s*100vw/);
  });

  it.each([
    ['SCHOLARSHIP', "Ex. bourse accordée pour l'année scolaire"],
    ['FAMILY_DISCOUNT', 'Ex. famille ayant plusieurs enfants inscrits'],
    ['DISCOUNT_VOUCHER', 'Ex. bon de réduction accordé à cette famille'],
    ['EXCEPTIONAL_DISCOUNT', 'Indiquez la raison de cette remise exceptionnelle'],
    ['MORATORIUM', "Indiquez la raison du report d'échéance"]
  ])('provides a contextual mandatory reason for %s', (type, placeholder) => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: type } });
    expect(screen.getByPlaceholderText(placeholder)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:T1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    expect(screen.getByRole('alert').textContent).toContain('motif est obligatoire');
    expect(mocks.calls).toEqual([]);
  });

  it('shows the server balance, the simpler stacking label and an informational preview', () => {
    renderDrawer('secretary', { targets: targets.map(t => ({ ...t, netExpectedAmount: 60000, remainingBalance: 48000 })) });
    expect(screen.getByRole('option', { name: /Scolarité T1 — reste 48/ })).toBeTruthy();
    expect(screen.getByLabelText('Peut être cumulé avec un autre avantage')).toBeTruthy();
    expect(screen.getByText("L'application vérifiera automatiquement si le cumul est autorisé.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:T1' } });
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '12000' } });
    expect(screen.getByRole('region', { name: 'Aperçu' })).toBeTruthy();
    expect(mocks.calls).toEqual([]);
  });

  it('hides financial amount and stacking inputs for moratorium without changing its payload', () => {
    renderDrawer();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'MORATORIUM' } });
    expect(screen.queryByLabelText('Mode')).toBeNull();
    expect(screen.queryByLabelText(/^Montant/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByLabelText('Nouvelle échéance')).toBeTruthy();
  });

  it.each(['secretary', 'owner'] as const)('preserves pending request permissions for %s', async role => {
    mocks.benefitDocs = [{ id: 'pending', data: () => ({ studentId: 'student-1', academicYear: '2026-2027', benefitType: 'SCHOLARSHIP', mode: 'FIXED_AMOUNT', value: 1000, installment: 'T1', status: 'pending' }) }];
    const onChanged = vi.fn();
    renderDrawer('secretary', { currentRole: role, onChanged });
    await screen.findByText('EN ATTENTE');
    expect(screen.getByText('Frais concerné : Scolarité T1')).toBeTruthy();
    if (role === 'secretary') {
      expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
      expect(mocks.calls).toEqual([]);
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));
      await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
      expect(mocks.calls).toEqual([{ name: 'approveFinancialBenefit', payload: { benefitId: 'pending' } }]);
    }
  });

  it.each(['FAMILY_DISCOUNT', 'EXCEPTIONAL_DISCOUNT'])('submits %s through the unchanged approval workflow', async benefitType => {
    const props = renderDrawer();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: benefitType } });
    fireEvent.change(screen.getByLabelText('Frais concerné'), { target: { value: 'tuition:T1' } });
    fireEvent.change(screen.getByLabelText(/^Montant/), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Motif documenté' } });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre pour approbation' }));
    await waitFor(() => expect(mocks.calls).toHaveLength(2));
    expect(mocks.calls.map(c => c.name)).toEqual(['createFinancialBenefit', 'submitFinancialBenefit']);
    expect(mocks.calls[0].payload.benefitType).toBe(benefitType);
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});
