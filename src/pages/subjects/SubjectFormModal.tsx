import React, { useEffect, useRef } from 'react';
import type { Subject } from '../../types';
import { X } from 'lucide-react';

interface SubjectFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSubject: Partial<Subject> | null;
  formData: Partial<Subject>;
  setFormData: (data: Partial<Subject>) => void;
  onSubmit: (e: React.FormEvent) => void;
  errors: { name?: string; cycles?: string; code?: string };
  isSubmitting: boolean;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}

export const SubjectFormModal: React.FC<SubjectFormModalProps> = ({
  isOpen,
  onClose,
  editingSubject,
  formData,
  setFormData,
  onSubmit,
  errors,
  isSubmitting,
  nameInputRef
}) => {
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Lock scroll of document.body during opening
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      nameInputRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, nameInputRef]);

  // Trap focus minimal implementation
  useEffect(() => {
    if (!isOpen) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const modal = modalContainerRef.current;
        if (!modal) return;

        const focusables = modal.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleFocusTrap);
    return () => window.removeEventListener('keydown', handleFocusTrap);
  }, [isOpen]);

  if (!isOpen) return null;

  const cycleOptions = [
    { value: 'nursery', label: 'Maternelle', sublabel: 'Nursery' },
    { value: 'primary', label: 'Primaire', sublabel: 'Primary' },
    { value: 'secondary', label: 'Secondaire', sublabel: 'Secondary' }
  ] as const;

  const sectionOptions = [
    { value: 'all', label: 'Commune aux deux sections' },
    { value: 'francophone', label: 'Section Francophone' },
    { value: 'anglophone', label: 'Section Anglophone' }
  ];

  const colorSwatches = [
    '#4f46e5', // Indigo
    '#10b981', // Emerald
    '#0ea5e9', // Sky Blue
    '#f43f5e', // Rose
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#6366f1', // Violet
    '#64748b'  // Slate
  ];

  const handleCycleCheckboxChange = (cycle: 'nursery' | 'primary' | 'secondary', checked: boolean) => {
    const currentCycles = formData.cycles || [];
    if (checked) {
      setFormData({ ...formData, cycles: [...currentCycles, cycle] });
    } else {
      setFormData({ ...formData, cycles: currentCycles.filter((c) => c !== cycle) });
    }
  };

  const inputStyle: React.CSSProperties = {
    borderRadius: '8px', 
    border: '2px solid var(--border-color)', 
    padding: '0.55rem 0.75rem',
    fontSize: '0.925rem',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    transition: 'border-color 0.15s ease-in-out'
  };

  const inputErrorStyle: React.CSSProperties = {
    ...inputStyle,
    border: '2px solid #ef4444'
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.85rem', 
    fontWeight: 700, 
    color: '#334155',
    marginBottom: '0.15rem'
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
    >
      <div
        ref={modalContainerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'white',
          width: '100%',
          maxWidth: '740px',
          maxHeight: '88vh',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-color)'
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff' }}>
          <div>
            <h2 id="modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
              {editingSubject ? 'Modifier la matière' : 'Ajouter une matière'}
            </h2>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Définissez les informations générales et les cycles concernés.
            </p>
          </div>
          <button 
            onClick={onClose} 
            aria-label="Fermer la boîte de dialogue"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer', 
              padding: '0.25rem', 
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f8fafc' }}>
          
          {/* SECTION 1 - GENERAL INFO */}
          <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ margin: '0 0 0.15rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Informations générales
            </h3>
            
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label htmlFor="name-input" style={labelStyle}>Nom de la matière *</label>
              <input
                ref={nameInputRef}
                id="name-input"
                type="text"
                required
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Mathématiques, Français..."
                style={errors.name ? inputErrorStyle : inputStyle}
              />
              {errors.name && <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 500 }}>{errors.name}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label htmlFor="code-input" style={labelStyle}>Code de la matière</label>
                <input
                  id="code-input"
                  type="text"
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="MATH, FR, ANG"
                  style={errors.code ? inputErrorStyle : inputStyle}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.725rem', fontWeight: 500 }}>Facultatif</span>
                {errors.code && <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 500 }}>{errors.code}</span>}
              </div>
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label htmlFor="shortname-input" style={labelStyle}>Abréviation</label>
                <input
                  id="shortname-input"
                  type="text"
                  value={formData.shortName || ''}
                  onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                  placeholder="Maths, Fr., Ang."
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label htmlFor="category-input" style={labelStyle}>Catégorie</label>
                <input
                  id="category-input"
                  type="text"
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Sciences, Littérature, Langues..."
                  style={inputStyle}
                />
              </div>
              
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label htmlFor="lang-input" style={labelStyle}>Langue d’enseignement</label>
                <input
                  id="lang-input"
                  type="text"
                  value={formData.teachingLanguage || ''}
                  onChange={(e) => setFormData({ ...formData, teachingLanguage: e.target.value })}
                  placeholder="Ex: Français, Anglais..."
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2 - SCHOOL ORGANISATION */}
          <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ margin: '0 0 0.15rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Organisation scolaire
            </h3>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <label htmlFor="section-select" style={labelStyle}>Section</label>
              <select 
                id="section-select"
                value={formData.section || 'all'} 
                onChange={(e) => setFormData({ ...formData, section: e.target.value as 'francophone' | 'anglophone' | 'all' })}
                style={{ ...inputStyle, padding: '0.45rem 0.75rem' }}
              >
                {sectionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 'francophone' ? 'Section francophone' : opt.value === 'anglophone' ? 'Section anglophone' : 'Commune aux deux sections'}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={labelStyle}>Cycles concernés *</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                {cycleOptions.map((cyc) => {
                  const isChecked = (formData.cycles || []).includes(cyc.value);
                  return (
                    <div 
                      key={cyc.value}
                      onClick={() => handleCycleCheckboxChange(cyc.value, !isChecked)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.5rem 0.75rem',
                        border: '2px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        backgroundColor: isChecked ? 'rgba(79, 70, 229, 0.04)' : '#ffffff',
                        borderColor: isChecked ? 'var(--primary-color)' : 'var(--border-color)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // Event handled by parent block
                        style={{ width: '15px', height: '15px', pointerEvents: 'none', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>{cyc.label}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{cyc.sublabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {errors.cycles && <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 500, marginTop: '0.15rem' }}>{errors.cycles}</span>}
            </div>
          </div>

          {/* SECTION 3 - APPEARANCE */}
          <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ margin: '0 0 0.15rem 0', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Apparence
            </h3>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label htmlFor="color-text-input" style={labelStyle}>Couleur d’affichage</label>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {colorSwatches.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        border: formData.color === color ? '3px solid var(--primary-color)' : '1px solid rgba(0,0,0,0.1)',
                        outline: formData.color === color ? '1px solid white' : 'none',
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                      title={color}
                      aria-label={`Choisir la couleur ${color}`}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={formData.color || '#4f46e5'}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    style={{ width: '32px', height: '32px', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                    aria-label="Palette personnalisée"
                  />
                  <input
                    id="color-text-input"
                    type="text"
                    value={formData.color || '#4f46e5'}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#4f46e5"
                    style={{ ...inputStyle, width: '90px', padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: '#ffffff' }}>
          <button 
            type="button" 
            className="secondary" 
            onClick={onClose}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Annuler
          </button>
          <button 
            type="button"
            disabled={isSubmitting}
            onClick={onSubmit}
            style={{ 
              padding: '0.6rem 1.25rem', 
              borderRadius: '8px', 
              fontWeight: 600, 
              backgroundColor: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              fontSize: '0.9rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              minWidth: '150px',
              justifyContent: 'center'
            }}
          >
            {isSubmitting ? (editingSubject ? 'Enregistrement...' : 'Ajout en cours...') : (editingSubject ? 'Enregistrer les modifications' : 'Ajouter la matière')}
          </button>
        </div>
      </div>
    </div>
  );
};
