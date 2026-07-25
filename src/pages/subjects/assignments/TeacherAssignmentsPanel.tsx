import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useClassProgram } from '../../../hooks/useClassProgram';
import { normalizeAcademicYearId } from '../../../utils/academicYear';
import { ClassProgramSelectors } from '../programs/ClassProgramSelectors';
import { getClassTeacherAssignmentSlots, type TeacherAssignmentSlot } from '../../../services/teacherAssignments';
import {
  setPrimaryTeacherAssignment,
  deactivateTeacherAssignment,
  getTeacherAssignmentCandidates,
  type TeacherAssignmentCandidate
} from '../../../services/teacherAssignmentFunctions';
import Modal from '../../../components/Modal';
import { ShieldAlert, AlertTriangle, Check, UserMinus } from 'lucide-react';
import type { Staff } from '../../../types';

export const TeacherAssignmentsPanel: React.FC = () => {
  const { db, currentUser } = useAppContext();

  // Filters state
  const [sectionFilter, setSectionFilter] = useState<'all' | 'francophone' | 'anglophone'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | 'maternelle' | 'primaire' | 'secondaire'>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  // Selected Class info
  const classes = React.useMemo(() => db?.classes || [], [db?.classes]);
  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;

  // School information
  const schoolId = db?.school?.id;
  const rawAcademicYear = db?.school?.academicYear || '';
  const normalizedYear = normalizeAcademicYearId(rawAcademicYear);

  // Hook for class program
  const {
    status: programStatus,
    subjects: publishedSubjects,
    source: programSource
  } = useClassProgram({
    schoolId,
    academicYearId: normalizedYear,
    selectedClass,
    currentRole: currentUser?.role,
    requestedView: 'published'
  });

  // State for assignments, candidates, loading and modals
  const [slots, setSlots] = useState<TeacherAssignmentSlot[]>([]);
  const [candidates, setCandidates] = useState<TeacherAssignmentCandidate[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('');
  const [chosenTeacherStaffId, setChosenTeacherStaffId] = useState<string>('');
  const [deactivationReason, setDeactivationReason] = useState<string>('');
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  // Load slots and candidates
  const loadAssignmentsData = useCallback(async () => {
    if (!schoolId || !normalizedYear || !selectedClassId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [fetchedSlots, candidatesRes] = await Promise.all([
        getClassTeacherAssignmentSlots(schoolId, normalizedYear, selectedClassId),
        getTeacherAssignmentCandidates({ schoolId })
      ]);
      setSlots(fetchedSlots);
      setCandidates(candidatesRes.candidates || []);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg('Erreur lors du chargement des affectations et des candidats.');
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, normalizedYear, selectedClassId]);

  useEffect(() => {
    loadAssignmentsData();
  }, [loadAssignmentsData]);

  // List of active eligible teachers in the school
  const eligibleTeachers = React.useMemo(() => {
    return candidates.filter((c) => c.isEligible);
  }, [candidates]);

  // Handle Tab filter reset
  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    setErrorMsg(null);
  };

  // Open assignment / replacement modal
  const openAssignModal = (subjectId: string, subjectName: string, currentTeacherStaffId?: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedSubjectName(subjectName);
    setChosenTeacherStaffId(currentTeacherStaffId || '');
    setIsAssignModalOpen(true);
  };

  // Open deactivation modal
  const openDeactivateModal = (subjectId: string, subjectName: string) => {
    setSelectedSubjectId(subjectId);
    setSelectedSubjectName(subjectName);
    setDeactivationReason('');
    setIsDeactivateModalOpen(true);
  };

  // Submit setPrimaryTeacherAssignment
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !normalizedYear || !selectedClassId || !selectedSubjectId || !chosenTeacherStaffId) return;

    setActionInProgress(true);
    try {
      await setPrimaryTeacherAssignment({
        schoolId,
        academicYearId: normalizedYear,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        teacherStaffId: chosenTeacherStaffId
      });
      setIsAssignModalOpen(false);
      await loadAssignmentsData();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Erreur lors de l\'affectation.';
      alert(errMessage);
    } finally {
      setActionInProgress(false);
    }
  };

  // Submit deactivateTeacherAssignment
  const handleDeactivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !normalizedYear || !selectedClassId || !selectedSubjectId) return;

    setActionInProgress(true);
    try {
      await deactivateTeacherAssignment({
        schoolId,
        academicYearId: normalizedYear,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        reason: deactivationReason || undefined
      });
      setIsDeactivateModalOpen(false);
      await loadAssignmentsData();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Erreur lors de la désaffectation.';
      alert(errMessage);
    } finally {
      setActionInProgress(false);
    }
  };

  // Check link status for a staff
  const getTeacherLinkStatus = (staffId: string) => {
    const candidate = candidates.find((c) => c.teacherStaffId === staffId);
    return candidate ? candidate.accountStatus : 'unlinked';
  };

  const getTeacherName = (staffId: string) => {
    const candidate = candidates.find((c) => c.teacherStaffId === staffId);
    if (candidate) return candidate.name;
    const teacher = db?.staff?.find((s: Staff) => s.id === staffId);
    return teacher ? teacher.name : 'Enseignant inconnu';
  };

  // Filtered lists
  const publishedActiveSubjects = publishedSubjects.filter((s) => s.isActive !== false);

  const activeSlots = slots.filter((s) => s.isActive === true);

  // Off-program slots: slots that are active but their subjectId doesn't exist in the published active subjects
  const offProgramSlots = activeSlots.filter(
    (slot) => !publishedActiveSubjects.some((subj) => subj.subjectId === slot.subjectId)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Selector Controls */}
      <ClassProgramSelectors
        academicYearLabel={rawAcademicYear}
        sectionFilter={sectionFilter}
        setSectionFilter={setSectionFilter}
        cycleFilter={cycleFilter}
        setCycleFilter={setCycleFilter}
        selectedClassId={selectedClassId}
        setSelectedClassId={handleClassSelect}
        classes={classes}
        technicalSpecialties={db?.technicalSpecialties || []}
        activeSchoolId={schoolId || ''}
      />

      {errorMsg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fee2e2', border: '1px solid #fecaca', padding: '0.75rem 1rem', borderRadius: '8px', color: '#991b1b', fontSize: '0.9rem' }}>
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {!selectedClassId ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
          <ShieldAlert size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <h3>Aucune classe sélectionnée</h3>
          <p style={{ fontSize: '0.9rem' }}>Veuillez sélectionner une classe ci-dessus pour gérer les affectations.</p>
        </div>
      ) : programStatus === 'loading' || isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <p>Chargement des données...</p>
        </div>
      ) : programSource !== 'published' ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', border: '1px dashed var(--border-color)' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 1rem', color: '#eab308' }} />
          <h3>Programme officiel non publié</h3>
          <p style={{ fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto 1rem', color: 'var(--text-muted)' }}>
            Publiez d’abord le programme officiel de cette classe avant d’affecter les enseignants.
          </p>
        </div>
      ) : publishedActiveSubjects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
          <h3>Le programme officiel ne contient aucune matière active</h3>
          <p style={{ fontSize: '0.9rem' }}>Activez ou ajoutez des matières dans l'onglet "Programmes par classe" puis republiez.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Main assignments table */}
          <div className="card" style={{ padding: 0, overflowX: 'auto', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', background: 'rgba(0,0,0,0.015)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matière officielle</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Heures</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coeff</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enseignant principal</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compte</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {publishedActiveSubjects.map((subj) => {
                  const slot = activeSlots.find((s) => s.subjectId === subj.subjectId);
                  const isAssigned = !!slot;

                  let linkStatus = 'unlinked';
                  if (slot) {
                    linkStatus = getTeacherLinkStatus(slot.teacherStaffId);
                  }

                  return (
                    <tr key={subj.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>
                        {subj.subjectNameSnapshot}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {subj.subjectCodeSnapshot ? (
                          <span style={{ background: 'rgba(79, 70, 229, 0.08)', color: 'var(--primary-color)', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                            {subj.subjectCodeSnapshot}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#475569', fontSize: '0.85rem' }}>
                        {subj.weeklyHours !== undefined ? `${subj.weeklyHours}h` : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#475569', fontSize: '0.85rem' }}>
                        {subj.coefficient !== undefined ? subj.coefficient : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {slot ? (
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                            {getTeacherName(slot.teacherStaffId)}
                          </div>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 500 }}>Non affecté</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {slot ? (
                          linkStatus === 'linked' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#ecfdf5', color: '#047857', padding: '0.2rem 0.45rem', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 600 }}>
                              <Check size={12} /> Compte lié
                            </span>
                          ) : linkStatus === 'inactive' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fffbeb', color: '#b45309', padding: '0.2rem 0.45rem', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 600 }}>
                              <AlertTriangle size={12} /> Liaison inactive
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fffbeb', color: '#b45309', padding: '0.2rem 0.45rem', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 600 }}>
                              <AlertTriangle size={12} /> Non lié
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            className="secondary"
                            style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}
                            onClick={() => openAssignModal(subj.subjectId, subj.subjectNameSnapshot, slot?.teacherStaffId)}
                          >
                            {isAssigned ? 'Changer' : 'Affecter'}
                          </button>
                          {isAssigned && (
                            <button
                              className="secondary"
                              style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', color: '#ef4444', borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
                              onClick={() => openDeactivateModal(subj.subjectId, subj.subjectNameSnapshot)}
                              title="Désaffecter"
                            >
                              <UserMinus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Off-program assignments section */}
          {offProgramSlots.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <AlertTriangle size={18} style={{ color: '#eab308' }} />
                <h4 style={{ margin: 0, color: '#854d0e' }}>Affectations hors programme officiel</h4>
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto', borderRadius: '12px', border: '1px solid #fef08a' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #fef08a', textAlign: 'left', background: '#fefcbf' }}>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#854d0e' }}>Subject ID</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#854d0e' }}>Enseignant</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#854d0e' }}>Provenance</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#854d0e', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offProgramSlots.map((slot) => (
                      <tr key={slot.id} style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: '#fffbeb' }}>
                        <td style={{ padding: '0.65rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{slot.subjectId}</td>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{getTeacherName(slot.teacherStaffId)}</td>
                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Rev: {slot.sourcePublishedRevisionId}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                          <button
                            className="secondary"
                            style={{ padding: '0.35rem 0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', color: '#ef4444', borderColor: '#fecaca', backgroundColor: '#fef2f2', marginLeft: 'auto' }}
                            onClick={() => openDeactivateModal(slot.subjectId, slot.subjectId)}
                          >
                            <UserMinus size={14} /> &nbsp; Désaffecter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Assignment & Replacement Modal */}
      <Modal isOpen={isAssignModalOpen} onClose={() => !actionInProgress && setIsAssignModalOpen(false)} title="Affectation d'enseignant">
        <form onSubmit={handleAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '320px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            Matière : <strong>{selectedSubjectName}</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enseignant disponible</label>
            <select
              required
              value={chosenTeacherStaffId}
              onChange={(e) => setChosenTeacherStaffId(e.target.value)}
              style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', width: '100%' }}
            >
              <option value="">-- Choisir un enseignant --</option>
              {eligibleTeachers.map((t) => {
                const isLinked = t.accountStatus === 'linked';
                const statusSuffix = t.operationalStatus ? ` (${t.operationalStatus})` : '';
                return (
                  <option key={t.teacherStaffId} value={t.teacherStaffId}>
                    {t.name} {isLinked ? '✓ Compte lié' : '✗ Pas de compte'}{statusSuffix}
                  </option>
                );
              })}
            </select>
          </div>

          {chosenTeacherStaffId && getTeacherLinkStatus(chosenTeacherStaffId) === 'unlinked' && (
            <div style={{ display: 'flex', gap: '0.5rem', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.75rem', borderRadius: '8px', color: '#b45309', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>
                Cet enseignant n’a pas encore de compte utilisateur lié. Il pourra être affecté, mais il ne pourra pas accéder à son espace enseignant tant que son compte ne sera pas configuré.
              </span>
            </div>
          )}

          {chosenTeacherStaffId && getTeacherLinkStatus(chosenTeacherStaffId) === 'inactive' && (
            <div style={{ display: 'flex', gap: '0.5rem', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.75rem', borderRadius: '8px', color: '#b45309', fontSize: '0.85rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>
                La liaison de cet enseignant est actuellement inactive. Il pourra être affecté, mais il ne pourra pas accéder à son espace enseignant tant que le lien ne sera pas réactivé.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsAssignModalOpen(false)}
              disabled={actionInProgress}
            >
              Annuler
            </button>
            <button type="submit" disabled={actionInProgress || !chosenTeacherStaffId}>
              {actionInProgress ? 'Enregistrement...' : 'Affecter'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Deactivation Modal */}
      <Modal isOpen={isDeactivateModalOpen} onClose={() => !actionInProgress && setIsDeactivateModalOpen(false)} title="Retirer l'enseignant">
        <form onSubmit={handleDeactivateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '320px' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            Voulez-vous désaffecter l'enseignant de la matière <strong>{selectedSubjectName}</strong> ? L'historique complet de cette affectation sera conservé.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Motif du retrait (facultatif)</label>
            <input
              type="text"
              maxLength={500}
              placeholder="Ex: Remplacement temporaire, congé, etc."
              value={deactivationReason}
              onChange={(e) => setDeactivationReason(e.target.value)}
              style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsDeactivateModalOpen(false)}
              disabled={actionInProgress}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: 'white' }}
              disabled={actionInProgress}
            >
              {actionInProgress ? 'En cours...' : 'Désaffecter'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
