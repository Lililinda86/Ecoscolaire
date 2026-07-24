import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Subject } from '../types';
import { Plus, ShieldAlert, Check, Search, AlertTriangle } from 'lucide-react';
import { SubjectFilters } from './subjects/SubjectFilters';
import { SubjectTable } from './subjects/SubjectTable';
import { SubjectStatusDialog } from './subjects/SubjectStatusDialog';
import { SubjectFormModal } from './subjects/SubjectFormModal';
import { ClassProgramPanel } from './subjects/programs/ClassProgramPanel';

const SubjectsProgram: React.FC = () => {
  const { db, safeMergeDB, currentUser } = useAppContext();

  // Navigation tabs for the module (only Catalogue is active in Lot 1)
  const [activeModuleTab, setActiveModuleTab] = useState<'catalogue' | 'program' | 'assignment'>('catalogue');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [sectionFilter, setSectionFilter] = useState<'all' | 'francophone' | 'anglophone' | 'all-sections'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | 'nursery' | 'primary' | 'secondary' | 'none'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Form states
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Partial<Subject> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeactivateSubject, setConfirmDeactivateSubject] = useState<Subject | null>(null);

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

  // Client-side form validation errors
  const [errors, setErrors] = useState<{ name?: string; cycles?: string; code?: string }>({});

  // Notification Toast states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Focus management refs
  const nameInputRef = useRef<HTMLInputElement>(null);
  const openModalButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isModalOpen && openModalButtonRef.current) {
      // Return focus to the trigger button when modal closes
      openModalButtonRef.current.focus();
    }
  }, [isModalOpen]);

  // Handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeactivateSubject) {
          setConfirmDeactivateSubject(null);
        } else if (isModalOpen) {
          setModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, confirmDeactivateSubject]);

  // Toast auto-cleanup
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!currentUser || !db) return null;

  const activeSchoolId = db.school?.id;

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
    setErrors({});
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
    setErrors({});
    setEditingSubject(subject);
    setFormData({
      ...subject,
      cycles: subject.cycles || []
    });
    setModalOpen(true);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setSectionFilter('all');
    setCycleFilter('all');
    setCategoryFilter('');
  };

  const hasActiveFilters =
    searchQuery !== '' ||
    statusFilter !== 'all' ||
    sectionFilter !== 'all' ||
    cycleFilter !== 'all' ||
    categoryFilter !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    // Safety check on schoolId
    if (!activeSchoolId || typeof activeSchoolId !== 'string' || activeSchoolId.trim() === '') {
      setToast({ message: "Aucun établissement actif n’est sélectionné. Impossible d’enregistrer cette matière.", type: 'error' });
      return;
    }

    // Validations front
    const validationErrors: { name?: string; cycles?: string; code?: string } = {};

    if (!formData.name?.trim()) {
      validationErrors.name = "Le nom de la matière est obligatoire.";
    }

    if (!formData.cycles || formData.cycles.length === 0) {
      validationErrors.cycles = "Sélectionnez au moins un cycle.";
    }

    const normalizedName = formData.name?.trim() || '';
    const normalizedCode = formData.code?.trim() || '';

    // Check code uniqueness within the school (active + inactive)
    if (normalizedCode) {
      const codeDuplicate = subjects.find(
        (s) =>
          s.id !== (editingSubject?.id || '') &&
          s.code?.trim().toLowerCase() === normalizedCode.toLowerCase()
      );
      if (codeDuplicate) {
        validationErrors.code = "Ce code est déjà utilisé dans cet établissement.";
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const newDb = { ...db };
      const timestamp = new Date().toISOString();
      const userEmail = currentUser.email;

      if (editingSubject?.id) {
        // Update (preserve schoolId)
        newDb.subjects = subjects.map((s) =>
          s.id === editingSubject.id
            ? {
                ...s,
                ...formData,
                name: normalizedName,
                code: normalizedCode,
                schoolId: s.schoolId, // Preserves historic schoolId
                updatedAt: timestamp,
                updatedBy: userEmail
              }
            : s
        );
        setToast({ message: "Matière modifiée avec succès.", type: 'success' });
      } else {
        // Create (enforce activeSchoolId)
        const newSubj: Subject = {
          ...formData,
          id: crypto.randomUUID(),
          schoolId: activeSchoolId,
          name: normalizedName,
          code: normalizedCode,
          isActive: true,
          createdAt: timestamp,
          createdBy: userEmail,
          updatedAt: timestamp,
          updatedBy: userEmail
        };
        newDb.subjects = [...subjects, newSubj];
        setToast({ message: "Matière ajoutée avec succès.", type: 'success' });
      }

      await safeMergeDB(newDb);
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      setToast({ message: "Une erreur est survenue lors de l'enregistrement.", type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActiveStatus = (subject: Subject) => {
    const isActivating = subject.isActive === false;
    if (isActivating) {
      // Direct activation check for code collisions
      executeToggleStatus(subject, true);
    } else {
      // Modal confirmation for deactivation
      setConfirmDeactivateSubject(subject);
    }
  };

  const executeToggleStatus = async (subject: Subject, nextStatus: boolean) => {
    const timestamp = new Date().toISOString();
    const userEmail = currentUser.email;

    // Reactivation collision check
    if (nextStatus && subject.code?.trim()) {
      const collision = subjects.find(
        (s) =>
          s.id !== subject.id &&
          s.code?.trim().toLowerCase() === subject.code?.trim().toLowerCase()
      );
      if (collision) {
        setToast({
          message: "Cette matière ne peut pas être réactivée car son code est déjà utilisé par une autre matière.",
          type: 'error'
        });
        setConfirmDeactivateSubject(null);
        return;
      }
    }

    try {
      const newDb = { ...db };
      newDb.subjects = subjects.map((s) =>
        s.id === subject.id
          ? {
              ...s,
              isActive: nextStatus,
              updatedAt: timestamp,
              updatedBy: userEmail
            }
          : s
      );

      await safeMergeDB(newDb);
      setToast({
        message: nextStatus ? "Matière réactivée." : "Matière désactivée.",
        type: 'success'
      });
    } catch (err) {
      console.error(err);
      setToast({ message: "Erreur lors du changement de statut.", type: 'error' });
    } finally {
      setConfirmDeactivateSubject(null);
    }
  };

  return (
    <div className="page-container" style={{ fontFamily: "'Inter', sans-serif", position: 'relative' }}>
      
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toast.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '12px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 2000,
          fontWeight: 500
        }}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Matières & Programmes</h1>
        </div>
        {canWrite && activeModuleTab === 'catalogue' && (
          <button 
            ref={openModalButtonRef}
            onClick={handleOpenCreate} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              backgroundColor: 'var(--primary-color)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.15)'
            }}
          >
            <Plus size={18} /> Ajouter une matière
          </button>
        )}
      </div>

      {/* Module Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          className="tab-button"
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeModuleTab === 'catalogue' ? '3px solid var(--primary-color)' : 'none',
            color: activeModuleTab === 'catalogue' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: 700,
            padding: '0.5rem 1.25rem',
            cursor: 'pointer',
            fontSize: '0.95rem'
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
            borderBottom: activeModuleTab === 'program' ? '3px solid var(--primary-color)' : 'none',
            color: activeModuleTab === 'program' ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: 700,
            padding: '0.5rem 1.25rem',
            cursor: 'pointer',
            fontSize: '0.95rem'
          }}
          onClick={() => setActiveModuleTab('program')}
        >
          Programmes par classe
        </button>
        <button
          className="tab-button"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            padding: '0.5rem 1.25rem',
            cursor: 'not-allowed',
            opacity: 0.5,
            fontSize: '0.95rem'
          }}
          disabled
          title="Disponible dans le prochain lot"
        >
          Affectation des Enseignants (Bientôt)
        </button>
      </div>

      {activeModuleTab === 'catalogue' && (
        <div>
          {/* Summary stats cards */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <div style={{ 
              flex: 1, 
              minWidth: '200px', 
              background: 'rgba(16, 185, 129, 0.05)', 
              border: '1px solid rgba(16, 185, 129, 0.2)', 
              padding: '0.65rem 1.25rem', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '92px',
              boxSizing: 'border-box'
            }}>
              <span style={{ color: '#047857', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matières actives</span>
              <strong style={{ fontSize: '1.85rem', color: '#065f46', fontWeight: 800, marginTop: '0.15rem' }}>{activeCount}</strong>
            </div>
            <div style={{ 
              flex: 1, 
              minWidth: '200px', 
              background: 'rgba(100, 116, 139, 0.05)', 
              border: '1px solid rgba(100, 116, 139, 0.2)', 
              padding: '0.65rem 1.25rem', 
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '92px',
              boxSizing: 'border-box'
            }}>
              <span style={{ color: '#475569', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matières inactives</span>
              <strong style={{ fontSize: '1.85rem', color: '#1e293b', fontWeight: 800, marginTop: '0.15rem' }}>{inactiveCount}</strong>
            </div>
          </div>

          {/* Search and Filters panel */}
          <SubjectFilters
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sectionFilter={sectionFilter}
            setSectionFilter={setSectionFilter}
            cycleFilter={cycleFilter}
            setCycleFilter={setCycleFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            categories={categories}
            hasActiveFilters={hasActiveFilters}
            handleResetFilters={handleResetFilters}
          />

          {/* Empty States & Table */}
          {subjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(79, 70, 229, 0.05)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <Plus size={32} style={{ color: 'var(--primary-color)' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', marginBottom: '0.5rem' }}>Aucune matière enregistrée</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 1.5rem auto', fontSize: '0.95rem' }}>
                Ajoutez les matières enseignées dans votre établissement pour préparer les programmes, les affectations et les bulletins.
              </p>
              {canWrite && (
                <button 
                  onClick={handleOpenCreate}
                  style={{
                    backgroundColor: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Ajouter une matière
                </button>
              )}
            </div>
          ) : filteredSubjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(100, 116, 139, 0.05)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <Search size={32} style={{ color: 'var(--text-muted)' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', marginBottom: '0.5rem' }}>Aucune matière trouvée</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 1.5rem auto', fontSize: '0.95rem' }}>
                Modifiez votre recherche ou réinitialisez les filtres.
              </p>
              <button 
                onClick={handleResetFilters}
                style={{
                  backgroundColor: 'white',
                  color: 'var(--primary-color)',
                  border: '1px solid var(--primary-color)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <SubjectTable
              filteredSubjects={filteredSubjects}
              canWrite={canWrite}
              handleOpenEdit={handleOpenEdit}
              handleToggleActiveStatus={handleToggleActiveStatus}
            />
          )}
        </div>
      )}

      {activeModuleTab === 'program' && <ClassProgramPanel />}

      {/* CREATE & EDIT FORM MODAL */}
      <SubjectFormModal
        isOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
        editingSubject={editingSubject}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        errors={errors}
        isSubmitting={isSubmitting}
        nameInputRef={nameInputRef}
      />

      {/* CONFIRMATION DEACTIVATE DIALOG */}
      <SubjectStatusDialog
        isOpen={confirmDeactivateSubject !== null}
        subject={confirmDeactivateSubject}
        onCancel={() => setConfirmDeactivateSubject(null)}
        onConfirm={() => {
          if (confirmDeactivateSubject) {
            executeToggleStatus(confirmDeactivateSubject, false);
          }
        }}
      />
    </div>
  );
};

export default SubjectsProgram;
