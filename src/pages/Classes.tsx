import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { sortClasses } from '../utils/sortClasses';
import type { ClassSection } from '../types';

const getCycleLabel = (cls: ClassSection): string => {
  const c = cls.cycle || cls.level;
  if (!c) {
    // Fallback bas de gamme d'après le nom de la classe
    const n = cls.name.toLowerCase();
    if (n.includes('maternelle') || n.includes('nursery') || n.includes('pré-')) return 'Maternelle';
    if (n.includes('6') || n.includes('5') || n.includes('4') || n.includes('3') || n.includes('form') || n.includes('seconde') || n.includes('première') || n.includes('terminale') || n.includes('sixth')) return 'Secondaire';
    return 'Primaire';
  }
  if (c === 'nursery' || c === 'preschool' || c === 'maternelle') return 'Maternelle';
  if (c === 'primary' || c === 'primaire') return 'Primaire';
  if (c === 'secondary' || c === 'secondaire') return 'Secondaire';
  return 'Primaire';
};

const Classes: React.FC = () => {
  const { db, safeMergeDB, currentUser, currentSchool } = useAppContext();
  const { t } = useI18n();
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const canManage = ['superAdmin', 'owner', 'director'].includes(currentUser.role);

  // Filtre strict du schoolId : String(classItem.schoolId || '') === currentSchool?.id
  const schoolClasses = (db.classes || []).filter(c => currentSchool && String(c.schoolId || '') === currentSchool.id);

  const filteredClasses = schoolClasses.filter(c => {
    // Filtre par recherche
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.type && c.type.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Filtre par cycle
    const cycleLabel = getCycleLabel(c);
    const matchesCycle = cycleFilter === 'all' || cycleLabel === cycleFilter;

    // Filtre par statut
    const isActive = c.isActive !== false;
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && isActive) || 
                          (statusFilter === 'inactive' && !isActive);

    return matchesSearch && matchesCycle && matchesStatus;
  });

  const sortedFilteredClasses = sortClasses(filteredClasses);

  const currentClass = schoolClasses.find(c => c.id === selectedClassId);
  const teachers = currentClass ? db.staff.filter(s => s.role === 'teacher' && s.assignedClassId === currentClass.id) : [];
  const students = currentClass ? db.students.filter(s => s.classId === currentClass.id && String(s.schoolId || '') === currentSchool?.id) : [];

  const handleChangeClass = (studentId: string, newClassId: string) => {
    if (!canManage) return;
    const newDb = { ...db };
    const studentIndex = newDb.students.findIndex(s => s.id === studentId);
    if (studentIndex >= 0) {
      newDb.students[studentIndex].classId = newClassId;
      safeMergeDB(newDb);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>{t('classes', 'Classes & Vue d\'ensemble')}</h1>
        {canManage && (
          <button onClick={() => {
            import('../constants/defaultClasses').then(({ DEFAULT_CLASS_LEVELS }) => {
              if (!currentSchool) return;
              const isItalo = currentSchool?.name?.toLowerCase().includes('italo');
              
              const newClasses = DEFAULT_CLASS_LEVELS.map(defCls => {
                const legacyMapping: Record<string, string> = {
                  'Pré-maternelle': 'franco-pre-maternelle',
                  'Maternelle 1': 'franco-maternelle-1',
                  'Maternelle 2': 'franco-maternelle-2',
                  'Maternelle 3': 'franco-maternelle-3',
                  'SIL': 'franco-sil',
                  'CP': 'franco-cp',
                  'CE1': 'franco-ce1',
                  'CE2': 'franco-ce2',
                  'CM1': 'franco-cm1',
                  'CM2': 'franco-cm2',
                  '6ème': 'franco-6e',
                  '5ème': 'franco-5e',
                  'Pre-Nursery': 'anglo-pre-nursery',
                  'Nursery 1': 'anglo-nursery-1',
                  'Nursery 2': 'anglo-nursery-2',
                  'Nursery 3': 'anglo-nursery-3',
                  'Class 1': 'anglo-class-1',
                  'Class 2': 'anglo-class-2',
                  'Class 3': 'anglo-class-3',
                  'Class 4': 'anglo-class-4',
                  'Class 5': 'anglo-class-5',
                  'Class 6': 'anglo-class-6',
                  'Form 1': 'anglo-form-1',
                  'Form 2': 'anglo-form-2'
                };
                const mappedId = legacyMapping[defCls.name];
                
                const italoActiveClasses = [
                  'Pré-maternelle', 'Maternelle 1', 'Maternelle 2', 'Maternelle 3',
                  'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '6ème', '5ème',
                  'Pre-Nursery', 'Nursery 1', 'Nursery 2', 'Nursery 3',
                  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
                  'Form 1', 'Form 2'
                ];
                const isActive = isItalo ? italoActiveClasses.includes(defCls.name) : defCls.isActive;

                return {
                  id: mappedId || defCls.id,
                  schoolId: currentSchool.id,
                  name: defCls.name,
                  type: defCls.section,
                  section: defCls.section,
                  cycle: defCls.cycle,
                  educationType: defCls.educationType,
                  levelOrder: defCls.levelOrder,
                  isDefault: true,
                  isActive: isActive
                };
              });

              const toAdd = newClasses.filter(newCls => !schoolClasses.some(c => c.name.toLowerCase() === newCls.name.toLowerCase() && c.type === newCls.type));
              
              if (toAdd.length > 0) {
                safeMergeDB({ ...db, classes: [...db.classes, ...toAdd] });
                alert(`${toAdd.length} classes standards du Cameroun ont été initialisées avec succès !`);
              } else {
                alert("Toutes les classes du référentiel sont déjà présentes.");
              }
            });
          }} style={{ background: 'var(--success)', fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
            Initialiser les classes standard
          </button>
        )}
      </div>

      {/* Barre de recherche et filtres */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Rechercher :</label>
          <input 
            type="text"
            placeholder="Nom de classe ou section..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
          />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Cycle :</label>
          <select value={cycleFilter} onChange={e => setCycleFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <option value="all">Tous les cycles</option>
            <option value="Maternelle">Maternelle</option>
            <option value="Primaire">Primaire</option>
            <option value="Secondaire">Secondaire</option>
          </select>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Statut :</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <option value="all">Toutes</option>
            <option value="active">Actives uniquement</option>
            <option value="inactive">Inactives uniquement</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe à détailler :</label>
        <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <option value="">-- Choisir une classe ({sortedFilteredClasses.length} disponible(s)) --</option>
          {sortedFilteredClasses.map(c => {
            const count = db.students.filter(s => s.classId === c.id && String(s.schoolId || '') === currentSchool?.id).length;
            const cycleName = getCycleLabel(c);
            const statusLabel = c.isActive === false ? ' (Inactive)' : '';
            return (
              <option key={c.id} value={c.id}>
                {cycleName} — {c.name} ({c.type || 'Général'}){statusLabel} — {count} élève(s)
              </option>
            );
          })}
        </select>
      </div>

      {sortedFilteredClasses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Aucune classe ne correspond aux critères de recherche.
        </div>
      ) : currentClass ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h2>
              {getCycleLabel(currentClass)} — {currentClass.name} <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>({currentClass.type || 'Général'})</span>
            </h2>
            <span style={{ 
              padding: '0.25rem 0.75rem', 
              borderRadius: '12px', 
              fontSize: '0.85rem', 
              fontWeight: 600,
              background: currentClass.isActive !== false ? '#d1fae5' : '#fee2e2',
              color: currentClass.isActive !== false ? '#065f46' : '#991b1b'
            }}>
              {currentClass.isActive !== false ? 'Active' : 'Inactive'}
            </span>
          </div>
          
          <h3 style={{ marginTop: '1.5rem', color: 'var(--primary-color)' }}>Enseignant(s) Titulaire(s)</h3>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '2rem' }}>
            {teachers.length > 0 ? (
              teachers.map(t => <li key={t.id} style={{ padding: '0.25rem 0' }}>{t.name}</li>)
            ) : (
              <li style={{ color: 'var(--text-muted)' }}>Aucun enseignant assigné.</li>
            )}
          </ul>
          
          <h3 style={{ marginTop: '1.5rem', color: 'var(--primary-color)' }}>Élèves inscrits ({students.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Nom</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Sexe</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Parent</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '120px' }}>Contact</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Adresse</th>
                  {canManage && <th style={{ padding: '0.75rem', textAlign: 'left' }}>Action (Reclasser)</th>}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucun élève dans cette classe.
                    </td>
                  </tr>
                ) : (
                  students.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{s.name}</td>
                      <td style={{ padding: '0.75rem' }}>{s.gender}</td>
                      <td style={{ padding: '0.75rem' }}>{s.parentName}</td>
                      <td style={{ padding: '0.75rem' }}>{s.parentPhone || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>{s.address || '-'}</td>
                      {canManage && (
                        <td style={{ padding: '0.75rem' }}>
                          <select 
                            value={s.classId || ''} 
                            onChange={e => handleChangeClass(s.id, e.target.value)}
                            style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                          >
                            {sortClasses(schoolClasses.filter(c => c.isActive !== false)).filter(c => c.type === s.section).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Classes;
