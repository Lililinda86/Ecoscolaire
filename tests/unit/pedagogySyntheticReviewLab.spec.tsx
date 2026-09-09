/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SyntheticReviewLab } from '../../src/features/pedagogy/components/SyntheticReviewLab';
import { syntheticReviewCases } from '../../src/features/pedagogy/resources/pedagogicalReviewPack';
afterEach(cleanup);
it('has five independently resettable synthetic journeys, never real teacher decisions', () => {
  expect(syntheticReviewCases).toHaveLength(5);
  render(<SyntheticReviewLab />);
  for (const example of syntheticReviewCases) {
    fireEvent.change(screen.getByLabelText('Parcours synthétique'), { target: { value: example.template.id } });
    expect(screen.getByText('Étape 1 / 9')).toBeTruthy();
    for (let step = 1; step < 9; step++) fireEvent.click(screen.getByRole('button', { name: 'Étape suivante (simulation)' }));
    expect(screen.getByRole('heading', { name: 'Remédiation — simulation' })).toBeTruthy();
    expect(screen.getByText(example.remediation)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser la simulation' }));
    expect(screen.queryByText('Étape 9 / 9')).toBeNull();
  }
});
