import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Staff } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Printer } from 'lucide-react';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import { getEffectiveStaffType, getEffectiveEmploymentStatus, getStaffDisplayName, buildStaffWritePayload } from '../utils/staffHelpers';

const StaffPage: React.FC = () => {
  const { db, updateLocalState, safeMergeDB, currentSchool, isSchoolSuspended, currentUser } = useAppContext();
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Partial<Staff>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const isAllowed = currentUser && ['owner', 'director', 'secretary', 'superAdmin', 'boardViewer'].includes(currentUser.role);
  const canWrite = currentUser && currentUser.role !== 'boardViewer';
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

  // Filter staff tightly based on schoolId
  const schoolStaff = db.staff.filter(s => s.schoolId === currentSchool?.id);

  const handleOpenModal = (staff?: Staff) => {
    if (staff) {
      setCurrentStaff({ ...staff });
    } else {
      setCurrentStaff({
        staffType: 'teacher',
        employmentStatus: 'active'
      });
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!currentSchool?.id) return;

    if (!currentSchool) return;

    setIsSubmitting(true);

    try {
      const isEdit = !!currentStaff.id;
      const payload = buildStaffWritePayload(currentStaff, currentSchool, currentUser, isEdit);
      const staffId = currentStaff.id || crypto.randomUUID();
      const finalPayload = { id: staffId, ...payload };

      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      await setDoc(doc(firestoreDb, 'staff', staffId), finalPayload, { merge: true });

      const newDb = { ...db };
      if (isEdit) {
        newDb.staff = newDb.staff.map(s => s.id === staffId ? { ...s, ...finalPayload } as Staff : s);
      } else {
        newDb.staff.push(finalPayload as Staff);
      }
      updateLocalState({ staff: newDb.staff });

      setModalOpen(false);
      alert('Le personnel a été enregistré avec succès.');
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      console.error('Erreur lors de l’enregistrement du personnel :', err);
      if (err.code === 'permission-denied') {
        alert('Enregistrement refusé par les règles de sécurité. La fiche n’a pas été enregistrée.');
      } else {
        alert('Impossible d’enregistrer le membre du personnel dans la base staging.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleDeactivate = async (id: string) => {
    if (isDeactivating) return;
    if (window.confirm("Voulez-vous vraiment désactiver ce membre du personnel ?")) {
      setIsDeactivating(true);
      try {
        const now = new Date().toISOString();
        const newDb = { ...db };
        newDb.staff = newDb.staff.map(s =>
          s.id === id
            ? { ...s, employmentStatus: 'inactive', isActive: false, active: false, status: 'absent', updatedAt: now, updatedBy: currentUser?.id }
            : s
        );
        await Promise.resolve(safeMergeDB(newDb));
      } finally {
        setIsDeactivating(false);
      }
    }
  };

  const staffTypeOptions = [
    { value: 'teacher', label: 'Enseignant' },
    { value: 'director', label: 'Directeur' },
    { value: 'secretary', label: 'Secrétaire' },
    { value: 'accountant', label: 'Comptable' },
    { value: 'supervisor', label: 'Surveillant' },
    { value: 'driver', label: 'Chauffeur' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'other', label: 'Autre' }
  ];

  const employmentStatusOptions = [
    { value: 'active', label: 'Actif' },
    { value: 'inactive', label: 'Inactif' },
    { value: 'suspended', label: 'Suspendu' },
    { value: 'departed', label: 'Parti' }
  ];

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
        <div style={{ display: 'flex', gap: '0.5rem' }} className="no-print">
          <button className="secondary" onClick={() => window.print()} title="Imprimer la liste" disabled={isSchoolSuspended}>
            <Printer size={20} />
          </button>
          {canWrite && (
            <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended}>
              <Plus size={20} style={{ marginRight: '0.5rem' }} />
              {t('add', 'Ajouter')}
            </button>
          )}
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
              <th style={{ padding: '1rem', textAlign: 'left' }}>Fonction</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
              <th className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {schoolStaff.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun membre du personnel
                </td>
              </tr>
            ) : (
              schoolStaff
                .sort((a, b) => getStaffDisplayName(a).localeCompare(getStaffDisplayName(b)))
                .map(s => {
                  const displayName = getStaffDisplayName(s);
                  const type = getEffectiveStaffType(s);
                  const status = getEffectiveEmploymentStatus(s);

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: status === 'active' ? 1 : 0.6 }}>
                      <td style={{ padding: '1rem' }}>{displayName}</td>
                      <td style={{ padding: '1rem', textTransform: 'capitalize' }}>
                        {staffTypeOptions.find(opt => opt.value === type)?.label || type}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {employmentStatusOptions.find(opt => opt.value === status)?.label || status}
                      </td>
                      <td className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>
                        {canWrite && (
                          <>
                            <button data-testid={`edit-btn-${s.id}`} className="secondary" onClick={() => handleOpenModal(s)} style={{ marginRight: '0.5rem' }} disabled={isSchoolSuspended}>
                              <Edit2 size={16} />
                            </button>
                            <button data-testid={`deact-btn-${s.id}`} className="secondary" onClick={() => handleDeactivate(s.id)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.8rem' }} disabled={isSchoolSuspended || status !== 'active' || isDeactivating}>
                              Désactiver
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Membre du Personnel">
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Nom</label>
              <input required value={currentStaff.lastName || ''} onChange={e => setCurrentStaff({...currentStaff, lastName: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Prénom</label>
              <input required value={currentStaff.firstName || ''} onChange={e => setCurrentStaff({...currentStaff, firstName: e.target.value})} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Téléphone (facultatif)</label>
              <input type="tel" value={currentStaff.phone || ''} onChange={e => setCurrentStaff({...currentStaff, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Email (facultatif)</label>
              <input type="email" value={currentStaff.email || ''} onChange={e => setCurrentStaff({...currentStaff, email: e.target.value})} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label>Fonction</label>
              <select required value={currentStaff.staffType || currentStaff.role || 'teacher'} onChange={e => setCurrentStaff({...currentStaff, staffType: e.target.value as Staff['staffType']})}>
                {staffTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Statut</label>
              <select required value={currentStaff.employmentStatus || (currentStaff.active !== false ? 'active' : 'inactive')} onChange={e => setCurrentStaff({...currentStaff, employmentStatus: e.target.value as Staff['employmentStatus']})}>
                {employmentStatusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {currentStaff.employmentStatus === 'departed' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label>Date de départ *</label>
                <input required type="date" value={currentStaff.departureDate || ''} onChange={e => setCurrentStaff({...currentStaff, departureDate: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Raison du départ (facultatif)</label>
                <input type="text" value={currentStaff.departureReason || ''} onChange={e => setCurrentStaff({...currentStaff, departureReason: e.target.value})} />
              </div>
            </div>
          )}

          {currentStaff.staffType !== 'teacher' && (
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <input
                type="checkbox"
                id="teachingEnabled"
                checked={currentStaff.teachingEnabled || false}
                onChange={e => setCurrentStaff({...currentStaff, teachingEnabled: e.target.checked})}
              />
              <label htmlFor="teachingEnabled" style={{ marginBottom: 0 }}>Autoriser l'enseignement pour ce membre</label>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)} disabled={isSubmitting}>{t('cancel')}</button>
            <button type="submit" disabled={isSubmitting}>{t('save')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StaffPage;
