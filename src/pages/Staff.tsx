import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Staff, User } from '../types';
import Modal from '../components/Modal';
import { Plus, Edit2, Printer } from 'lucide-react';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import { getEffectiveStaffType, getEffectiveEmploymentStatus, getStaffDisplayName, buildStaffWritePayload } from '../utils/staffHelpers';
import { mutateStaff } from '../services/staffFunctions';
import { linkStaffToUser, unlinkStaffFromUser } from '../services/staffUserLinkFunctions';

type ActiveStaffLink = { linkId: string; userId: string; staffId: string };

const StaffPage: React.FC = () => {
  const { db, updateLocalState, currentSchool, isSchoolSuspended, currentUser } = useAppContext();
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<Partial<Staff>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLinks, setActiveLinks] = useState<Record<string, ActiveStaffLink>>({});
  const [accountCandidates, setAccountCandidates] = useState<User[]>([]);
  const [linkingStaff, setLinkingStaff] = useState<Staff | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const isAllowed = currentUser && ['owner', 'director', 'secretary', 'superAdmin'].includes(currentUser.role);
  const canWrite = Boolean(isAllowed);
  const canManageLinks = Boolean(currentUser && ['owner', 'director', 'superAdmin'].includes(currentUser.role));
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
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visibleStaff = schoolStaff.filter(staff => {
    if (!normalizedSearch) return true;
    return [getStaffDisplayName(staff), getEffectiveStaffType(staff), getEffectiveEmploymentStatus(staff)]
      .some(value => value.toLocaleLowerCase().includes(normalizedSearch));
  });

  useEffect(() => {
    let cancelled = false;
    if (!canManageLinks || !currentSchool?.id) {
      setActiveLinks({});
      setAccountCandidates([]);
      return () => { cancelled = true; };
    }

    const loadLinkState = async () => {
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const [linksSnapshot, usersSnapshot] = await Promise.all([
          getDocs(query(
            collection(firestoreDb, 'staffUserLinkByStaff'),
            where('schoolId', '==', currentSchool.id),
            where('isActive', '==', true),
          )),
          getDocs(query(collection(firestoreDb, 'users'), where('schoolId', '==', currentSchool.id))),
        ]);
        if (cancelled) return;
        const nextLinks: Record<string, ActiveStaffLink> = {};
        linksSnapshot.docs.forEach(document => {
          const value = document.data() as ActiveStaffLink & { isActive?: boolean };
          if (value.isActive === true && value.staffId && value.userId) nextLinks[value.staffId] = value;
        });
        const staffAccountRoles = new Set(['owner', 'director', 'secretary', 'accountant', 'teacher', 'driver']);
        const users = usersSnapshot.docs
          .map(document => ({ id: document.id, ...document.data() }) as User)
          .filter(user => staffAccountRoles.has(user.role)
            && (user.isActive === true || user.active === true || user.status === 'active'));
        setActiveLinks(nextLinks);
        setAccountCandidates(users);
      } catch (error) {
        console.error('État des liaisons Staff indisponible :', error);
        if (!cancelled) {
          setActiveLinks({});
          setAccountCandidates([]);
        }
      }
    };
    void loadLinkState();
    return () => { cancelled = true; };
  }, [canManageLinks, currentSchool?.id]);

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
      const payload = buildStaffWritePayload(currentStaff);
      const fixtureRunId = window.sessionStorage.getItem('ECOSCOLAIRE_STAFF_TEST_RUN_ID');
      if (fixtureRunId) {
        payload.testFixture = true;
        payload.testRunId = fixtureRunId;
      }
      const response = await mutateStaff({
        action: isEdit ? 'UPDATE' : 'CREATE',
        staffId: currentStaff.id,
        schoolId: currentUser?.role === 'superAdmin' ? currentSchool.id : undefined,
        profile: payload,
      });
      const staffId = response.staffId;
      const finalPayload = {
        ...(isEdit ? currentStaff : {}),
        id: staffId,
        schoolId: response.schoolId,
        ...payload,
        employmentStatus: response.employmentStatus as Staff['employmentStatus'],
        isActive: response.isActive,
      };

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
      if (err.code?.includes('permission-denied')) {
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
    if (window.confirm("Désactiver cette fiche Staff ? Cette action ne désactive ni le compte utilisateur ni Firebase Auth ; toute suspension d'accès doit suivre un workflow d'identité séparé.")) {
      setIsDeactivating(true);
      try {
        const response = await mutateStaff({
          action: 'DEACTIVATE',
          staffId: id,
          schoolId: currentUser?.role === 'superAdmin' ? currentSchool?.id : undefined,
        });
        updateLocalState(previous => ({
          staff: previous.staff.map(staff => staff.id === id
            ? { ...staff, employmentStatus: 'inactive', isActive: response.isActive }
            : staff),
        }));
        alert('Le membre du personnel a été désactivé.');
      } catch (error) {
        console.error('Erreur lors de la désactivation du personnel :', error);
        alert('La désactivation n\'a pas pu être confirmée par le serveur.');
      } finally {
        setIsDeactivating(false);
      }
    }
  };

  const handleReactivate = async (id: string) => {
    if (isDeactivating) return;
    setIsDeactivating(true);
    try {
      const response = await mutateStaff({
        action: 'REACTIVATE',
        staffId: id,
        schoolId: currentUser?.role === 'superAdmin' ? currentSchool?.id : undefined,
      });
      updateLocalState(previous => ({
        staff: previous.staff.map(staff => staff.id === id
          ? { ...staff, employmentStatus: 'active', isActive: response.isActive }
          : staff),
      }));
      alert('Le membre du personnel a été réactivé.');
    } catch (error) {
      console.error('Erreur lors de la réactivation du personnel :', error);
      alert('La réactivation n\'a pas pu être confirmée par le serveur.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleLink = async () => {
    if (!linkingStaff || !selectedUserId || linkBusy) return;
    setLinkBusy(true);
    try {
      const result = await linkStaffToUser({
        staffId: linkingStaff.id,
        userId: selectedUserId,
        schoolId: currentUser?.role === 'superAdmin' ? currentSchool?.id : undefined,
      });
      setActiveLinks(previous => ({
        ...previous,
        [linkingStaff.id]: { linkId: result.linkId, userId: result.userId, staffId: result.staffId },
      }));
      setLinkingStaff(null);
      setSelectedUserId('');
      alert(result.alreadyLinked ? 'Cette liaison est déjà active.' : 'Le compte a été lié après confirmation serveur.');
    } catch (error) {
      console.error('Liaison Staff/compte refusée :', error);
      alert('La liaison n\'a pas été appliquée. Vérifiez le compte, l\'école et les conflits existants.');
    } finally {
      setLinkBusy(false);
    }
  };

  const handleUnlink = async (staff: Staff) => {
    const link = activeLinks[staff.id];
    if (!link || linkBusy || !window.confirm('Dissocier le compte sans supprimer la fiche Staff ni le compte utilisateur ?')) return;
    setLinkBusy(true);
    try {
      await unlinkStaffFromUser({
        staffId: staff.id,
        userId: link.userId,
        schoolId: currentUser?.role === 'superAdmin' ? currentSchool?.id : undefined,
        reason: 'Dissociation administrative explicite',
      });
      setActiveLinks(previous => {
        const next = { ...previous };
        delete next[staff.id];
        return next;
      });
      alert('La liaison a été supprimée. La fiche Staff, le profil utilisateur et le compte Auth sont conservés.');
    } catch (error) {
      console.error('Dissociation Staff/compte refusée :', error);
      alert('La dissociation n\'a pas pu être confirmée par le serveur.');
    } finally {
      setLinkBusy(false);
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

        <div className="no-print" style={{ padding: '1rem' }}>
          <label htmlFor="staff-search" style={{ display: 'block', marginBottom: '0.35rem' }}>Rechercher</label>
          <input
            id="staff-search"
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Nom, fonction ou statut"
            style={{ width: '100%', maxWidth: '28rem' }}
          />
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left' }}>{t('name')}</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Fonction</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
              <th style={{ padding: '1rem', textAlign: 'left' }}>Compte</th>
              <th className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleStaff.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun membre du personnel
                </td>
              </tr>
            ) : (
              visibleStaff
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
                      <td style={{ padding: '1rem' }}>
                        {canManageLinks ? (activeLinks[s.id] ? 'Lié' : 'Non lié') : 'Accès restreint'}
                      </td>
                      <td className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>
                        {canWrite && (
                          <>
                            <button data-testid={`edit-btn-${s.id}`} className="secondary" onClick={() => handleOpenModal(s)} style={{ marginRight: '0.5rem' }} disabled={isSchoolSuspended}>
                              <Edit2 size={16} />
                            </button>
                            {status === 'active' ? (
                              <button data-testid={`deact-btn-${s.id}`} className="secondary" onClick={() => handleDeactivate(s.id)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: '0.8rem' }} disabled={isSchoolSuspended || isDeactivating}>
                                Désactiver
                              </button>
                            ) : (
                              <button data-testid={`reactivate-btn-${s.id}`} className="secondary" onClick={() => handleReactivate(s.id)} style={{ fontSize: '0.8rem' }} disabled={isSchoolSuspended || isDeactivating}>
                                Réactiver
                              </button>
                            )}
                            {canManageLinks && status === 'active' && (
                              activeLinks[s.id] ? (
                                <button className="secondary" onClick={() => handleUnlink(s)} style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }} disabled={linkBusy}>
                                  Dissocier
                                </button>
                              ) : (
                                <button className="secondary" onClick={() => { setLinkingStaff(s); setSelectedUserId(''); }} style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }} disabled={linkBusy}>
                                  Lier un compte
                                </button>
                              )
                            )}
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
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Membre du Personnel">
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="staff-last-name">Nom</label>
              <input id="staff-last-name" required value={currentStaff.lastName || ''} onChange={e => setCurrentStaff({...currentStaff, lastName: e.target.value})} />
            </div>
            <div className="form-group">
              <label htmlFor="staff-first-name">Prénom</label>
              <input id="staff-first-name" required value={currentStaff.firstName || ''} onChange={e => setCurrentStaff({...currentStaff, firstName: e.target.value})} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="staff-phone">Téléphone (facultatif)</label>
              <input id="staff-phone" type="tel" value={currentStaff.phone || ''} onChange={e => setCurrentStaff({...currentStaff, phone: e.target.value})} />
            </div>
            <div className="form-group">
              <label htmlFor="staff-email">Email (facultatif)</label>
              <input id="staff-email" type="email" value={currentStaff.email || ''} onChange={e => setCurrentStaff({...currentStaff, email: e.target.value})} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="staff-type">Fonction</label>
              <select id="staff-type" required value={currentStaff.staffType || currentStaff.role || 'teacher'} onChange={e => setCurrentStaff({...currentStaff, staffType: e.target.value as Staff['staffType']})}>
                {staffTypeOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="staff-employment-status">Statut</label>
              <select id="staff-employment-status" required value={currentStaff.employmentStatus || (currentStaff.active !== false ? 'active' : 'inactive')} onChange={e => setCurrentStaff({...currentStaff, employmentStatus: e.target.value as Staff['employmentStatus']})}>
                {employmentStatusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {currentStaff.employmentStatus === 'departed' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label htmlFor="staff-departure-date">Date de départ *</label>
                <input id="staff-departure-date" required type="date" value={currentStaff.departureDate || ''} onChange={e => setCurrentStaff({...currentStaff, departureDate: e.target.value})} />
              </div>
              <div className="form-group">
                <label htmlFor="staff-departure-reason">Raison du départ (facultatif)</label>
                <input id="staff-departure-reason" type="text" value={currentStaff.departureReason || ''} onChange={e => setCurrentStaff({...currentStaff, departureReason: e.target.value})} />
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
      <Modal isOpen={Boolean(linkingStaff)} onClose={() => { if (!linkBusy) setLinkingStaff(null); }} title="Lier un compte utilisateur">
        <p>Action administrative explicite pour {linkingStaff ? getStaffDisplayName(linkingStaff) : ''}. Aucun rapprochement automatique n'est effectué.</p>
        <div className="form-group">
          <label htmlFor="staff-user-link-select">Compte actif de la même école</label>
          <select id="staff-user-link-select" value={selectedUserId} onChange={event => setSelectedUserId(event.target.value)} disabled={linkBusy}>
            <option value="">Sélectionner explicitement un compte</option>
            {accountCandidates
              .filter(user => !Object.values(activeLinks).some(link => link.userId === user.id))
              .map(user => (
                <option key={user.id} value={user.id}>
                  {user.email || user.id} — {user.role}
                </option>
              ))}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button type="button" className="secondary" onClick={() => setLinkingStaff(null)} disabled={linkBusy}>Annuler</button>
          <button type="button" onClick={handleLink} disabled={linkBusy || !selectedUserId}>{linkBusy ? 'Liaison…' : 'Confirmer la liaison'}</button>
        </div>
      </Modal>
    </div>
  );
};

export default StaffPage;
