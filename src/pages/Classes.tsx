import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { sortClasses } from '../utils/sortClasses';

const Classes: React.FC = () => {
  const { db, saveDB, currentUser } = useAppContext();
  const { t } = useI18n();
  
  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const [selectedClass, setSelectedClass] = useState<string>('');

  const currentClass = db.classes.find(c => c.id === selectedClass);
  const teachers = db.staff.filter(s => s.role === 'teacher' && s.assignedClassId === selectedClass);
  const students = db.students.filter(s => s.classId === selectedClass);

  const handleChangeClass = (studentId: string, newClassId: string) => {
    const newDb = { ...db };
    const studentIndex = newDb.students.findIndex(s => s.id === studentId);
    if (studentIndex >= 0) {
      newDb.students[studentIndex].classId = newClassId;
      // Optionnel : maj de la section si necessaire, on assume que ce n'est pas automatique ici.
      saveDB(newDb);
    }
  };

  return (
    <div className="page-container">
       <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <h1>{t('classes', 'Classes & Vue d\'ensemble')}</h1>
         <button onClick={() => {
           import('../db/storage').then(({ defaultDB }) => {
             const missing = defaultDB.classes.filter(defCls => !db.classes.some(c => c.id === defCls.id));
             if (missing.length > 0) {
               saveDB({ ...db, classes: [...db.classes, ...missing] });
               alert(`${missing.length} classes manquantes (ex: Pre-Nursery) ont été rajoutées avec succès !`);
             } else {
               alert("Toutes les classes de base sont déjà présentes.");
             }
           });
         }} style={{ background: 'var(--success)', fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
           Réparer les classes manquantes
         </button>
       </div>
       <div className="card" style={{ marginBottom: '2rem' }}>
         <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe :</label>
         <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">-- Choisir --</option>
            {sortClasses(db.classes).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
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
                           {sortClasses(db.classes).filter(c => c.type === s.section).map(c => (
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
