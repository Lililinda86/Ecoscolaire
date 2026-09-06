/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassProgramSubjectPicker } from '../../src/pages/subjects/programs/editor/ClassProgramSubjectPicker';
import type { ClassSection } from '../../src/types';

describe('ClassProgramSubjectPicker class labels', () => {
  afterEach(cleanup);

  const levels = [
    { id: 'ps', number: 1, section: 'Petite' },
    { id: 'ms', number: 2, section: 'Moyenne' },
    { id: 'gs', number: 3, section: 'Grande' },
  ];

  const renderClasses = (classes: ClassSection[], currentClass = classes[0]) => render(
    <ClassProgramSubjectPicker
      schoolId="school-1"
      classId={currentClass.id}
      selectedClass={currentClass}
      classes={classes}
      catalogSubjects={[]}
      activeSubjects={[]}
      onBulkSelect={vi.fn()}
      onClose={vi.fn()}
    />
  );

  const classInputs = () => within(screen.getByTestId('classes-scroll-container'))
    .getAllByRole<HTMLInputElement>('checkbox');
  const classLabels = () => classInputs()
    .map(input => input.nextElementSibling?.firstElementChild?.textContent || '');

  for (const level of levels) {
    const displayName = `Maternelle ${level.section} Section`;

    it.each([
      { variant: 'plain aliases', firstSuffix: '', secondSuffix: '' },
      { variant: 'section-suffixed aliases', firstSuffix: 'francophone', secondSuffix: 'francophone' },
      { variant: 'mixed plain and section-suffixed aliases', firstSuffix: '', secondSuffix: 'francophone' },
    ])(`disambiguates ${level.id} $variant without changing the source classes`, ({ firstSuffix, secondSuffix }) => {
      const classes: ClassSection[] = [
        { id: `class-${level.id}-a`, name: `Maternelle ${level.number}${firstSuffix}`, type: 'francophone' },
        { id: `class-${level.id}-b`, name: `${level.section} Section${secondSuffix}`, type: 'francophone' },
      ];
      // Legacy suffixed names carry their cycle explicitly.
      if (firstSuffix || secondSuffix) classes.forEach(item => { item.cycle = 'preschool'; });
      const original = JSON.stringify(classes);
      renderClasses(classes);

      expect(classInputs()).toHaveLength(2);
      const labels = classLabels();
      expect(labels[0]).not.toBe(labels[1]);
      expect(labels.every(label => label.startsWith(displayName + ' · '))).toBe(true);
      // The existing pedagogical sort puts Grande Section before Maternelle 3.
      expect(classInputs().map(input => input.value).sort()).toEqual(classes.map(item => item.id).sort());
      classInputs().forEach((input, index) => {
        expect(labels[index]).toBe(displayName + ' · ' + input.value.slice(-6));
      });
      expect(JSON.stringify(classes)).toBe(original);
    });

    it.each(['', 'francophone'])(`does not suffix a single ${level.id} class (%s)`, suffix => {
      const item: ClassSection = {
        id: `class-${level.id}-only`, name: `Maternelle ${level.number}${suffix}`,
        type: 'francophone', cycle: 'preschool',
      };
      renderClasses([item]);
      expect(classInputs()).toHaveLength(1);
      expect(classLabels()).toEqual([displayName]);
      expect(classInputs()[0].value).toBe(item.id);
    });
  }

  it('keeps disambiguation stable when searching and reordering the class source', async () => {
    const user = userEvent.setup();
    const classes: ClassSection[] = [
      { id: 'class-ps-a', name: 'Maternelle 1francophone', type: 'francophone', cycle: 'preschool' },
      { id: 'class-ps-b', name: 'Petite Sectionfrancophone', type: 'francophone', cycle: 'preschool' },
    ];
    const props = {
      schoolId: 'school-1', classId: classes[0].id, selectedClass: classes[0],
      catalogSubjects: [], activeSubjects: [], onBulkSelect: vi.fn(), onClose: vi.fn(),
    };
    const view = render(<ClassProgramSubjectPicker {...props} classes={classes} />);
    const initialInputs = classInputs();
    const initialLabels = classLabels();
    view.rerender(<ClassProgramSubjectPicker {...props} classes={[...classes].reverse()} />);
    expect(classLabels()).toEqual(initialLabels);
    classInputs().forEach((input, index) => expect(input).toBe(initialInputs[index]));
    await user.type(screen.getByPlaceholderText('Rechercher une classe...'), 'Petite');
    expect(classInputs().map(input => input.value)).toEqual(['class-ps-b']);
    expect(classLabels()).toEqual([initialLabels[1]]);
  });

  it.each([0, 1])('submits the original ID for duplicate class %i', async currentIndex => {
    const user = userEvent.setup();
    const classes: ClassSection[] = [
      { id: 'class-ps-a', name: 'Maternelle 1francophone', type: 'francophone', cycle: 'preschool' },
      { id: 'class-ps-b', name: 'Petite Sectionfrancophone', type: 'francophone', cycle: 'preschool' },
    ];
    const onBulkSelect = vi.fn();
    render(
      <ClassProgramSubjectPicker
        schoolId="school-1"
        classId={classes[currentIndex].id}
        selectedClass={classes[currentIndex]}
        classes={classes}
        catalogSubjects={[{ id: 'subject-a', name: 'Lecture', schoolId: 'school-1', section: 'francophone', cycles: ['nursery'] }]}
        activeSubjects={[]}
        onBulkSelect={onBulkSelect}
        onClose={vi.fn()}
      />
    );
    expect(classInputs().map(input => input.value)).toEqual(['class-ps-a', 'class-ps-b']);
    expect(classInputs().filter(input => input.checked).map(input => input.value)).toEqual([classes[currentIndex].id]);
    await user.click(screen.getByRole('button', { name: 'Continuer vers les matières' }));
    await user.click(within(screen.getByTestId('subjects-scroll-container')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Ajouter 1 matière à 1 classe' }));
    expect(onBulkSelect).toHaveBeenCalledExactlyOnceWith([classes[currentIndex].id], ['subject-a']);
  });

  it.each([
    ...['Pré-maternelle', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2']
      .map(name => ({ name, type: 'francophone' as const })),
    ...['Pre-Nursery', 'Nursery 1', 'Nursery 2', 'Nursery 3',
      'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
      'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Lower Sixth', 'Upper Sixth']
      .map(name => ({ name, type: 'anglophone' as const })),
  ])('preserves the non-maternelle label $name', ({ name, type }) => {
    renderClasses([{ id: 'unchanged-class', name, type }]);
    expect(classLabels()).toEqual([name]);
  });

  it.each([
    { name: 'CE1francophone', type: 'francophone' as const, expected: 'CE1' },
    { name: 'Class 1anglophone', type: 'anglophone' as const, expected: 'Class 1' },
  ])('preserves existing section cleanup for $name', ({ name, type, expected }) => {
    renderClasses([{ id: 'cleaned-class', name, type }]);
    expect(classLabels()).toEqual([expected]);
  });
});

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
    const ce1Label = screen.getByText('Maternelle Moyenne Section').closest('label');
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
    const classNameEl = screen.getByText('Maternelle Petite Section');
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
