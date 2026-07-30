/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassProgramSubjectPicker } from '../../src/pages/subjects/programs/editor/ClassProgramSubjectPicker';

describe('ClassProgramSubjectPicker UX', () => {
  const mockClasses = [
    { id: 'c1', name: 'Maternelle 1', schoolId: 'school-1', section: 'francophone', cycle: 'maternelle' },
    { id: 'c2', name: 'Maternelle 2', schoolId: 'school-1', section: 'francophone', cycle: 'maternelle' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  const mockSubjects = [
    { id: 's1', name: 'Dessin', schoolId: 'school-1', section: 'all', cycles: ['maternelle'] },
    { id: 's2', name: 'Chant', schoolId: 'school-1', section: 'all', cycles: ['maternelle'] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any;

  afterEach(() => {
    cleanup();
  });

  it('affiche les onglets et permet la navigation sur mobile', async () => {
    const user = userEvent.setup();
    render(
      <ClassProgramSubjectPicker
        schoolId="school-1"
        classId="c1"
        selectedClass={mockClasses[0]}
        classes={mockClasses}
        catalogSubjects={mockSubjects}
        activeSubjects={[]}
        onBulkSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Vérifie que les boutons d'onglets sont présents
    const tabClasses = screen.getByRole('tab', { name: /1\. Classes/i });
    const tabSubjects = screen.getByRole('tab', { name: /2\. Matières/i });
    expect(tabClasses).toBeDefined();
    expect(tabSubjects).toBeDefined();

    // Par défaut, l'onglet Classes est sélectionné
    expect(tabClasses.getAttribute('aria-selected')).toBe('true');

    const panelClasses = screen.getByRole('tabpanel', { name: /1\. Classes/i });
    const panelSubjects = screen.getByRole('tabpanel', { name: /2\. Matières/i });

    expect(panelClasses.className).toContain('flex');
    expect(panelSubjects.className).toContain('hidden');

    // Clic sur l'onglet "2. Matières"
    await user.click(tabSubjects);
    expect(tabSubjects.getAttribute('aria-selected')).toBe('true');
    expect(panelClasses.className).toContain('hidden');
    expect(panelSubjects.className).toContain('flex');

    // Clic pour revenir
    await user.click(tabClasses);
    expect(tabClasses.getAttribute('aria-selected')).toBe('true');

    // Bouton "Continuer vers les matières"
    const btnContinue = screen.getByRole('button', { name: /Continuer vers les matières/i });
    await user.click(btnContinue);
    expect(tabSubjects.getAttribute('aria-selected')).toBe('true');
  });

  it('affiche correctement les libellés et gère la sélection', async () => {
    const user = userEvent.setup();
    render(
      <ClassProgramSubjectPicker
        schoolId="school-1"
        classId="c1"
        selectedClass={mockClasses[0]}
        classes={mockClasses}
        catalogSubjects={mockSubjects}
        activeSubjects={[]}
        onBulkSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // Libellés séparés
    const classNameEl = screen.getByText('Maternelle 1');
    const classMetaEl = screen.getAllByText(/francophone/)[0];
    expect(classNameEl).toBeDefined();
    expect(classMetaEl).toBeDefined();
    expect(classMetaEl.textContent).toContain('francophone • maternelle');

    // Checkbox is first element in the label
    const label = classNameEl.closest('label');
    expect(label).toBeDefined();
    const firstChild = label?.firstElementChild;
    expect(firstChild?.tagName.toLowerCase()).toBe('input');

    // Bouton ajouter est désactivé au départ (1 classe, 0 matière)
    const btnSubmit = screen.getByRole('button', { name: /Ajouter/i });
    expect(btnSubmit.hasAttribute('disabled')).toBe(true);
    expect(btnSubmit.getAttribute('aria-disabled')).toBe('true');
    expect(btnSubmit.textContent).toContain('Ajouter 0 matière(s) à 1 classe(s)');

    // Sélection d'une matière
    const dessinLabel = screen.getByText('Dessin').closest('label');
    const dessinCheckbox = within(dessinLabel as HTMLElement).getByRole('checkbox');
    await user.click(dessinCheckbox);

    // Le bouton doit être activé
    expect(btnSubmit.hasAttribute('disabled')).toBe(false);
    expect(btnSubmit.getAttribute('aria-disabled')).toBe('false');
    expect(btnSubmit.textContent).toContain('Ajouter 1 matière(s) à 1 classe(s)');
  });

  it('affiche un état vide explicite si aucune matière', () => {
    render(
      <ClassProgramSubjectPicker
        schoolId="school-1"
        classId="c1"
        selectedClass={mockClasses[0]}
        classes={mockClasses}
        catalogSubjects={[]}
        activeSubjects={[]}
        onBulkSelect={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const emptyText = screen.getByText('Aucune matière compatible avec les classes sélectionnées.');
    expect(emptyText).toBeDefined();
  });
});
