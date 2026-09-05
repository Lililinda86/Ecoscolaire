import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  size?: 'default' | 'wide';
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  size = 'default'
}) => {
  const titleId = React.useId();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="modal-backdrop"
      onClick={(e) => {
        if (!closeOnBackdrop) return;
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 'clamp(0.5rem, 2vw, 1rem)', boxSizing: 'border-box'
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="modal-content"
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: size === 'wide' ? '1180px' : '500px',
          maxHeight: 'calc(100dvh - 1rem)',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', marginBottom: '1.5rem' }}>
          <h2 id={titleId} style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</h2>
          <button aria-label="Fermer" className="secondary" onClick={onClose} style={{ minWidth: 44, minHeight: 44, padding: '0.25rem 0.5rem', flexShrink: 0 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Modal;
