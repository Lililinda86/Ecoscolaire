import React, { useEffect, useRef } from 'react';
import type { Subject } from '../../types';
import { AlertTriangle } from 'lucide-react';

interface SubjectStatusDialogProps {
  isOpen: boolean;
  subject: Subject | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SubjectStatusDialog: React.FC<SubjectStatusDialogProps> = ({
  isOpen,
  subject,
  onCancel,
  onConfirm
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Lock scroll when dialog is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      cancelBtnRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !subject) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
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
        zIndex: 1010,
        padding: '1.5rem'
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          width: '100%',
          maxWidth: '480px',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border-color)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
          </div>
          <h3 id="deactivate-dialog-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
            Désactiver cette matière ?
          </h3>
        </div>
        
        <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569', lineHeight: 1.5 }}>
          La matière <strong style={{ color: '#1e293b' }}>"{subject.name}"</strong> ne sera plus proposée dans les nouvelles affectations, mais les données existantes (notes, bulletins historiques) seront conservées.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            className="secondary"
            onClick={onCancel}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            Désactiver
          </button>
        </div>
      </div>
    </div>
  );
};
