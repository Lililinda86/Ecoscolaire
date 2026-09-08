import { expect, it } from 'vitest';
import { sourceReferences } from '../../src/features/pedagogy/resources/sourceReferences';
it('keeps institutional indexes and third-party copies separate and link-only', () => {
  expect(sourceReferences).toHaveLength(3);
  for (const source of sourceReferences) {
    const url = new URL(source.url);
    expect(url.protocol).toBe('https:');
    expect(url.username + url.password + url.search + url.hash).toBe('');
    expect(source.rights).toMatch(/non établis|Aucune licence/);
  }
  expect(sourceReferences.find(source => source.id === 'ebase-curriculum-copies')?.access).toContain('non authentifiées');
  expect(sourceReferences.find(source => source.id === 'minedub-portal')?.access).toContain('Applicabilité actuelle non établie');
  expect(sourceReferences.find(source => source.id === 'minesec-programmes-index')?.access).toContain('CHECK_FAILED');
});
