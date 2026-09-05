/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getClassOptionLabel } from '../../src/utils/classCatalog';

const duplicateClasses = [
  { id: '5c232cf2-bf34-4145-abef-70bb85214667', name: 'Maternelle 1', schoolId: 'school-alpha-001', type: 'francophone' },
  { id: 'e11b786d-d0b3-4c4e-b898-9cc8927e8af8', name: 'Maternelle 1', schoolId: 'school-alpha-001', type: 'francophone' },
  { id: 'franco-maternelle-1', name: 'Maternelle 1', schoolId: 'school-alpha-001', type: 'francophone' },
  { id: 'franco-petite-section', name: 'Petite section', schoolId: 'school-alpha-001', type: 'francophone' }
];

describe('duplicate class option labels', () => {
  afterEach(cleanup);

  it('keeps every class ID selectable with a distinct DOM label', () => {
    render(
      <select aria-label="Classe">
        {duplicateClasses.map(classItem => (
          <option key={classItem.id} value={classItem.id}>
            {getClassOptionLabel(classItem, duplicateClasses)}
          </option>
        ))}
      </select>
    );

    const options = screen.getAllByRole('option') as HTMLOptionElement[];
    expect(options).toHaveLength(duplicateClasses.length);
    expect(options.map(option => option.value)).toEqual(duplicateClasses.map(classItem => classItem.id));
    expect(new Set(options.map(option => option.textContent)).size).toBe(duplicateClasses.length);
    expect(options.every(option => option.textContent?.startsWith('Maternelle Petite Section · '))).toBe(true);
  });
});
