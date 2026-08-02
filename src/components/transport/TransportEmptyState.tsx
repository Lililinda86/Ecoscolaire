import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface TransportEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  canAct?: boolean;
}

const TransportEmptyState: React.FC<TransportEmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  canAct = false
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      textAlign: 'center',
      background: 'var(--bg-color)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginTop: '1rem'
    }}>
      <div style={{
        background: 'rgba(156, 163, 175, 0.1)',
        padding: '1.5rem',
        borderRadius: '50%',
        marginBottom: '1.5rem',
        color: 'var(--text-secondary)'
      }}>
        <Icon size={48} />
      </div>
      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-secondary)', maxWidth: '400px' }}>{description}</p>
      
      {canAct && actionLabel && onAction && (
        <button className="primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default TransportEmptyState;
