/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { earlyYearsActivities, earlyYearsLevels, earlyYearsTemplate, proposeEarlyYearsProgression } from '../../src/features/pedagogy/resources/earlyYearsProgram';
import { EarlyYearsProgramPanel } from '../../src/features/pedagogy/components/EarlyYearsProgramPanel';
vi.mock('../../src/context/AppContext', () => ({ useAppContext: () => ({ currentSchool: { id: 'school' }, db: { classes: [
  { id: 'one', schoolId: 'school', catalogLevelId: 'fr-preschool-pre', name: 'Nom ITALO conservé', isActive: true },
  { id: 'two', schoolId: 'other-school', catalogLevelId: 'en-nursery-1', name: 'Foreign class', isActive: true },
] } }) }));
afterEach(cleanup);
it('defines eight local levels and forty distinct original proposals, no false ministry-level equivalence', () => {
  expect(earlyYearsLevels).toHaveLength(8);
  const all = earlyYearsLevels.flatMap(l => earlyYearsActivities(l.id));
  expect(all).toHaveLength(40); expect(new Set(all.map(a => a.id)).size).toBe(40);
  expect(new Set(all.map(a => a.title)).size).toBe(40);
  for (const a of all) {
    expect(a.programKind).toBe('ITALO_EARLY_YEARS_PROGRAM'); expect(a.verificationStatus).toBe('ITALO_INTERNAL');
    expect(a.humanReviewStatus).toBe('PROPOSED_NOT_ADOPTED'); expect(a.officialLevelEquivalent).toBeNull(); expect(a.durationMinutes).toBeNull();
    expect(a.domainReference.documentId).toBe('minedub-' + a.language + '-nursery');
    expect(a.domainReference.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(earlyYearsTemplate(a)).toHaveLength(19);
    expect(a.objective.length).toBeGreaterThan(20); expect(a.observable.length).toBeGreaterThan(20);
  }
  expect(earlyYearsActivities('fr-primary-sil')).toEqual([]);
});
it('varies goals by local stage and keeps FR/EN domain sources separate', () => {
  const pre = earlyYearsActivities('fr-preschool-pre'), gs = earlyYearsActivities('fr-preschool-gs');
  for (let i = 0; i < 5; i++) { expect(pre[i].objective).not.toBe(gs[i].objective); expect(pre[i].activity).not.toBe(gs[i].activity); }
  expect(pre[0].domain).toBe('Langues et communication');
  expect(earlyYearsActivities('en-nursery-pre')[0].domain).toBe('Literacy and Communication');
  expect(earlyYearsActivities('en-nursery-pre')[0].activity).not.toBe(pre[0].activity);
});
it('uses available school weeks, repeats and consolidates without creating a timetable or taught evidence', () => {
  const weeks = Array.from({ length: 12 }, (_, i) => ({ id: String(i), weekStartDate: '2026-' + String(i + 1).padStart(2, '0') + '-01' }));
  const activity = earlyYearsActivities('fr-preschool-pre')[0];
  const plan = proposeEarlyYearsProgression('fr-preschool-pre', weeks, [activity.id]);
  expect(plan).toHaveLength(12); expect(plan[0].mode).toBe('REPEAT_AND_CONSOLIDATE'); expect(plan[1].mode).toBe('DISCOVER');
  expect(plan.slice(5).every(p => p.mode === 'REPEAT_AND_CONSOLIDATE')).toBe(true);
  expect(plan.every(p => p.status === 'PROPOSED_NOT_TAUGHT' && p.teacherReviewRequired && !p.timetableCreated)).toBe(true);
  expect(proposeEarlyYearsProgression('fr-preschool-pre', [weeks[0], weeks[0]])).toEqual([]);
});
it('shows only configured same-tenant names, no selected consolidation or adoption', () => {
  render(<MemoryRouter><EarlyYearsProgramPanel weeks={[{ id: 'week', weekStartDate: '2026-09-14' }]} /></MemoryRouter>);
  expect(screen.queryByText('Foreign class')).toBeNull(); expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr-preschool-pre' } });
  expect(screen.getByText('Nom ITALO conservé')).toBeTruthy();
  const boxes = screen.getAllByRole('checkbox', { hidden: true }); expect(boxes).toHaveLength(5);
  expect(boxes.every(b => !(b as HTMLInputElement).checked)).toBe(true);
  expect(screen.queryByRole('button', { name: /APPROUVER/ })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Exporter le modèle FR', hidden: true })).toHaveLength(5);
});
