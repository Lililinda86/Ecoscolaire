import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Subject } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, ShieldAlert, Check, X, Search } from 'lucide-react';

const SubjectsProgram: React.FC = () => {
  const { db, safeMergeDB, currentUser } = useAppContext();

  // Navigation tabs for the module (only Catalogue is active in Lot 1)
  const [activeModuleTab, setActiveModuleTab] = useState<'catalogue' | 'program' | 'assignment' | 'summary'>('catalogue');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [sectionFilter, setSectionFilter] = useState<'all' | 'francophone' | 'anglophone' | 'all-sections'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | 'nursery' | 'primary' | 'secondary' | 'none'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Form states
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Partial<Subject> | null>(null);
  const [formData, setFormData] = useState<Partial<Subject>>({
    name: '',
    code: '',
    shortName: '',
    section: 'all',
    cycles: [],
    category: '',
    teachingLanguage: '',
    color: '#4f46e5',
    isActive: true
  });

  if (!currentUser || !db) return null;

  // Permissions check
  const canWrite = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  const canRead = ['superAdmin', 'owner', 'director', 'secretary', 'teacher'].includes(currentUser.role);

  if (!canRead) {
    return (
      <div className="page-container" style={{ padding: '2rem', textAlign: 'center' }}>
        <ShieldAlert size={48} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
        <h2>Accès non autorisé</h2>
        <p>Vous n'avez pas les permissions nécessaires pour accéder au catalogue des matières.</p>
      </div>
    );
  }

  const subjects = db.subjects || [];

  // Cycle list for selection
  const cycleOptions: { value: 'nursery' | 'primary' | 'secondary'; label: string }[] = [
    { value: 'nursery', label: 'Maternelle / Nursery' },
    { value: 'primary', label: 'Primaire / Primary' },
    { value: 'secondary', label: 'Secondaire / Secondary' }
  ];

  // Section options
  const sectionOptions = [
    { value: 'all', label: 'Toutes les sections' },
    { value: 'francophone', label: 'Section Francophone' },
    { value: 'anglophone', label: 'Section Anglophone' }
  ];

  // Extract unique categories for filtering
  const categories = Array.from(
    new Set(subjects.map((s) => s.category).filter((c): c is string => typeof c === 'string' && c.trim() !== ''))
  );

  // Filter subjects list
  const filteredSubjects = subjects.filter((s) => {
    // 1. Search Query (Name or Code)
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(searchQuery.toLowerCase()));

    // 2. Status (isActive !== false for active, isActive === false for inactive)
    const isSubjectActive = s.isActive !== false;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && isSubjectActive) ||
      (statusFilter === 'inactive' && !isSubjectActive);

    // 3. Section
    const matchesSection =
      sectionFilter === 'all' ||
      s.section === sectionFilter ||
      (sectionFilter === 'all-sections' && s.section === 'all');

    // 4. Cycle
    let matchesCycle = true;
    if (cycleFilter !== 'all') {
      if (cycleFilter === 'none') {
        matchesCycle = !s.cycles || s.cycles.length === 0;
      } else {
        matchesCycle = !!s.cycles && s.cycles.includes(cycleFilter as 'nursery' | 'primary' | 'secondary');
      }
    }

    // 5. Category
    const matchesCategory =
      !categoryFilter || s.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesSection && matchesCycle && matchesCategory;
  });

  // Count active / inactive
  const activeCount = subjects.filter((s) => s.isActive !== false).length;
  const inactiveCount = subjects.filter((s) => s.isActive === false).length;

  const handleOpenCreate = () => {
    setEditingSubject(null);
    setFormData({
      name: '',
      code: '',
      shortName: '',
      section: 'all',
      cycles: [],
      category: '',
      teachingLanguage: '',
      color: '#4f46e5',
      isActive: true
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({
      ...subject,
      cycles: subject.cycles || []
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      alert("Le nom de la matière est obligatoire.");
      return;
    }

    const normalizedName = formData.name.trim();
    const normalizedCode = formData.code?.trim() || '';

    // Check code uniqueness within the school
    if (normalizedCode) {
      const codeDuplicate = subjects.find(
        (s) =>
          s.id !== (editingSubject?.id || '') &&
          s.code?.trim().toLowerCase() === normalizedCode.toLowerCase() &&
          s.isActive !== false
      );
      if (codeDuplicate) {
        alert(`Le code matière "${normalizedCode}" est déjà utilisé par la matière active "${codeDuplicate.name}".`);
        return;
      }
    }

    const newDb = { ...db };
    const timestamp = new Date().toISOString();
    const userEmail = currentUser.email;

    if (editingSubject?.id) {
      // Update
      newDb.subjects = subjects.map((s) =>
        s.id === editingSubject.id
          ? {
              ...s,
              ...formData,
              name: normalizedName,
              code: normalizedCode,
              updatedAt: timestamp,
              updatedBy: userEmail
            }
          : s
      );
    } else {
      // Create
      const newSubj: Subject = {
        ...formData,
        id: crypto.randomUUID(),
        schoolId: db.school?.id || '',
        name: normalizedName,
        code: normalizedCode,
        isActive: true,
        createdAt: timestamp,
        createdBy: userEmail,
        updatedAt: timestamp,
        updatedBy: userEmail
      };
      newDb.subjects = [...subjects, newSubj];
    }

    safeMergeDB(newDb);
    setModalOpen(false);
  };

  const handleToggleActiveStatus = (subject: Subject) => {
    const isActivating = subject.isActive === false;
    const confirmMessage = isActivating
      ? `Voulez-vous réactiver la matière "${subject.name}" ?`
      : `Voulez-vous désactiver la matière "${subject.name}" ? Elle restera visible dans les anciennes notes mais ne sera plus proposée pour les nouvelles configurations.`;

    if (window.confirm(confirmMessage)) {
      const timestamp = new Date().toISOString();
      const userEmail = currentUser.email;

      const newDb = { ...db };
      newDb.subjects = subjects.map((s) =>
        s.id === subject.id
          ? {
              ...s,
              isActive: isActivating,
              updatedAt: timestamp,
              updatedBy: userEmail
            }
          : s
      );

      safeMergeDB(newDb);
    }
  };

  const handleCycleCheckboxChange = (cycle: 'nursery' | 'primary' | 'secondary', checked: boolean) => {
    const currentCycles = formData.cycles || [];
    if (checked) {
      setFormData({ ...formData, cycles: [...currentCycles, cycle] });
    } else {
      setFormData({ ...formData, cycles: currentCycles.filter((c) => c !== cycle) });
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Matières & Programmes</h1>
        {canWrite && activeModuleTab === 'catalogue' && (
          <button onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> Ajouter une matière
          </button>
        )}
      </div>

      {/* Module Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className="tab-button"
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeModuleTab === 'catalogue' ? '2px solid var(--primary-color)' : 'none',
            color: activeModuleTab === 'catalogue' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: activeModuleTab === 'catalogue' ? 'bold' : 'normal',
            padding: '0.5rem 1rem',
            cursor: 'pointer'
          }}
          onClick={() => setActiveModuleTab('catalogue')}
        >
          Catalogue des matières
        </button>
        <button
          className="tab-button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            padding: '0.5rem 1rem',
            cursor: 'not-allowed',
            opacity: 0.5
          }}
          disabled
          title="Disponible dans le prochain lot"
        >
          Programmes par classe (Bientôt)
        </button>
        <button
          className="tab-button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            padding: '0.5rem 1rem',
            cursor: 'not-allowed',
            opacity: 0.5
          }}
          disabled
          title="Disponible dans le prochain lot"
        >
          Affectation des Enseignants (Bientôt)
        </button>
      </div>

      {activeModuleTab === 'catalogue' && (
        <div>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', background: 'var(--card-bg)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Matières actives : </span>
              <strong style={{ fontSize: '1.1rem', color: 'var(--success)' }}>{activeCount}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Matières inactives : </span>
              <strong style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>{inactiveCount}</strong>
            </div>
          </div>

          {/* Search and Filters panel */}
          <div className="card" style={{ marginBottom: '2rem', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Rechercher par nom ou code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '2.5rem', width: '100%' }}
                />
              </div>

              <div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
                  <option value="active">Actives uniquement</option>
                  <option value="inactive">Inactives uniquement</option>
                  <option value="all">Tous les statuts</option>
                </select>
              </div>

              <div>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value as 'all' | 'francophone' | 'anglophone' | 'all-sections')}>
                  <option value="all">Toutes les sections</option>
                  <option value="francophone">Francophone</option>
                  <option value="anglophone">Anglophone</option>
                  <option value="all-sections">Commune aux deux</option>
                </select>
              </div>

              <div>
                <select value={cycleFilter} onChange={(e) => setCycleFilter(e.target.value as 'all' | 'nursery' | 'primary' | 'secondary' | 'none')}>
                  <option value="all">Tous les cycles</option>
                  <option value="nursery">Maternelle / Nursery</option>
                  <option value="primary">Primaire / Primary</option>
                  <option value="secondary">Secondaire / Secondary</option>
                  <option value="none">Non classifiées</option>
                </select>
              </div>

              {categories.length > 0 && (
                <div>
                  <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="">Toutes les catégories</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Subjects Table */}
          <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ padding: '1rem' }}>Code</th>
                  <th style={{ padding: '1rem' }}>Matière</th>
                  <th style={{ padding: '1rem' }}>Section</th>
                  <th style={{ padding: '1rem' }}>Cycles</th>
                  <th style={{ padding: '1rem' }}>Catégorie</th>
                  <th style={{ padding: '1rem' }}>Statut</th>
                  {canWrite && <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSubjects.map((s) => {
                  const isActive = s.isActive !== false;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem', fontWeight: 'bold' }}>
                        {s.code ? (
                          <span style={{ background: 'rgba(0,0,0,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                            {s.code}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.color || '#4f46e5' }} />
                          <div>
                            <div style={{ fontWeight: 500 }}>{s.name}</div>
                            {s.shortName && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nom court : {s.shortName}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                        {s.section === 'francophone' && <span className="badge badge-fr">FR</span>}
                        {s.section === 'anglophone' && <span className="badge badge-en">EN</span>}
                        {(s.section === 'all' || !s.section) && <span className="badge badge-all">FR / EN</span>}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {s.cycles && s.cycles.length > 0 ? (
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {s.cycles.map((cyc) => (
                              <span
                                key={cyc}
                                style={{
                                  fontSize: '0.75rem',
                                  background: 'rgba(79, 70, 229, 0.1)',
                                  color: 'var(--primary-color)',
                                  padding: '0.1rem 0.4rem',
                                  borderRadius: '4px'
                                }}
                              >
                                {cyc === 'nursery' ? 'Maternelle' : cyc === 'primary' ? 'Primaire' : 'Secondaire'}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Non défini</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{s.category || '-'}</td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: isActive ? 'var(--success)' : 'var(--danger)',
                          fontWeight: 500,
                          fontSize: '0.85rem'
                        }}>
                          {isActive ? <Check size={14} /> : <X size={14} />} {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canWrite && (
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button
                            className="secondary"
                            style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem' }}
                            onClick={() => handleOpenEdit(s)}
                            title="Modifier"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="secondary"
                            style={{
                              padding: '0.25rem 0.5rem',
                              color: isActive ? 'var(--danger)' : 'var(--success)',
                              borderColor: isActive ? 'var(--danger)' : 'var(--success)'
                            }}
                            onClick={() => handleToggleActiveStatus(s)}
                            title={isActive ? 'Désactiver' : 'Réactiver'}
                          >
                            {isActive ? <X size={14} /> : <Check size={14} />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredSubjects.length === 0 && (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucune matière ne correspond à votre recherche ou à vos filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title={editingSubject ? 'Modifier la matière' : 'Ajouter une matière'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>Nom de la matière *</label>
            <input
              type="text"
              required
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Mathématiques, Français..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Code matière (Facultatif)</label>
              <input
                type="text"
                value={formData.code || ''}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Ex: MATH, FR, ENG"
              />
            </div>
            <div className="form-group">
              <label>Nom court / Abréviation</label>
              <input
                type="text"
                value={formData.shortName || ''}
                onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                placeholder="Ex: Maths, Fr, Eng"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Section</label>
              <select value={formData.section || 'all'} onChange={(e) => setFormData({ ...formData, section: e.target.value as 'francophone' | 'anglophone' | 'all' })}>
                {sectionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Catégorie / Groupe</label>
              <input
                type="text"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ex: Sciences, Littérature, Langues..."
              />
            </div>
          </div>

          <div className="form-group">
            <label>Cycles concernés</label>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
              {cycleOptions.map((cyc) => {
                const isChecked = (formData.cycles || []).includes(cyc.value);
                return (
                  <label key={cyc.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => handleCycleCheckboxChange(cyc.value, e.target.checked)}
                    />
                    <span>{cyc.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Langue d'enseignement</label>
              <input
                type="text"
                value={formData.teachingLanguage || ''}
                onChange={(e) => setFormData({ ...formData, teachingLanguage: e.target.value })}
                placeholder="Ex: Français, Anglais..."
              />
            </div>
            <div className="form-group">
              <label>Couleur d'affichage</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={formData.color || '#4f46e5'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  style={{ width: '40px', height: '40px', padding: 0, border: 'none', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={formData.color || '#4f46e5'}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#4f46e5"
                  style={{ flex: 1 }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>
              Annuler
            </button>
            <button type="submit">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SubjectsProgram;
