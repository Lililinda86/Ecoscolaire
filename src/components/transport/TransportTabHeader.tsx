import React from 'react';
import { Filter } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface TransportTabHeaderProps {
  title: string;
  description: string;
  count?: number;
  icon?: LucideIcon;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  canAct?: boolean;
  filters?: React.ReactNode;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}

const TransportTabHeader: React.FC<TransportTabHeaderProps> = ({
  title,
  description,
  count,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  actionLabel,
  actionIcon,
  onAction,
  canAct = false,
  filters,
  hasActiveFilters,
  onResetFilters
}) => {
  return (
    <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: (searchPlaceholder || filters) ? '1.5rem' : '0' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {title}
            {count !== undefined && (
              <span style={{ fontSize: '0.875rem', background: 'var(--primary)', color: 'white', padding: '0.1rem 0.5rem', borderRadius: '99px' }}>
                {count}
              </span>
            )}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{description}</p>
        </div>
        
        {canAct && actionLabel && onAction && (
          <button className="primary" onClick={onAction} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {actionIcon}
            {actionLabel}
          </button>
        )}
      </div>

      {(searchPlaceholder || filters) && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          {searchPlaceholder && onSearchChange !== undefined && (
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ flex: '1 1 250px', minWidth: '250px' }}
            />
          )}
          
          {filters && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                <Filter size={16} /> <span style={{ fontSize: '0.875rem' }}>Filtres:</span>
              </div>
              {filters}
            </div>
          )}

          {hasActiveFilters && onResetFilters && (
            <button className="secondary" onClick={onResetFilters} style={{ fontSize: '0.875rem', padding: '0.5rem' }}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TransportTabHeader;
