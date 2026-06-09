import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Staff } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { sortClasses } from '../utils/sortClasses';

const StaffPage: React.FC = () => {
  const { db, saveDB } = useAppContext();
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Partial<Staff>>({});

  const handleOpenModal = (staff?: Staff) => {
    if (staff) setCurrentStaff(staff);
    else setCurrentStaff({ role: 'teacher' });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const newDb = { ...db };
    if (currentStaff.id) {
      newDb.staff = newDb.staff.map(s => s.id === currentStaff.id ? currentStaff as Staff : s);
    } else {
      newDb.staff.push({ ...currentStaff, id: crypto.randomUUID() } as Staff);
    }
    saveDB(newDb);
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm("Voulez-vous vraiment supprimer ce membre du personnel ?")) {
      saveDB({ ...db, staff: db.staff.filter(s => s.id !== id) });
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('staff')}</h1>
        <button onClick={() => handleOpenModal()}>
          <Plus size={18} />
          {t('add', 'Ajouter')}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>{t('name')}</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>{t('role')}</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {db.staff.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Auncun membre du personnel
                </td>
              </tr>
            ) : (
              db.staff.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>{s.name}</td>
                  <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                    {s.role} {s.role === 'teacher' && s.assignedClassId ? ` - ${db.classes.find(c => c.id === s.assignedClassId)?.name || ''}` : ''}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => handleOpenModal(s)} style={{ marginRight: '0.5rem' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="secondary" onClick={() => handleDelete(s.id)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Membre du Personnel">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>{t('name')}</label>
            <input required value={currentStaff.name || ''} onChange={e => setCurrentStaff({...currentStaff, name: e.target.value})} />
          </div>
          <div className="form-group">
            <label>{t('role')}</label>
            <select value={currentStaff.role} onChange={e => setCurrentStaff({...currentStaff, role: e.target.value as any})}>
              <option value="teacher">Enseignant</option>
              <option value="driver">Chauffeur</option>
              <option value="assistant">Assistant</option>
              <option value="director">Directeur</option>
              <option value="secretary">Secrétaire</option>
            </select>
          </div>
          {currentStaff.role === 'teacher' && (
            <div className="form-group">
              <label>Classe assignée</label>
              <select value={currentStaff.assignedClassId || ''} onChange={e => setCurrentStaff({...currentStaff, assignedClassId: e.target.value})}>
                <option value="">-- {t('classes', 'Classes')} --</option>
                {sortClasses(db.classes).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>{t('cancel')}</button>
            <button type="submit">{t('save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StaffPage;
