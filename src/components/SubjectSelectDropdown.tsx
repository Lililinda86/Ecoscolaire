import React, { useState, useEffect, useId } from 'react';

export const SubjectSelectDropdown: React.FC<{
  subjects: { classSubjectId: string; name: string; coefficient?: number }[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ subjects, value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listboxRef = React.useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const options = React.useMemo(() => [
    { classSubjectId: '', name: '-- Choisir --', coefficient: 0 },
    ...subjects
  ], [subjects]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openDropdown = () => {
    setIsOpen(true);
    const selectedIdx = options.findIndex(o => o.classSubjectId === value);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex].classSubjectId);
        }
        setIsOpen(false);
        buttonRef.current?.focus();
      } else {
        openDropdown();
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
        e.stopPropagation();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
      } else {
        setHighlightedIndex(prev => (prev < options.length - 1 ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
      } else {
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
      }
    }
  };

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const items = listboxRef.current.querySelectorAll('li');
      const activeItem = items[highlightedIndex];
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectedSubject = subjects.find(s => s.classSubjectId === value);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', fontSize: '0.9rem' }}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (isOpen) setIsOpen(false);
          else openDropdown();
        }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        style={{
          width: '100%',
          padding: '0.55rem',
          textAlign: 'left',
          backgroundColor: disabled ? '#f1f5f9' : 'white',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
          minHeight: '38px',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedSubject ? `${selectedSubject.name} (Coeff ${selectedSubject.coefficient || 0})` : '-- Choisir --'}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>▼</span>
      </button>

      {isOpen && (
        <ul
          id={listboxId}
          ref={listboxRef}
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            margin: 0,
            marginTop: '4px',
            padding: 0,
            listStyle: 'none',
            backgroundColor: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 9999
          }}
        >
          {options.map((s, idx) => {
            const isSelected = value === s.classSubjectId;
            const isHighlighted = highlightedIndex === idx;
            return (
              <li
                key={s.classSubjectId || 'empty'}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(s.classSubjectId); setIsOpen(false); buttonRef.current?.focus(); }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                style={{
                  padding: '0.6rem 0.8rem',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : isHighlighted ? '#f8fafc' : 'transparent',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
                  fontWeight: isSelected ? 600 : 400,
                  borderBottom: idx === 0 ? '1px solid #f1f5f9' : 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {s.classSubjectId === '' ? s.name : `${s.name} (Coeff ${s.coefficient || 0})`}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
