/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassProgramEditor } from '../../src/pages/subjects/programs/editor/ClassProgramEditor';
import * as bulkService from '../../src/services/bulkClassSubjects';

vi.mock('../../src/services/bulkClassSubjects', () => ({
  bulkAddSubjectsToClasses: vi.fn()
}));

vi.mock('../../src/pages/subjects/programs/editor/ClassProgramSubjectPicker', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ClassProgramSubjectPicker: ({ onBulkSelect, onClose }: any) => (
    <div data-testid="mock-picker">
      <button onClick={() => onBulkSelect(['c1'], ['s1'])} data-testid="trigger-bulk-1">Bulk 1-1</button>
      <button onClick={() => onBulkSelect(['c1', 'c2'], ['s1', 's2'])} data-testid="trigger-bulk-2">Bulk 2-2</button>
      <button onClick={onClose} data-testid="close-picker">Close Picker</button>
    </div>
  )
}));

const mockClasses = [
  { id: 'c1', name: 'CE1', schoolId: 'school-1', section: 'francophone', cycle: 'primaire' },
  { id: 'c2', name: 'CM1', schoolId: 'school-1', section: 'francophone', cycle: 'primaire' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any;

describe('ClassProgramEditor Bulk Result UX', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const defaultProps = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialProgram: { id: 'p1', status: 'draft' } as any,
    initialSubjects: [],
    schoolId: 'school-1',
    academicYearId: 'ay-1',
    classId: 'c1',
    userId: 'u1',
    userRole: 'superAdmin',
    catalogSubjects: [],
    classes: mockClasses,
    onClose: vi.fn(),
    onSaveSuccess: vi.fn()
  };

  it('affiche le spinner compact avec texte correct pendant isSubmitting (singulier et pluriel)', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveBulk: any;
    const bulkPromise = new Promise(resolve => { resolveBulk = resolve; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bulkService.bulkAddSubjectsToClasses as any).mockReturnValue(bulkPromise);

    const { unmount } = render(<ClassProgramEditor {...defaultProps} />);

    // 1. Test singulier (1 matière à 1 classe)
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByTestId('trigger-bulk-1'));

    expect(screen.getByRole('status')).not.toBeNull();
    expect(screen.getByText('Traitement en cours...')).not.toBeNull();
    expect(screen.getByText('Ajout de 1 matière à 1 classe.')).not.toBeNull();

    resolveBulk({
      classesProcessed: 1, totalSubjectsAdded: 1, totalDuplicatesIgnored: 0,
      details: [{ classId: 'c1', status: 'success', added: 1, ignored: 0 }]
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    
    unmount();
    
    // 2. Test pluriel (2 matières à 2 classes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveBulk2: any;
    const bulkPromise2 = new Promise(resolve => { resolveBulk2 = resolve; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bulkService.bulkAddSubjectsToClasses as any).mockReturnValue(bulkPromise2);

    render(<ClassProgramEditor {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByTestId('trigger-bulk-2'));

    expect(screen.getByText('Ajout de 2 matières à 2 classes.')).not.toBeNull();

    resolveBulk2({
      classesProcessed: 2, totalSubjectsAdded: 4, totalDuplicatesIgnored: 0,
      details: []
    });
  });

  it('affiche les résultats sans doublon, avec doublons et échec partiel', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bulkService.bulkAddSubjectsToClasses as any).mockResolvedValue({
      classesProcessed: 2,
      totalSubjectsAdded: 3,
      totalDuplicatesIgnored: 2,
      details: [
        { classId: 'c1', status: 'success', added: 1, ignored: 0 },
        { classId: 'c2', status: 'success', added: 2, ignored: 2 },
        { classId: 'c3', status: 'error', added: 0, ignored: 0, error: 'Database timeout' }
      ]
    });

    render(<ClassProgramEditor {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByTestId('trigger-bulk-2'));

    await waitFor(() => {
      expect(screen.getByText('Résumé')).not.toBeNull();
    });

    // Check Résumé Global
    const summaryCard = screen.getByText('Résumé').parentElement;
    expect(summaryCard).not.toBeNull();
    expect(summaryCard!.textContent).toContain('Classes traitées : 2');
    expect(summaryCard!.textContent).toContain('Matières ajoutées : 3');
    expect(summaryCard!.textContent).toContain('Doublons ignorés : 2');

    // Check CE1 (sans doublon)
    expect(screen.getByText('CE1')).not.toBeNull();
    expect(screen.getByText('1 matière ajoutée')).not.toBeNull();
    expect(screen.getByText('Aucun doublon')).not.toBeNull();
    
    // Check absence de l'ancien format
    expect(screen.queryByText(/1 ajout\(s\)/)).toBeNull();

    // Check CM1 (avec doublons)
    expect(screen.getByText('CM1')).not.toBeNull();
    expect(screen.getByText('2 matières ajoutées')).not.toBeNull();
    expect(screen.getByText('2 doublons ignorés')).not.toBeNull();

    // Check Error
    expect(screen.getByText('c3')).not.toBeNull();
    expect(screen.getByText('Erreur : Database timeout')).not.toBeNull();
  });

  it('bouton Fermer et recharger désactive et affiche Rechargement...', async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bulkService.bulkAddSubjectsToClasses as any).mockResolvedValue({
      classesProcessed: 1, totalSubjectsAdded: 1, totalDuplicatesIgnored: 0,
      details: [{ classId: 'c1', status: 'success', added: 1, ignored: 0 }]
    });

    render(<ClassProgramEditor {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /Ajouter une matière/i }));
    await user.click(screen.getByTestId('trigger-bulk-1'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fermer et recharger' })).not.toBeNull();
    });

    // On mock reload pour ne pas faire planter jsdom
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true
    });

    const btn = screen.getByRole('button', { name: 'Fermer et recharger' });
    await user.click(btn);

    expect(reloadMock).toHaveBeenCalled();
    expect(btn.textContent).toBe('Rechargement...');
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
