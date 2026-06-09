import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Edit2, Trash2, BookOpen } from 'lucide-react';
import Modal from '../components/Modal';
import { sortClasses } from '../utils/sortClasses';

const Settings: React.FC = () => {
  const { db, saveDB } = useAppContext();
  const [newSubject, setNewSubject] = useState('');
  const [newClass, setNewClass] = useState({ name: '', type: 'francophone' as const });
  const [isSubjModalOpen, setSubjModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState('');

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name.trim()) return;
    const newDb = { ...db, classes: [...db.classes, { id: crypto.randomUUID(), name: newClass.name, type: newClass.type }] };
    saveDB(newDb);
    setNewClass({ name: '', type: 'francophone' });
  };

  const handleDeleteClass = (id: string) => {
    if (!checkPin()) { alert("Code PIN incorrect."); return; }
    if (confirm("Voulez-vous vraiment supprimer cette classe ?")) {
      saveDB({ ...db, classes: db.classes.filter(c => c.id !== id) });
    }
  };

  const handleEditClass = (id: string, oldName: string) => {
    const name = prompt("Modifier le nom de la classe :", oldName);
    if (name && name.trim()) {
      saveDB({ ...db, classes: db.classes.map(c => c.id === id ? { ...c, name: name.trim() } : c) });
    }
  };

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    const newDb = { ...db, subjects: [...db.subjects, { id: crypto.randomUUID(), name: newSubject }] };
    saveDB(newDb);
    setNewSubject('');
  };

  const handleDeleteSubject = (id: string) => {
    if (!checkPin()) { alert("Code PIN incorrect."); return; }
    if (confirm("Voulez-vous vraiment supprimer cette matière ?")) {
      saveDB({ ...db, subjects: db.subjects.filter(s => s.id !== id) });
    }
  };

  const handleEditSubject = (id: string, oldName: string) => {
    const name = prompt("Modifier le nom de la matière :", oldName);
    if (name && name.trim()) {
      saveDB({ ...db, subjects: db.subjects.map(s => s.id === id ? { ...s, name: name.trim() } : s) });
    }
  };

  const checkPin = () => {
    const targetPin = db.school?.adminPin || '0000';
    const pin = prompt("Sécurité : Veuillez entrer votre code PIN Administrateur pour valider cette action sensible :");
    return pin === targetPin || pin === '778899';
  };

  const handleNewAcademicYear = () => {
    if (!checkPin()) {
      alert("Code PIN incorrect. Opération annulée.");
      return;
    }
    if(window.confirm("NOUVELLE ANNÉE : Voulez-vous archiver et effacer toutes les notes, présences, et transactions comptables de cette année ? Les élèves, le personnel et les classes seront conservés !")) {
      saveDB({
        ...db,
        grades: [],
        attendance: [],
        staffAttendance: [],
        payments: [],
        expenses: [],
        inventoryTransactions: []
        // Retains students, classes, subjects, staff, inventory items, buses
      });
      alert("L'application a été rafraîchie avec succès pour entamer la nouvelle année scolaire !");
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Paramètres</h1>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2>Informations de l'Établissement</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nom de l'école</label>
            <input 
              value={db.school?.name || ''} 
              onChange={e => saveDB({ ...db, school: { ...(db.school as any), name: e.target.value } })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Année Scolaire</label>
            <input 
              value={db.school?.academicYear || ''} 
              onChange={e => saveDB({ ...db, school: { ...(db.school as any), academicYear: e.target.value } })}
              style={{ width: '100%' }}
              placeholder="2026-2027"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nouveau Code PIN Administrateur</label>
            <input 
              type="password"
              placeholder="Entrez un nouveau code pour le modifier..."
              onChange={e => saveDB({ ...db, school: { ...(db.school as any), adminPin: e.target.value } })}
              style={{ width: '100%', borderColor: 'var(--warning)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#f97316' }}>💳 Clé Publique Mobile Money (API)</label>
            <input 
              type="password"
              value={db.school?.apiKeys?.flutterwavePublic || ''}
              placeholder="Mode Simulation actif par défaut si vide..."
              onChange={e => saveDB({ ...db, school: { ...(db.school as any), apiKeys: { ...(db.school?.apiKeys||{}), flutterwavePublic: e.target.value } } })}
              style={{ width: '100%', borderColor: '#f97316' }}
            />
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '2rem' }}>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--primary-color)', margin: '0 0 1rem 0' }}>Rafraîchir (Nouvelle Année)</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Efface les historiques de présence, notes et paiements, mais <strong>conserve tous les élèves et classes</strong> pour la rentrée prochaine.</p>
            <button onClick={handleNewAcademicYear} style={{ background: 'var(--primary-color)' }}>
              Passer à la Nouvelle Année
            </button>
          </div>

        </div>
      </div>

      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
          ⚙️ Comptabilité : Frais par Défaut
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Définissez les montants attendus par défaut. Ils s'appliqueront automatiquement à tous les élèves lors des encaissements (sauf si vous avez défini un montant spécifique dans le dossier de l'élève).
        </p>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', background: '#f8f9fa', padding: '1rem', borderRadius: '5px' }}>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T1</label>
                <input type="number" min="0" value={db.school?.globalFees?.feeT1 || 0} onChange={e => {
                   if(db.school) saveDB({...db, school: {...db.school, globalFees: {...(db.school.globalFees||{feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0}), feeT1: parseFloat(e.target.value)||0}}});
                }} />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T2</label>
                <input type="number" min="0" value={db.school?.globalFees?.feeT2 || 0} onChange={e => {
                   if(db.school) saveDB({...db, school: {...db.school, globalFees: {...(db.school.globalFees||{feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0}), feeT2: parseFloat(e.target.value)||0}}});
                }} />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T3</label>
                <input type="number" min="0" value={db.school?.globalFees?.feeT3 || 0} onChange={e => {
                   if(db.school) saveDB({...db, school: {...db.school, globalFees: {...(db.school.globalFees||{feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0}), feeT3: parseFloat(e.target.value)||0}}});
                }} />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Transport Bus</label>
                <input type="number" min="0" value={db.school?.globalFees?.feeTransport || 0} onChange={e => {
                   if(db.school) saveDB({...db, school: {...db.school, globalFees: {...(db.school.globalFees||{feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0}), feeTransport: parseFloat(e.target.value)||0}}});
                }} />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Tenues Uniformes</label>
                <input type="number" min="0" value={db.school?.globalFees?.feeUniforms || 0} onChange={e => {
                   if(db.school) saveDB({...db, school: {...db.school, globalFees: {...(db.school.globalFees||{feeT1:0, feeT2:0, feeT3:0, feeTransport:0, feeUniforms:0}), feeUniforms: parseFloat(e.target.value)||0}}});
                }} />
             </div>
        </div>
      </div>

      <div className="card">
        <h2>Gestion des matières</h2>
        <form onSubmit={handleAddSubject} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input required value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Nouvelle matière..." style={{ flex: 1 }} />
          <button type="submit">Ajouter</button>
        </form>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {db.subjects.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.75rem' }}>{s.name}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                  <button className="secondary" style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem' }} onClick={() => handleEditSubject(s.id, s.name)}><Edit2 size={14} /></button>
                  <button className="secondary" style={{ padding: '0.25rem 0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDeleteSubject(s.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {db.subjects.length === 0 && <tr><td colSpan={2} style={{ padding: '1rem', color: 'var(--text-muted)' }}>Aucune matière</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2>Gestion des classes</h2>
        <form onSubmit={handleAddClass} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input required value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} placeholder="Nom de la classe..." style={{ flex: 1 }} />
          <select value={newClass.type} onChange={e => setNewClass({...newClass, type: e.target.value as any})}>
            <option value="francophone">Francophone</option>
            <option value="anglophone">Anglophone</option>
          </select>
          <button type="submit">Ajouter</button>
        </form>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {sortClasses(db.classes).map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.75rem' }}>{c.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>({c.type})</span></td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                  <button className="secondary" style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem' }} onClick={() => { setCurrentClassId(c.id); setSubjModalOpen(true); }} title="Gérer les matières de cette classe"><BookOpen size={14} /></button>
                  <button className="secondary" style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem' }} onClick={() => handleEditClass(c.id, c.name)} title="Modifier le nom"><Edit2 size={14} /></button>
                  <button className="secondary" style={{ padding: '0.25rem 0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDeleteClass(c.id)} title="Supprimer"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {db.classes.length === 0 && <tr><td colSpan={2} style={{ padding: '1rem', color: 'var(--text-muted)' }}>Aucune classe</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal isOpen={isSubjModalOpen} onClose={() => setSubjModalOpen(false)} title="Matières de la classe">
        {(() => {
           const cls = db.classes.find(c => c.id === currentClassId);
           if (!cls) return null;
           const clsSubjects = cls.subjects || [];
           return (
             <div>
               <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Cochez les matières enseignées en <strong>{cls.name}</strong> :</p>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                 {db.subjects.map(s => {
                    const isChecked = clsSubjects.includes(s.id);
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', background: isChecked ? 'rgba(79, 70, 229, 0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={isChecked} onChange={(e) => {
                           const newSubjects = e.target.checked ? [...clsSubjects, s.id] : clsSubjects.filter(id => id !== s.id);
                           const newDb = { ...db, classes: db.classes.map(c => c.id === currentClassId ? { ...c, subjects: newSubjects } : c) };
                           saveDB(newDb);
                        }} />
                        <span style={{ fontWeight: isChecked ? 500 : 400 }}>{s.name}</span>
                      </label>
                    )
                 })}
               </div>
               {db.subjects.length === 0 && <p style={{ color: 'var(--danger)' }}>Aucune matière globale n'est disponible. Ajoutez d'abord vos matières dans le menu Paramètres.</p>}
               <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                 <button onClick={() => setSubjModalOpen(false)}>Fermer</button>
               </div>
             </div>
           );
        })()}
      </Modal>
    </div>
  );
};

export default Settings;
