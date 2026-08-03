import React from 'react';
import { Search, RotateCcw } from 'lucide-react';

interface SubjectFiltersProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  statusFilter: 'all' | 'active' | 'inactive';
  setStatusFilter: (val: 'all' | 'active' | 'inactive') => void;
  sectionFilter: 'all' | 'francophone' | 'anglophone' | 'all-sections';
  setSectionFilter: (val: 'all' | 'francophone' | 'anglophone' | 'all-sections') => void;
  cycleFilter: 'all' | 'nursery' | 'primary' | 'secondary' | 'none';
  setCycleFilter: (val: 'all' | 'nursery' | 'primary' | 'secondary' | 'none') => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  categories: string[];
  hasActiveFilters: boolean;
  handleResetFilters: () => void;
}

export const SubjectFilters: React.FC<SubjectFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  sectionFilter,
  setSectionFilter,
  cycleFilter,
  setCycleFilter,
  categoryFilter,
  setCategoryFilter,
  categories,
  hasActiveFilters,
  handleResetFilters
}) => {
  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem', borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 2, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Rechercher par nom ou code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              paddingLeft: '2.25rem', 
              width: '100%', 
              borderRadius: '8px', 
              border: '2px solid var(--border-color)', 
              height: '38px',
              fontSize: '0.9rem',
              backgroundColor: '#ffffff'
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            style={{ 
              width: '100%', 
              borderRadius: '8px', 
              border: '2px solid var(--border-color)', 
              height: '38px', 
              padding: '0 0.5rem',
              fontSize: '0.9rem',
              backgroundColor: '#ffffff'
            }}
          >
            <option value="active">Actives uniquement</option>
            <option value="inactive">Inactives uniquement</option>
            <option value="all">Tous les statuts</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <select 
            value={sectionFilter} 
            onChange={(e) => setSectionFilter(e.target.value as 'all' | 'francophone' | 'anglophone' | 'all-sections')}
            style={{ 
              width: '100%', 
              borderRadius: '8px', 
              border: '2px solid var(--border-color)', 
              height: '38px', 
              padding: '0 0.5rem',
              fontSize: '0.9rem',
              backgroundColor: '#ffffff'
            }}
          >
            <option value="all">Toutes les sections</option>
            <option value="francophone">Francophone</option>
            <option value="anglophone">Anglophone</option>
            <option value="all-sections">Commune aux deux</option>
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '150px' }}>
          <select 
            value={cycleFilter} 
            onChange={(e) => setCycleFilter(e.target.value as 'all' | 'nursery' | 'primary' | 'secondary' | 'none')}
            style={{ 
              width: '100%', 
              borderRadius: '8px', 
              border: '2px solid var(--border-color)', 
              height: '38px', 
              padding: '0 0.5rem',
              fontSize: '0.9rem',
              backgroundColor: '#ffffff'
            }}
          >
            <option value="all">Tous les cycles</option>
            <option value="nursery">Maternelle / Nursery</option>
            <option value="primary">Primaire / Primary</option>
            <option value="secondary">Secondaire / Secondary</option>
            <option value="none">Non classifiées</option>
          </select>
        </div>

        {categories.length > 0 && (
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ 
                width: '100%', 
                borderRadius: '8px', 
                border: '2px solid var(--border-color)', 
                height: '38px', 
                padding: '0 0.5rem',
                fontSize: '0.9rem',
                backgroundColor: '#ffffff'
              }}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'none',
              border: 'none',
              color: 'var(--primary-color)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              padding: '0.25rem 0.5rem'
            }}
          >
            <RotateCcw size={14} /> Réinitialiser
          </button>
        )}
      </div>
    </div>
  );
};
