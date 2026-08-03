import React, { useState, useEffect, useId } from 'react';
import type { TeacherAssignmentCandidate } from '../services/teacherAssignmentFunctions';

export const TeacherSelectDropdown: React.FC<{
  candidates: TeacherAssignmentCandidate[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  errorMsg?: string | null;
}> = ({ candidates, value, onChange, disabled, errorMsg }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listboxRef = React.useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const options = React.useMemo(() => {
    return [
      { teacherStaffId: '', name: '-- Choisir un enseignant --', accountStatus: '', operationalStatus: '', isEligible: true },
      ...candidates.filter(c => c.isEligible)
    ] as TeacherAssignmentCandidate[];
  }, [candidates]);

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
    if (disabled) return;
    setIsOpen(true);
    const selectedIdx = options.findIndex(o => o.teacherStaffId === value);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) {
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex].teacherStaffId);
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

  const selectedCandidate = options.find(c => c.teacherStaffId === value);

  // Translate operationalStatus
  const translateStatus = (status?: string) => {
    if (status === 'active') return 'Actif';
    if (status === 'inactive') return 'Inactif';
    if (status === 'suspended') return 'Suspendu';
    if (status === 'departed') return 'Parti';
    return status;
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', fontSize: '0.9rem' }}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
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
          padding: '0.6rem',
          textAlign: 'left',
          backgroundColor: disabled ? '#f1f5f9' : 'white',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
          minHeight: '42px',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', flex: 1 }}>
          {errorMsg ? (
            <span>Impossible de charger les enseignants disponibles.</span>
          ) : candidates.filter(c => c.isEligible).length === 0 ? (
            <span>Aucun enseignant actif n’est disponible.</span>
          ) : selectedCandidate ? (
            <>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedCandidate.name || '-- Choisir un enseignant --'}
              </span>
              {selectedCandidate.teacherStaffId && (
                <>
                  {selectedCandidate.operationalStatus === 'actif' && (
                    <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Actif</span>
                  )}
                  {selectedCandidate.operationalStatus !== 'actif' && selectedCandidate.operationalStatus && (
                    <span style={{ backgroundColor: '#f3f4f6', color: '#4b5563', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                      {translateStatus(selectedCandidate.operationalStatus)}
                    </span>
                  )}
                  {selectedCandidate.accountStatus === 'unlinked' && (
                    <span style={{ backgroundColor: '#ffedd5', color: '#9a3412', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Sans compte</span>
                  )}
                  {selectedCandidate.accountStatus === 'linked' && (
                    <span style={{ backgroundColor: '#e0f2fe', color: '#075985', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Compte lié</span>
                  )}
                </>
              )}
            </>
          ) : (
            <span>-- Choisir un enseignant --</span>
          )}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem' }}>▼</span>
      </button>

      {isOpen && !errorMsg && candidates.filter(c => c.isEligible).length > 0 && (
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
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            maxHeight: '240px',
            overflowY: 'auto',
            zIndex: 9999
          }}
        >
          {options.map((c, idx) => {
            const isSelected = value === c.teacherStaffId;
            const isHighlighted = highlightedIndex === idx;
            return (
              <li
                key={c.teacherStaffId || `empty-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(c.teacherStaffId); setIsOpen(false); buttonRef.current?.focus(); }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                style={{
                  padding: '0.6rem 0.8rem',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(79, 70, 229, 0.1)' : isHighlighted ? '#f8fafc' : 'transparent',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
                  fontWeight: isSelected ? 600 : 400,
                  borderBottom: idx === 0 ? '1px solid #f1f5f9' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || '-- Choisir un enseignant --'}</span>
                {c.teacherStaffId && (
                  <>
                    {c.operationalStatus === 'actif' && (
                      <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Actif</span>
                    )}
                    {c.operationalStatus !== 'actif' && c.operationalStatus && (
                      <span style={{ backgroundColor: '#f3f4f6', color: '#4b5563', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                        {translateStatus(c.operationalStatus)}
                      </span>
                    )}
                    {c.accountStatus === 'unlinked' && (
                      <span style={{ backgroundColor: '#ffedd5', color: '#9a3412', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Sans compte</span>
                    )}
                    {c.accountStatus === 'linked' && (
                      <span style={{ backgroundColor: '#e0f2fe', color: '#075985', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>Compte lié</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
