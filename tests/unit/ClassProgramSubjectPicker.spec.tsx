import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
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

  it('affiche le pied de modale et désactive le bouton si 0 matière', () => {
    const html = renderToString(
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

    // c1 est présélectionné, mais 0 matière par défaut (attention aux commentaires HTML de React)
    expect(html).toMatch(/1(<!-- -->)? classe\(s\) sélectionnée\(s\)/);
    expect(html).toMatch(/0(<!-- -->)? matière\(s\) sélectionnée\(s\)/);

    // Bouton de validation contient disabled=""
    expect(html).toContain('Ajouter 0 matière(s) à 1 classe(s)');
    expect(html).toContain('aria-disabled="true"');

    // Pied de modale
    expect(html).toContain('Annuler');
  });

  it('vérifie le libellé espacé et la structure de défilement', () => {
    const html = renderToString(
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

    // Libellé correctement espacé
    expect(html).toContain('Maternelle 1');
    expect(html).toMatch(/francophone(<!-- -->)? • (<!-- -->)?maternelle/);

    // Contenu central avec grille
    expect(html).toContain('grid grid-cols-1 md:grid-cols-2');
  });
});
