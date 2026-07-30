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
    { id: 's1', name: 'Arts et culture', code: 'FR-PRI-ART', schoolId: 'school-1', section: 'francophone', cycles: ['primary'] },
    { id: 's2', name: 'Chant', schoolId: 'school-1', section: 'all', cycles: ['nursery'] }
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
    expect(tabClasses.className).toContain('activeTab');
    expect(tabSubjects.getAttribute('aria-selected')).toBe('false');
    expect(tabSubjects.className).toContain('inactiveTab');

    // 2. Footer dans l'étape classes contient "Continuer vers les matières" et "Annuler"
    const footer = screen.getByTestId('picker-footer');
    expect(within(footer).getByRole('button', { name: /Continuer vers les matières/i })).not.toBeNull();
    expect(within(footer).getByRole('button', { name: /Annuler/i })).not.toBeNull();
    // ne contient pas le bouton "Ajouter"
    expect(within(footer).queryByRole('button', { name: /Ajouter/i })).toBeNull();

    // 3. Clic sur "2. Matières"
    await user.click(tabSubjects);
    
    // classes-step absent, subjects-step présent
    expect(screen.queryByTestId('classes-step')).toBeNull();
    expect(screen.queryByTestId('subjects-step')).not.toBeNull();
    expect(tabClasses.getAttribute('aria-selected')).toBe('false');
    expect(tabClasses.className).toContain('inactiveTab');
    expect(tabSubjects.getAttribute('aria-selected')).toBe('true');
    expect(tabSubjects.className).toContain('activeTab');

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

    // 6. Footer dans l'étape matières contient "Retour aux classes", "Annuler" et "Ajouter"
    const subjectsFooter = screen.getByTestId('picker-footer');
    expect(within(subjectsFooter).getByRole('button', { name: /Retour aux classes/i })).not.toBeNull();
    expect(within(subjectsFooter).getByRole('button', { name: /Annuler/i })).not.toBeNull();
    expect(within(subjectsFooter).getByRole('button', { name: /Ajouter/i })).not.toBeNull();
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
    const onCloseMock = vi.fn();
    render(
      <ClassProgramSubjectPicker
        schoolId="school-1"
        classId="c1"
        selectedClass={mockClasses[0]}
        classes={mockClasses}
        catalogSubjects={mockSubjects}
        activeSubjects={[]}
        onBulkSelect={vi.fn()}
        onClose={onCloseMock}
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
    expect(firstChild?.className).toContain('checkbox');

    // Vérifier l'ordre du DOM pour la grille
    const dialog = screen.getByTestId('bulk-picker-dialog');
    const header = screen.getByTestId('picker-header');
    const nav = screen.getByTestId('picker-navigation');
    const main = screen.getByTestId('picker-main');
    const footer = screen.getByTestId('picker-footer');

    // Verify they are all direct children of dialog
    expect(header.parentElement).toBe(dialog);
    expect(nav.parentElement).toBe(dialog);
    expect(main.parentElement).toBe(dialog);
    expect(footer.parentElement).toBe(dialog);

    // Verify close button is the last direct child of header
    const closeBtn = within(header).getByRole('button', { name: 'Fermer' });
    expect(closeBtn).not.toBeNull();
    expect(header.lastElementChild).toBe(closeBtn);
    expect(closeBtn.parentElement).toBe(header);

    // Verify DOM order
    expect(dialog.children[0]).toBe(header);
    expect(dialog.children[1]).toBe(nav);
    expect(dialog.children[2]).toBe(main);
    expect(dialog.children[3]).toBe(footer);

    // Nom et métadonnées séparés
    const classMetaEls = screen.getAllByText('francophone • maternelle');
    expect(classMetaEls.length).toBeGreaterThan(0);

    // Afficher toutes les classes pour voir CP et CE1
    const filterClassesCb = screen.getByLabelText('Afficher aussi les classes des autres sections et cycles');
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

    const filterSubjectsCb = screen.getByLabelText('Afficher aussi les matières des autres sections et cycles');
    expect(filterSubjectsCb).not.toBeNull();
    if (!(filterSubjectsCb as HTMLInputElement).checked) {
      await user.click(filterSubjectsCb);
    }

    // Checking translated metadata and separated rendering
    const metaEls = screen.getAllByText(/francophone • primaire/i);
    expect(metaEls.length).toBeGreaterThan(0);
    expect(screen.queryByText(/primary/i)).toBeNull(); // Translated properly

    // Check code separated
    expect(screen.getByText('Code : FR-PRI-ART')).not.toBeNull();

    const btnSubmit = screen.getByRole('button', { name: /Ajouter/i });
    expect(btnSubmit.hasAttribute('disabled')).toBe(true);

    const dessinLabel = screen.getByText('Arts et culture').closest('label');
    const dessinCheckbox = within(dessinLabel as HTMLElement).getByRole('checkbox');
    await user.click(dessinCheckbox);

    expect(btnSubmit.hasAttribute('disabled')).toBe(false);
    expect(btnSubmit.textContent).toContain('Ajouter 1 matière à 1 classe');
    
    // Check Close button triggers onClose
    const closeBtnFooter = within(screen.getByTestId('picker-footer')).getByRole('button', { name: 'Annuler' });
    await user.click(closeBtnFooter);
    expect(onCloseMock).toHaveBeenCalled();
    
    // Check 'Retour aux classes'
    const returnBtn = screen.getByRole('button', { name: 'Retour aux classes' });
    expect(returnBtn).not.toBeNull();
    await user.click(returnBtn);
    expect(screen.queryByTestId('classes-step')).not.toBeNull();
  });
});
