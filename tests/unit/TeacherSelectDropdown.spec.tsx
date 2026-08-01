/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TeacherSelectDropdown } from '../../src/components/TeacherSelectDropdown';

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('TeacherSelectDropdown', () => {
  afterEach(cleanup);
  const mockCandidates = [
    { teacherStaffId: 's1', name: 'Koa Elise', accountStatus: 'unlinked', operationalStatus: 'active', isEligible: true },
    { teacherStaffId: 's2', name: 'John Doe', accountStatus: 'linked', operationalStatus: 'inactive', isEligible: true },
    { teacherStaffId: 's3', name: 'Jane Doe', accountStatus: 'linked', operationalStatus: 'active', isEligible: true },
    { teacherStaffId: 's4', name: 'Ineligible', accountStatus: 'linked', operationalStatus: 'active', isEligible: false },
  ];

  it('1. enseignant actif sans compte affiché', () => {
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={() => {}} />);
    const btn = screen.getByRole('combobox');
    fireEvent.click(btn);
    const options = screen.getAllByRole('option');
    // s1 should have name, "Actif" badge, and "Sans compte" badge
    const s1Option = options.find(o => o.textContent?.includes('Koa Elise'));
    expect(s1Option).toBeTruthy();
    expect(s1Option?.textContent).toContain('Koa Elise');
  });

  it('3. badge Actif, 4. badge Sans compte', () => {
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    const s1Option = options.find(o => o.textContent?.includes('Koa Elise'));
    expect(s1Option?.textContent).toContain('Actif');
    expect(s1Option?.textContent).toContain('Sans compte');
  });

  it('5. absence de "(active)", 6. absence du caractère X technique', () => {
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    const s1Option = options.find(o => o.textContent?.includes('Koa Elise'));
    expect(s1Option?.textContent).not.toContain('(active)');
    expect(s1Option?.textContent).not.toContain('X');
  });

  it('7. sélection à la souris', () => {
    const onChangeMock = vi.fn();
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={onChangeMock} />);
    fireEvent.click(screen.getByRole('combobox'));
    const s1Option = screen.getAllByRole('option').find(o => o.textContent?.includes('Koa Elise'));
    fireEvent.click(s1Option!);
    expect(onChangeMock).toHaveBeenCalledWith('s1');
  });

  it('8. navigation ArrowDown/ArrowUp, 9. sélection avec Enter', () => {
    const onChangeMock = vi.fn();
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={onChangeMock} />);
    const btn = screen.getByRole('combobox');
    
    // Open with Enter
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    
    // Navigate down twice (index 0 is placeholder, index 1 is s1, index 2 is s2)
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    fireEvent.keyDown(btn, { key: 'ArrowDown' });
    
    // Select with Enter
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(onChangeMock).toHaveBeenCalledWith('s2');
  });

  it('10. fermeture avec Escape', () => {
    render(<TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={() => {}} />);
    const btn = screen.getByRole('combobox');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('11. fermeture au clic extérieur', () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <TeacherSelectDropdown candidates={mockCandidates as any} value="" onChange={() => {}} />
      </div>
    );
    const btn = screen.getByRole('combobox');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('26. liste vide distincte dune erreur technique', () => {
    const { rerender } = render(<TeacherSelectDropdown candidates={[]} value="" onChange={() => {}} />);
    expect(screen.getByRole('combobox').textContent).toContain('Aucun enseignant actif n’est disponible');
    
    rerender(<TeacherSelectDropdown candidates={[]} value="" onChange={() => {}} errorMsg="Network error" />);
    expect(screen.getByRole('combobox').textContent).toContain('Impossible de charger les enseignants disponibles');
  });
});
