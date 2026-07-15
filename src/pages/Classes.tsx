import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { sortClasses } from '../utils/sortClasses';

const Classes: React.FC = () => {
  const { db, safeMergeDB, currentUser } = useAppContext();
  const { t } = useI18n();
  
  const [selectedClass, setSelectedClass] = useState<string>('');

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const currentClass = db.classes.find(c => c.id === selectedClass);
  const teachers = db.staff.filter(s => s.role === 'teacher' && s.assignedClassId === selectedClass);
  const students = db.students.filter(s => s.classId === selectedClass);

  const handleChangeClass = (studentId: string, newClassId: string) => {
    const newDb = { ...db };
    const studentIndex = newDb.students.findIndex(s => s.id === studentId);
    if (studentIndex >= 0) {
      newDb.students[studentIndex].classId = newClassId;
      // Optionnel : maj de la section si necessaire, on assume que ce n'est pas automatique ici.
      safeMergeDB(newDb);
    }
  };

  return (
    <div className="page-container">
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>{t('classes', 'Classes & Vue d\'ensemble')}</h1>
          <button onClick={() => {
            import('../constants/defaultClasses').then(({ DEFAULT_CLASS_LEVELS }) => {
              const currentSchool = db.school;
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
                
                // Pour ITALO, seules certaines classes sont actives par défaut
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

              // Ajouter uniquement les classes qui n'existent pas encore
              const toAdd = newClasses.filter(newCls => !db.classes.some(c => c.name.toLowerCase() === newCls.name.toLowerCase() && c.type === newCls.type));
              
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
        </div>
       <div className="card" style={{ marginBottom: '2rem' }}>
         <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe :</label>
         <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">-- Choisir --</option>
            {sortClasses(db.classes.filter(c => c.isActive !== false)).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
         </select>
       </div>
       {currentClass && (
         <div className="card">
           <h2 style={{ borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>{currentClass.name} <span style={{fontSize: '0.8em', color: 'var(--text-muted)'}}>({currentClass.type})</span></h2>
           
           <h3 style={{ marginTop: '1.5rem', color: 'var(--primary-color)' }}>Enseignant(s) Titulaire(s)</h3>
           <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '2rem' }}>
             {teachers.length > 0 ? teachers.map(t => <li key={t.id} style={{ padding: '0.25rem 0' }}>{t.name}</li>) : <li style={{ color: 'var(--text-muted)' }}>Aucun enseignant assigné. (Gérer dans Personnel)</li>}
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
                   <th style={{ padding: '0.75rem', textAlign: 'left' }}>Action (Reclasser)</th>
                 </tr>
               </thead>
               <tbody>
                 {students.length === 0 ? (
                   <tr>
                     <td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aucun élève dans cette classe.</td>
                   </tr>
                 ) : (
                   students.map(s => (
                     <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                       <td style={{ padding: '0.75rem' }}>{s.name}</td>
                       <td style={{ padding: '0.75rem' }}>{s.gender}</td>
                       <td style={{ padding: '0.75rem' }}>{s.parentName}</td>
                       <td style={{ padding: '0.75rem' }}>{s.parentPhone || '-'}</td>
                       <td style={{ padding: '0.75rem' }}>{s.address || '-'}</td>
                       <td style={{ padding: '0.75rem' }}>
                         <select 
                           value={s.classId || ''} 
                           onChange={e => handleChangeClass(s.id, e.target.value)}
                           style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                         >
                           {sortClasses(db.classes.filter(c => c.isActive !== false)).filter(c => c.type === s.section).map(c => (
                             <option key={c.id} value={c.id}>{c.name}</option>
                           ))}
                         </select>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>
         </div>
       )}
    </div>
  );
};
export default Classes;
