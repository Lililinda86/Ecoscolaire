/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SubjectSelectDropdown } from '../../src/components/SubjectSelectDropdown';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('SubjectSelectDropdown', () => {
  const mockSubjects = [
    { classSubjectId: 'sub1', name: 'Mathématiques', coefficient: 4 },
    { classSubjectId: 'sub2', name: 'Français', coefficient: 3 },
    { classSubjectId: 'sub3', name: 'Histoire', coefficient: 2 },
    { classSubjectId: 'sub4', name: 'Géographie', coefficient: 2 },
    { classSubjectId: 'sub5', name: 'Physique', coefficient: 4 },
    { classSubjectId: 'sub6', name: 'Chimie', coefficient: 3 },
    { classSubjectId: 'sub7', name: 'SVT', coefficient: 3 },
    { classSubjectId: 'sub8', name: 'Anglais', coefficient: 3 },
    { classSubjectId: 'sub9', name: 'Espagnol', coefficient: 2 }, // 9 subjects
  ];

  it('renders correctly and opens on click', () => {
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={mockSubjects} value="" onChange={onChange} />);

    const button = screen.getByRole('button');
    expect(button.textContent).toContain('-- Choisir --');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // Click to open
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    const listbox = screen.getByRole('listbox');
    expect(listbox).not.toBeNull();

    // Check max-height and overflow-y
    expect(listbox.style.maxHeight).toBe('220px');
    expect(listbox.style.overflowY).toBe('auto');

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(10); // 9 subjects + "-- Choisir --"
  });

  it('allows selection with mouse', () => {
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={mockSubjects} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button'));
    const options = screen.getAllByRole('option');

    // Select Mathématiques (index 1)
    fireEvent.click(options[1]);
    expect(onChange).toHaveBeenCalledWith('sub1');
  });

  it('supports keyboard navigation (ArrowDown, ArrowUp, Enter)', () => {
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={mockSubjects} value="" onChange={onChange} />);

    const button = screen.getByRole('button');

    // Open with ArrowDown
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).not.toBeNull();

    // Move to first subject
    fireEvent.keyDown(button, { key: 'ArrowDown' });

    // Select with Enter
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('sub1');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape', () => {
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={mockSubjects} value="" onChange={onChange} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByRole('listbox')).not.toBeNull();

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows no options except default when no subjects exist', () => {
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={[]} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button'));
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toBe('-- Choisir --');
  });

  it('handles long labels without breaking width', () => {
    const longSubjects = [
      { classSubjectId: 'sub1', name: 'A very very very long subject name that might overflow the container', coefficient: 1 }
    ];
    const onChange = vi.fn();
    render(<SubjectSelectDropdown subjects={longSubjects} value="sub1" onChange={onChange} />);

    const button = screen.getByRole('button');
    const span = button.querySelector('span:first-child') as HTMLElement;
    expect(span.style.whiteSpace).toBe('nowrap');
    expect(span.style.overflow).toBe('hidden');
  });

  it('updates display when value changes (e.g. class change)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SubjectSelectDropdown subjects={mockSubjects} value="sub1" onChange={onChange} />);

    expect(screen.getByRole('button').textContent).toContain('Mathématiques');

    // Simulate reset due to class change
    rerender(<SubjectSelectDropdown subjects={mockSubjects} value="" onChange={onChange} />);
    expect(screen.getByRole('button').textContent).toContain('-- Choisir --');
  });
});
