import React, { useState, useRef, useEffect, useId } from 'react';
import { getDisplayClassName, getSpecialtyName, resolveEducationType } from '../../utils/classCatalog';
import type { ClassSection, TechnicalSpecialty } from '../../types';
import { sortClasses } from '../../utils/sortClasses';
import {
  normalizeClassSection,
  normalizeClassCycle,
  getClassGroupDescriptor,
  compareGroupDescriptors,
  type ClassGroupDescriptor
} from '../../utils/classClassification';

export interface ClassSearchPickerProps {
  classes: ClassSection[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  technicalSpecialties: TechnicalSpecialty[];
  currentSchoolId?: string;
  students: Array<{ id: string; classId?: string; schoolId?: string }>;
}

const formatStudentCount = (count: number): string => {
  if (count === 0) return '0 élève';
  if (count === 1) return '1 élève';
  return `${count} élèves`;
};

const normalizeSearchTerm = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
};

export const ClassSearchPicker: React.FC<ClassSearchPickerProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  technicalSpecialties,
  currentSchoolId,
  students
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const listboxId = useId();

  const getOptionDomId = (index: number) => `${listboxId}-option-${index}`;

  const currentClass = classes.find(c => c.id === selectedClassId);

  const closePicker = (restoreFocus = true) => {
    setIsOpen(false);
    setSearch('');
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const handleToggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      setActiveIndex(0);
    } else {
      closePicker(true);
    }
  };

  // Fermeture clic extérieur uniquement si le panneau est ouvert
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointer = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current && !containerRef.current.contains(target)) {
        closePicker(false);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    return () => document.removeEventListener('mousedown', handleOutsidePointer);
  }, [isOpen]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Indexation des étudiants par classId
  const studentCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach(s => {
      if (s.classId && String(s.schoolId || '') === (currentSchoolId || '')) {
        map[s.classId] = (map[s.classId] || 0) + 1;
      }
    });
    return map;
  }, [students, currentSchoolId]);

  // Filtrage et recherche
  const searchNorm = normalizeSearchTerm(search);

  const filteredOptions = React.useMemo(() => {
    return classes.filter(c => {
      if (!searchNorm) return true;

      const canonicalName = normalizeSearchTerm(c.name);
      const displayName = normalizeSearchTerm(getDisplayClassName(c.name));
      const section = normalizeSearchTerm(normalizeClassSection(c));
      const cycleNorm = normalizeSearchTerm(normalizeClassCycle(c));

      const eduRes = resolveEducationType(c.educationType, c.specialtyId);
      const eduNorm = normalizeSearchTerm(eduRes.value === 'technical' ? 'technique technical' : 'general general');

      let specNorm = '';
      if (c.specialtyId) {
        const specRes = getSpecialtyName(
          c.specialtyId,
          technicalSpecialties as Array<{ id: string; schoolId?: string; name: string; isActive?: boolean }>,
          currentSchoolId,
          c.type || c.section
        );
        if (specRes.name) specNorm = normalizeSearchTerm(specRes.name);
      }

      const statusNorm = c.isActive === false ? 'inactive inactives' : 'active actives';

      return (
        canonicalName.includes(searchNorm) ||
        displayName.includes(searchNorm) ||
        section.includes(searchNorm) ||
        cycleNorm.includes(searchNorm) ||
        eduNorm.includes(searchNorm) ||
        specNorm.includes(searchNorm) ||
        statusNorm.includes(searchNorm)
      );
    });
  }, [classes, searchNorm, technicalSpecialties, currentSchoolId]);

  // Regroupement
  const grouped = React.useMemo(() => {
    const groups: Record<string, ClassSection[]> = {};
    const groupDescriptorsMap: Record<string, ClassGroupDescriptor> = {};

    filteredOptions.forEach(c => {
      const desc = getClassGroupDescriptor(c, technicalSpecialties, currentSchoolId);
      if (!groups[desc.label]) {
        groups[desc.label] = [];
        groupDescriptorsMap[desc.label] = desc;
      }
      groups[desc.label].push(c);
    });

    const sortedGroupLabels = Object.keys(groups).sort((a, b) => {
      const descA = groupDescriptorsMap[a];
      const descB = groupDescriptorsMap[b];
      return compareGroupDescriptors(descA, descB);
    });

    const orderedGrouped: Record<string, ClassSection[]> = {};
    sortedGroupLabels.forEach(label => {
      orderedGrouped[label] = sortClasses(groups[label]);
    });

    return orderedGrouped;
  }, [filteredOptions, technicalSpecialties, currentSchoolId]);

  // Liste à plat pour navigation clavier
  const flatOptions = React.useMemo(() => {
    return Object.values(grouped).flat();
  }, [grouped]);

  const safeActiveIndex = flatOptions.length === 0 ? -1 : (activeIndex >= 0 && activeIndex < flatOptions.length ? activeIndex : 0);

  const activeOptionId = safeActiveIndex >= 0 && safeActiveIndex < flatOptions.length ? getOptionDomId(safeActiveIndex) : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatOptions.length > 0) {
        setActiveIndex(prev => (prev < flatOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatOptions.length > 0) {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : flatOptions.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (safeActiveIndex >= 0 && safeActiveIndex < flatOptions.length) {
        const item = flatOptions[safeActiveIndex];
        onSelectClass(item.id);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
  };

  const getTriggerText = () => {
    if (!currentClass) return `-- Choisir une classe (${classes.length} disponible(s)) --`;
    const count = studentCountMap[currentClass.id] || 0;
    const displayName = getDisplayClassName(currentClass.name);
    const specRes = currentClass.specialtyId ? getSpecialtyName(currentClass.specialtyId, technicalSpecialties, currentSchoolId, currentClass.type || currentClass.section) : { name: null };
    const specText = specRes.name ? ` — ${specRes.name}` : '';
    const statusText = currentClass.isActive === false ? ' — Inactive' : '';
    return `${displayName}${specText}${statusText} — ${formatStudentCount(count)}`;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={handleToggleOpen}
        style={{
          width: '100%',
          padding: '0.6rem 0.85rem',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--card-bg, #ffffff)',
          color: 'var(--text-color, #1e293b)',
          textAlign: 'left',
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <span style={{ fontWeight: currentClass ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getTriggerText()}
        </span>
        <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 500,
            marginTop: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Rechercher une classe"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              placeholder="Rechercher une classe, filière, cycle, statut..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.65rem',
                borderRadius: '5px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>

          <div id={listboxId} role="listbox" aria-label="Classes disponibles" style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {Object.keys(grouped).length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                Aucune classe trouvée pour cette recherche.
              </div>
            ) : (
              Object.entries(grouped).map(([groupTitle, groupClasses]) => (
                <div key={groupTitle} style={{ marginBottom: '0.4rem' }}>
                  <div
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#475569',
                      backgroundColor: '#f1f5f9',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {groupTitle}
                  </div>
                  {groupClasses.map(c => {
                    const globalIdx = flatOptions.findIndex(item => item.id === c.id);
                    const isSelected = c.id === selectedClassId;
                    const isActiveHighlighted = globalIdx === safeActiveIndex;
                    const count = studentCountMap[c.id] || 0;

                    const displayName = getDisplayClassName(c.name);
                    const specRes = c.specialtyId ? getSpecialtyName(c.specialtyId, technicalSpecialties, currentSchoolId, c.type || c.section) : { name: null };
                    const specText = specRes.name ? ` — ${specRes.name}` : '';
                    const isInactive = c.isActive === false;
                    const optionId = getOptionDomId(globalIdx);

                    return (
                      <div
                        key={c.id}
                        id={optionId}
                        role="option"
                        aria-selected={isSelected}
                        ref={el => {
                          if (isActiveHighlighted && el) {
                            el.scrollIntoView({ block: 'nearest' });
                          }
                        }}
                        onClick={() => {
                          onSelectClass(c.id);
                          setIsOpen(false);
                          triggerRef.current?.focus();
                        }}
                        onMouseEnter={() => setActiveIndex(globalIdx)}
                        style={{
                          padding: '0.45rem 0.85rem',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          backgroundColor: isSelected
                            ? '#e0e7ff'
                            : isActiveHighlighted
                            ? '#f1f5f9'
                            : 'transparent',
                          color: isSelected ? '#3730a3' : '#1e293b',
                          fontWeight: isSelected ? 600 : 400,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>
                          {displayName}{specText}
                          {isInactive && (
                            <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                              — Inactive
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: isSelected ? '#4338ca' : '#64748b' }}>
                          {formatStudentCount(count)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
