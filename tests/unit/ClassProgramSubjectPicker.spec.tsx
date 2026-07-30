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
    { id: 'c2', name: 'Maternelle 2', schoolId: 'school-1', section: 'francophone', cycle: 'maternelle' },
    { id: 'c3', name: 'CE1francophone', schoolId: 'school-1', section: 'francophone', cycle: 'primaire' },
    { id: 'c4', name: 'CPfrancophone', schoolId: 'school-1', section: 'francophone', cycle: 'primaire' }
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

  it('affiche un seul panneau et permet la navigation', async () => {
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

    // 1. Rendu initial : classes-step présent, subjects-step absent
    expect(screen.queryByTestId('classes-step')).not.toBeNull();
    expect(screen.queryByTestId('subjects-step')).toBeNull();

    const tabClasses = screen.getByRole('tab', { name: /1\. Classes/i });
    const tabSubjects = screen.getByRole('tab', { name: /2\. Matières/i });

    expect(tabClasses.getAttribute('aria-selected')).toBe('true');
    expect(tabSubjects.getAttribute('aria-selected')).toBe('false');

    // 2. Clic sur "2. Matières"
    await user.click(tabSubjects);
    
    // classes-step absent, subjects-step présent
    expect(screen.queryByTestId('classes-step')).toBeNull();
    expect(screen.queryByTestId('subjects-step')).not.toBeNull();
    expect(tabClasses.getAttribute('aria-selected')).toBe('false');
    expect(tabSubjects.getAttribute('aria-selected')).toBe('true');

    // 3. Clic sur "1. Classes"
    await user.click(tabClasses);
    expect(screen.queryByTestId('classes-step')).not.toBeNull();
    expect(screen.queryByTestId('subjects-step')).toBeNull();

    // 4. Sélection d'une classe (ne revient pas automatiquement aux classes si on y est déjà, mais on vérifie qu'on reste)
    const ce1Label = screen.getByText('Maternelle 2').closest('label'); // cleanName
    const ce1Checkbox = within(ce1Label as HTMLElement).getByRole('checkbox');
    await user.click(ce1Checkbox);
    expect(screen.queryByTestId('classes-step')).not.toBeNull(); // On y est toujours

    // 5. Clic sur "Continuer vers les matières"
    const btnContinue = screen.getByRole('button', { name: /Continuer vers les matières/i });
    await user.click(btnContinue);
    expect(screen.queryByTestId('subjects-step')).not.toBeNull();
    expect(screen.queryByTestId('classes-step')).toBeNull();
  });

  it('affiche un état vide explicite et garde le footer fixe', async () => {
    const user = userEvent.setup();
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

    // Naviguer vers matières
    const tabSubjects = screen.getByRole('tab', { name: /2\. Matières/i });
    await user.click(tabSubjects);

    // 6. État vide
    expect(screen.queryByTestId('subjects-step')).not.toBeNull();
    const emptyText = screen.getByText('Aucune matière compatible avec les classes sélectionnées.');
    expect(emptyText).not.toBeNull();

    // 10. Footer
    const footer = screen.getByTestId('picker-footer');
    expect(footer).not.toBeNull();
  });

  it('alignement, structure et matières sélectionnables', async () => {
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

    // 8. Alignement (classes)
    const classNameEl = screen.getByText('Maternelle 1');
    const label = classNameEl.closest('label');
    expect(label).not.toBeNull();
    
    // Checkbox premier enfant du label
    const firstChild = label?.firstElementChild;
    expect(firstChild?.tagName.toLowerCase()).toBe('input');
    expect(firstChild?.getAttribute('type')).toBe('checkbox');
    // Vérifier largeur 16px via style
    expect((firstChild as HTMLElement).style.width).toBe('16px');

    // Nom et métadonnées séparés
    const classMetaEls = screen.getAllByText('francophone • maternelle');
    expect(classMetaEls.length).toBeGreaterThan(0);

    // Afficher toutes les classes pour voir CP et CE1
    const filterClassesCb = screen.getByLabelText('Afficher autres sections/cycles');
    if (!(filterClassesCb as HTMLInputElement).checked) {
      await user.click(filterClassesCb);
    }

    // 9. Tri réel dans le composant (on devrait avoir CP avant CE1 malgré l'ordre initial du mockc3/c4)
    const labels = screen.getAllByRole('checkbox').map(cb => cb.closest('label'));
    const textContents = labels.map(l => l?.textContent || '');
    console.log("textContents after filter:", textContents);
    const cpIndex = textContents.findIndex(t => t.includes('CP'));
    const ce1Index = textContents.findIndex(t => t.includes('CE1'));
    expect(cpIndex).toBeGreaterThan(-1);
    expect(ce1Index).toBeGreaterThan(-1);
    expect(cpIndex).toBeLessThan(ce1Index);

    // 7. Matière présente
    const tabSubjects = screen.getByRole('tab', { name: /2\. Matières/i });
    await user.click(tabSubjects);

    const btnSubmit = screen.getByRole('button', { name: /Ajouter/i });
    expect(btnSubmit.hasAttribute('disabled')).toBe(true);

    const dessinLabel = screen.getByText('Dessin').closest('label');
    const dessinCheckbox = within(dessinLabel as HTMLElement).getByRole('checkbox');
    await user.click(dessinCheckbox);

    expect(btnSubmit.hasAttribute('disabled')).toBe(false);
    expect(btnSubmit.textContent).toContain('Ajouter 1 matière(s) à 1 classe(s)');
  });
});
