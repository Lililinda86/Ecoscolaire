import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Staff } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Trash2, Printer } from 'lucide-react';
import { sortClasses } from '../utils/sortClasses';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';

const StaffPage: React.FC = () => {
  const { db, saveDB, currentSchool, isSchoolSuspended, currentUser } = useAppContext();
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Partial<Staff>>({});

  const isAllowed = currentUser && ['owner', 'director', 'secretary', 'superAdmin'].includes(currentUser.role);
  if (!isAllowed) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#991b1b' }}>
        <h2>Accès refusé</h2>
        <p>Vous n'avez pas les autorisations nécessaires pour voir cette page.</p>
        <button onClick={() => window.history.back()} style={{ marginTop: '1rem', padding: '0.75rem', background: '#dc2626', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
          Retour
        </button>
      </div>
    );
  }

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
    <div className="page-container" id="staff-page">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; padding: 2rem; background: #fff !important; }
            .no-print { display: none !important; }
            .sidebar { display: none !important; }
            .card { border: none !important; box-shadow: none !important; }
          }
        `}
      </style>
      <div className="page-header no-print">
        <h1>{t('staff')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={18} /> Imprimer la liste
          </button>
          <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended}>
            <Plus size={18} />
            {t('add', 'Ajouter')}
          </button>
        </div>
      </div>

      <div className="card print-area" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '2rem 2rem 0 2rem', display: 'none' }} className="print-area-header">
           <SchoolDocumentHeader school={currentSchool} documentTitle="Liste du Personnel" />
        </div>
        <style>{`@media print { .print-area-header { display: block !important; } }`}</style>
        
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>{t('name')}</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>{t('role')}</th>
              <th className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
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
                  <td className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>
                    <button className="secondary" onClick={() => handleOpenModal(s)} style={{ marginRight: '0.5rem' }} disabled={isSchoolSuspended}>
                      <Edit2 size={16} />
                    </button>
                    <button className="secondary" onClick={() => handleDelete(s.id)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={isSchoolSuspended}>
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
