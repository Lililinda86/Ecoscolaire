import { describe, it, expect } from 'vitest';
import { sortClassesPedagogically, getPedagogicalClassRank, cleanClassName } from '../../src/utils/pedagogicalSort';

describe('pedagogicalSort', () => {
  it('assigns correct ranks for francophone', () => {
    expect(getPedagogicalClassRank('CP', 'francophone')).toBe(6);
    expect(getPedagogicalClassRank('Terminale', 'francophone')).toBe(17);
  });

  it('cleans class names correctly', () => {
    expect(cleanClassName('CE1francophone', 'francophone')).toBe('CE1');
    expect(cleanClassName('CE1', 'francophone')).toBe('CE1');
    expect(cleanClassName('Class 1 anglophone', 'anglophone')).toBe('Class 1');
  });

  it('sorts randomly ordered classes into pedagogical order', () => {
    const input = [
      { id: '1', name: 'CM2', section: 'francophone', cycle: 'primaire' },
      { id: '2', name: 'CE1', section: 'francophone', cycle: 'primaire' },
      { id: '3', name: 'CP', section: 'francophone', cycle: 'primaire' },
      { id: '4', name: 'CM1', section: 'francophone', cycle: 'primaire' },
      { id: '5', name: 'CE2', section: 'francophone', cycle: 'primaire' },
    ];

    const sorted = sortClassesPedagogically(input, 'francophone');
    expect(sorted.map(c => c.name)).toEqual(['CP', 'CE1', 'CE2', 'CM1', 'CM2']);
    
    // original array should not be mutated
    expect(input.map(c => c.name)).toEqual(['CM2', 'CE1', 'CP', 'CM1', 'CE2']);
  });

  it('sorts concatenated classes into pedagogical order', () => {
    const input = [
      { id: '1', name: 'CM2francophone', section: 'francophone', cycle: 'primaire' },
      { id: '2', name: 'CE1francophone', section: 'francophone', cycle: 'primaire' },
      { id: '3', name: 'CPfrancophone', section: 'francophone', cycle: 'primaire' },
      { id: '4', name: 'CM1francophone', section: 'francophone', cycle: 'primaire' },
      { id: '5', name: 'CE2francophone', section: 'francophone', cycle: 'primaire' },
    ];

    const sorted = sortClassesPedagogically(input, 'francophone');
    expect(sorted.map(c => c.name)).toEqual([
      'CPfrancophone',
      'CE1francophone',
      'CE2francophone',
      'CM1francophone',
      'CM2francophone'
    ]);
  });

  it('puts current section first', () => {
    const input = [
      { id: '1', name: 'Class 1', section: 'anglophone', cycle: 'primaire' },
      { id: '2', name: 'CP', section: 'francophone', cycle: 'primaire' },
    ];

    const sorted = sortClassesPedagogically(input, 'anglophone');
    expect(sorted[0].name).toBe('Class 1');
  });

  it('puts unknown classes at the end', () => {
    const input = [
      { id: '1', name: 'Inconnue', section: 'francophone', cycle: 'primaire' },
      { id: '2', name: 'CP', section: 'francophone', cycle: 'primaire' },
    ];

    const sorted = sortClassesPedagogically(input, 'francophone');
    expect(sorted[0].name).toBe('CP');
    expect(sorted[1].name).toBe('Inconnue');
  });
});
