import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { sortClasses } from '../utils/sortClasses';
import { DEFAULT_CLASS_LEVELS } from '../constants/defaultClasses';
import { buildStandardClassDocumentId } from '../utils/classCatalog';
import type { ClassSection } from '../types';

const getCycleLabel = (cls: { cycle?: string; level?: string; name: string }): string => {
  const c = cls.cycle || cls.level;
  if (c === 'nursery' || c === 'preschool' || c === 'maternelle') return 'Maternelle';
  if (c === 'primary' || c === 'primaire') return 'Primaire';
  if (c === 'secondary' || c === 'secondaire') return 'Secondaire';

  // Fallback rigoureux par nom exact ou pattern
  const n = cls.name.toLowerCase().trim();
  if (n.includes('maternelle') || n.includes('nursery') || n.includes('pré-') || n.includes('petite section') || n.includes('moyenne section') || n.includes('grande section')) {
    return 'Maternelle';
  }
  if (n.startsWith('class ') || n === 'sil' || n === 'cp' || n === 'ce1' || n === 'ce2' || n === 'cm1' || n === 'cm2') {
    return 'Primaire';
  }
  if (n.startsWith('form ') || n.includes('sixth') || n.includes('6e') || n.includes('6ème') || n.includes('5e') || n.includes('5ème') || n.includes('4e') || n.includes('4ème') || n.includes('3e') || n.includes('3ème') || n.includes('seconde') || n.includes('2nde') || n.includes('première') || n.includes('1re') || n.includes('terminale')) {
    return 'Secondaire';
  }
  return 'Primaire';
};

const Classes: React.FC = () => {
  const { db, safeMergeDB, updateLocalState, currentUser, currentSchool } = useAppContext();
  const { t } = useI18n();
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const canManage = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  const isSecretary = currentUser.role === 'secretary';

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

  // Détection des anomalies et classes manquantes pour l'aperçu et le bandeau d'alerte
  const canonicalLevels = DEFAULT_CLASS_LEVELS.filter(l => l.educationType === 'general');
  const missingLevels = canonicalLevels.filter(def => !schoolClasses.some(c => {
    const cType = c.type || c.section || 'francophone';
    const cName = c.name.toLowerCase().trim();
    const defName = def.name.toLowerCase().trim();

    // Equivalences
    if (defName === 'petite section' && (cName === 'maternelle 1' || cName === 'petite section')) return cType === def.section;
    if (defName === 'moyenne section' && (cName === 'maternelle 2' || cName === 'moyenne section')) return cType === def.section;
    if (defName === 'grande section' && (cName === 'maternelle 3' || cName === 'grande section')) return cType === def.section;
    if (defName === '6e' && (cName === '6ème' || cName === '6e')) return cType === def.section;
    if (defName === '5e' && (cName === '5ème' || cName === '5e')) return cType === def.section;

    return cName === defName && cType === def.section;
  }));

  const incoherentCycleClasses = schoolClasses.filter(c => {
    const nameLower = c.name.toLowerCase().trim();
    const cycleLabel = getCycleLabel(c);
    if (['class 3', 'class 4', 'class 5', 'class 6'].includes(nameLower) && (c.cycle === 'secondary' || cycleLabel === 'Secondaire')) {
      return true;
    }
    return false;
  });

  const handleSyncClasses = async () => {
    if (!canManage || !currentSchool) return;

    const toAdd = missingLevels.map(defCls => ({
      id: buildStandardClassDocumentId(currentSchool.id, defCls.catalogLevelId),
      catalogLevelId: defCls.catalogLevelId,
      schoolId: currentSchool.id,
      name: defCls.name,
      type: defCls.section,
      section: defCls.section,
      cycle: defCls.cycle,
      educationType: defCls.educationType,
      levelOrder: defCls.levelOrder,
      isDefault: true,
      isActive: true
    }));

    let msg = `=== APERÇU DE LA SYNCHRONISATION ===\n\n`;
    msg += `Classes déjà enregistrées dans l'école : ${schoolClasses.length}\n`;
    msg += `Niveaux généraux manquants à ajouter : ${toAdd.length}\n`;
    if (toAdd.length > 0) {
      msg += `Niveaux à créer : ${toAdd.map(a => `${a.name} (${a.section})`).join(', ')}\n`;
    }
    if (incoherentCycleClasses.length > 0) {
      msg += `\nAnomalies de cycle détectées (${incoherentCycleClasses.length}) : ${incoherentCycleClasses.map(c => c.name).join(', ')}\n`;
    }
    msg += `\nVoulez-vous procéder à la création des ${toAdd.length} classes manquantes ? (Aucune classe existante ne sera modifiée ou supprimée).`;

    if (toAdd.length === 0) {
      alert("Toutes les classes du catalogue standard sont déjà présentes pour votre établissement !");
      return;
    }

    if (window.confirm(msg)) {
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        const { writeBatch, doc } = await import('firebase/firestore');

        const batch = writeBatch(firestoreDb);
        toAdd.forEach(newCls => {
          const classRef = doc(firestoreDb, 'classes', newCls.id);
          batch.set(classRef, newCls, { merge: true });
        });

        await batch.commit();
        updateLocalState({ classes: [...db.classes, ...toAdd] });
        alert(`${toAdd.length} classes standards ont été complétées avec succès !`);
      } catch (err) {
        console.error("Erreur lors du batch de création des classes :", err);
        alert("Une erreur de permissions ou de réseau s’est produite lors du déploiement des classes.");
      }
    }
  };

  const handleChangeClass = (studentId: string, newClassId: string) => {
    if (!canManage) return;
    const newDb = { ...db };
    const studentIndex = newDb.students.findIndex(s => s.id === studentId);
    if (studentIndex >= 0) {
      newDb.students[studentIndex].classId = newClassId;
      safeMergeDB(newDb);
    }
  };

  // Regroupement par Section et Cycle pour l'affichage structuré
  const groupClasses = (classes: ClassSection[]) => {
    const groups: Record<string, ClassSection[]> = {
      'Francophone — Maternelle': [],
      'Francophone — Primaire': [],
      'Francophone — Secondaire': [],
      'Anglophone — Nursery': [],
      'Anglophone — Primary': [],
      'Anglophone — Secondary': []
    };

    classes.forEach(c => {
      const section = (c.type || c.section || 'francophone') === 'francophone' ? 'Francophone' : 'Anglophone';
      const cycle = getCycleLabel(c);
      const cycleKey = section === 'Francophone' 
        ? (cycle === 'Maternelle' ? 'Maternelle' : cycle === 'Primaire' ? 'Primaire' : 'Secondaire')
        : (cycle === 'Maternelle' ? 'Nursery' : cycle === 'Primaire' ? 'Primary' : 'Secondary');

      const groupKey = `${section} — ${cycleKey}`;
      if (groups[groupKey]) {
        groups[groupKey].push(c);
      } else {
        groups['Francophone — Primaire'].push(c);
      }
    });

    return groups;
  };

  const groupedClasses = groupClasses(sortedFilteredClasses);

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>{t('classes', 'Classes & Vue d\'ensemble')}</h1>
        {canManage && (
          <button 
            onClick={handleSyncClasses} 
            style={{ background: 'var(--success)', fontSize: '0.85rem', padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '8px' }}
          >
            Compléter les classes standard
          </button>
        )}
      </div>

      {/* Résumé / Alertes d'état */}
      {isSecretary ? (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          ℹ️ <strong>Information Secrétariat :</strong> Consultez et sélectionnez les classes de l'établissement. Certaines classes doivent être configurées par le directeur ou le fondateur.
        </div>
      ) : (
        (missingLevels.length > 0 || incoherentCycleClasses.length > 0) && (
          <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', color: '#873800', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {missingLevels.length > 0 && (
              <div>⚠️ <strong>Catalogue incomplet :</strong> {missingLevels.length} classe(s) standard manquante(s) dans votre école. Cliquez sur « Compléter les classes standard » pour les ajouter.</div>
            )}
            {incoherentCycleClasses.length > 0 && (
              <div>⚠️ <strong>Anomalie de cycle :</strong> {incoherentCycleClasses.length} classe(s) possède(nt) un cycle incohérent (ex: Class 3-6 classées en secondaire).</div>
            )}
          </div>
        )
      )}

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
            <option value="Maternelle">Maternelle / Nursery</option>
            <option value="Primaire">Primaire / Primary</option>
            <option value="Secondaire">Secondaire / Secondary</option>
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

      {/* Sélecteur de classe par optgroup */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe à détailler :</label>
        <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
          <option value="">-- Choisir une classe ({sortedFilteredClasses.length} disponible(s)) --</option>
          {Object.entries(groupedClasses).map(([groupName, classesInGroup]) => {
            if (classesInGroup.length === 0) return null;
            return (
              <optgroup key={groupName} label={groupName}>
                {classesInGroup.map(c => {
                  const count = db.students.filter(s => s.classId === c.id && String(s.schoolId || '') === currentSchool?.id).length;
                  const statusLabel = c.isActive === false ? ' (Inactive)' : '';
                  const specLabel = c.specialtyId ? ` [${c.specialtyId}]` : '';
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name}{specLabel}{statusLabel} — {count} élève(s)
                    </option>
                  );
                })}
              </optgroup>
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
              {getCycleLabel(currentClass)} — {currentClass.name} <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>({currentClass.type || currentClass.section || 'Général'})</span>
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
                            {sortClasses(schoolClasses.filter(c => c.isActive !== false)).filter(c => (c.type || c.section) === s.section).map(c => (
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
