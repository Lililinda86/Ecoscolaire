import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, ShieldAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import { useAppContext } from '../../../context/AppContext';
import { getSchoolTeacherAssignments, type TeacherAssignment } from '../../../services/teacherAssignments';
import { getTeacherAssignmentCandidates, manageTeacherAssignment, type TeacherAssignmentCandidate, type TeacherAssignmentError } from '../../../services/teacherAssignmentFunctions';
import { getActiveAcademicYearId } from '../../../utils/academicYearDeduplication';
import { getClassOptionLabel } from '../../../utils/classCatalog';

type ModalMode = 'create' | 'edit' | null;
const fieldStyle: React.CSSProperties = { width: '100%', minHeight: 42, padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--card-bg, white)' };

export const TeacherAssignmentsPanel: React.FC = () => {
  const { db, currentUser } = useAppContext();
  const schoolId = db?.school?.id || '';
  const defaultYearId = useMemo(() => getActiveAcademicYearId(db?.academicYears, db?.school) || '', [db?.academicYears, db?.school]);
  const canActivate = ['superAdmin', 'owner', 'director'].includes(currentUser?.role || '');
  const canDraft = canActivate || currentUser?.role === 'secretary';
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [candidates, setCandidates] = useState<TeacherAssignmentCandidate[]>([]);
  const [yearFilter, setYearFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<TeacherAssignment | null>(null);
  const [form, setForm] = useState({ academicYearId: '', classId: '', subjectId: '', teacherStaffId: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!yearFilter && defaultYearId) setYearFilter(defaultYearId); }, [defaultYearId, yearFilter]);
  const reload = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true); setError('');
    try {
      if (currentUser?.role === 'teacher') {
        setAssignments((db?.teacherAssignments || []).map(row => ({
          ...row,
          status: row.status || (row.isActive === true ? 'active' : 'inactive'),
          version: Number(row.version || 1),
        })));
        setCandidates([]);
        return;
      }
      const [rows, people] = await Promise.all([getSchoolTeacherAssignments(schoolId), canDraft ? getTeacherAssignmentCandidates({ schoolId }) : Promise.resolve({ candidates: [] })]);
      setAssignments(rows); setCandidates(people.candidates);
    } catch { setError('Les affectations n’ont pas pu être chargées.'); } finally { setLoading(false); }
  }, [canDraft, currentUser?.role, db?.teacherAssignments, schoolId]);
  useEffect(() => { void reload(); }, [reload]);

  const teacherName = (id: string) => candidates.find(row => row.teacherStaffId === id)?.name || db?.staff?.find(row => row.id === id)?.name || 'Enseignant inconnu';
  const className = (id: string) => { const cls = db?.classes?.find(row => row.id === id); return cls ? getClassOptionLabel(cls, db?.classes || []) : id; };
  const subjectName = (id: string) => db?.subjects?.find(row => row.id === id)?.name || id;
  const yearName = (id: string) => db?.academicYears?.find(row => row.id === id)?.name || id;
  const compatibility = (assignment: TeacherAssignment) => {
    const published = (db?.classPrograms || []).filter(program => program.schoolId === schoolId && program.academicYearId === assignment.academicYearId && program.classId === assignment.classId && program.status === 'published' && Boolean(program.publishedRevisionId));
    if (published.length === 0) return 'PROGRAMME NON PUBLIÉ';
    if (published.length !== 1) return 'PROGRAMME INCOHÉRENT';
    const program = published[0];
    const included = (db?.classSubjects || []).some(row => row.programId === program.id && row.revisionId === program.publishedRevisionId && row.isActive !== false && (row.subjectId === assignment.subjectId || row.catalogSubjectId === assignment.subjectId));
    return included ? 'COMPATIBLE' : 'HORS PROGRAMME';
  };
  const filtered = assignments.filter(row => (!yearFilter || row.academicYearId === yearFilter) && (!classFilter || row.classId === classFilter) && (!teacherFilter || row.teacherStaffId === teacherFilter) && (!subjectFilter || row.subjectId === subjectFilter) && (statusFilter === 'all' || row.status === statusFilter));

  const explain = (caught: unknown) => {
    const code = (caught as TeacherAssignmentError)?.businessCode;
    if (code === 'PROGRAM_NOT_PUBLISHED') return 'PROGRAMME NON PUBLIÉ : le brouillon est conservé, mais son activation est bloquée.';
    if (code === 'SUBJECT_NOT_IN_PUBLISHED_PROGRAM') return 'Cette matière ne figure pas dans le programme publié de la classe.';
    if (code === 'TEACHER_LINK_REQUIRED' || code === 'TEACHER_LINK_INTEGRITY_ERROR') return 'Une liaison Staff ↔ User active et cohérente est requise pour activer.';
    if (code === 'PERMISSION_DENIED' || code === 'SCHOOL_MISMATCH') return 'Vous n’êtes pas autorisé à effectuer cette action.';
    return caught instanceof Error ? caught.message : 'L’opération a échoué.';
  };
  const openCreate = () => { setSelected(null); setForm({ academicYearId: yearFilter || defaultYearId, classId: classFilter, subjectId: subjectFilter, teacherStaffId: teacherFilter, note: '' }); setError(''); setModalMode('create'); };
  const openEdit = (row: TeacherAssignment) => { setSelected(row); setForm({ academicYearId: row.academicYearId, classId: row.classId, subjectId: row.subjectId, teacherStaffId: row.teacherStaffId, note: row.note || '' }); setError(''); setModalMode('edit'); };
  const submitDraft = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try {
      if (modalMode === 'create') await manageTeacherAssignment({ action: 'CREATE_DRAFT', ...form });
      else if (selected) await manageTeacherAssignment({ action: 'UPDATE_DRAFT', assignmentId: selected.id, note: form.note });
      setModalMode(null); await reload();
    } catch (caught) { setError(explain(caught)); } finally { setSaving(false); }
  };
  const activate = async (row: TeacherAssignment) => {
    if (!window.confirm(`Activer l’affectation de ${teacherName(row.teacherStaffId)} ? Elle accordera les droits pédagogiques pour cette classe.`)) return;
    setSaving(true); setError(''); try { await manageTeacherAssignment({ action: 'ACTIVATE', assignmentId: row.id }); await reload(); } catch (caught) { setError(explain(caught)); } finally { setSaving(false); }
  };
  const deactivate = async (row: TeacherAssignment) => {
    if (!window.confirm('Désactiver cette affectation ? Son historique sera conservé et ses nouveaux droits pédagogiques seront retirés.')) return;
    setSaving(true); setError(''); try { await manageTeacherAssignment({ action: 'DEACTIVATE', assignmentId: row.id }); await reload(); } catch (caught) { setError(explain(caught)); } finally { setSaving(false); }
  };

  return <div style={{ display: 'grid', gap: '1rem' }}>
    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
      <div><h2 style={{ margin: 0 }}>Affectations enseignants</h2><p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>Un rôle enseignant ne crée jamais une affectation.</p></div>
      {canDraft && <button onClick={openCreate}><Plus size={16} /> Créer un brouillon</button>}
    </div>
    <div className="card" aria-label="Filtres des affectations" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.65rem' }}>
      <select aria-label="Année scolaire" style={fieldStyle} value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="">Toutes les années</option>{(db?.academicYears || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select aria-label="Classe" style={fieldStyle} value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="">Toutes les classes</option>{(db?.classes || []).map(row => <option key={row.id} value={row.id}>{getClassOptionLabel(row, db?.classes || [])}</option>)}</select>
      <select aria-label="Enseignant" style={fieldStyle} value={teacherFilter} onChange={event => setTeacherFilter(event.target.value)}><option value="">Tous les enseignants</option>{candidates.map(row => <option key={row.teacherStaffId} value={row.teacherStaffId}>{row.name}</option>)}</select>
      <select aria-label="Matière" style={fieldStyle} value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="">Toutes les matières</option>{(db?.subjects || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
      <select aria-label="Statut" style={fieldStyle} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">Tous les statuts</option><option value="draft">DRAFT</option><option value="active">ACTIVE</option><option value="inactive">INACTIVE</option></select>
    </div>
    {error && <div role="alert" style={{ padding: '0.8rem', borderRadius: 8, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca' }}><AlertTriangle size={16} /> {error}</div>}
    {loading ? <div className="card">Chargement…</div> : filtered.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}><ShieldAlert size={40} style={{ opacity: 0.35 }} /><p>Aucune affectation pour ces filtres.</p></div> :
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
        <thead><tr>{['Enseignant', 'Classe', 'Matière', 'Année', 'Statut', 'Programme', 'Actions'].map(label => <th key={label} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>{label}</th>)}</tr></thead>
        <tbody>{filtered.map(row => <tr key={row.id}>
          <td style={{ padding: '0.75rem' }}>{teacherName(row.teacherStaffId)}</td><td style={{ padding: '0.75rem' }}>{className(row.classId)}</td><td style={{ padding: '0.75rem' }}>{subjectName(row.subjectId)}</td><td style={{ padding: '0.75rem' }}>{yearName(row.academicYearId)}</td>
          <td style={{ padding: '0.75rem', fontWeight: 700 }}>{row.status.toUpperCase()}</td><td style={{ padding: '0.75rem', color: compatibility(row) === 'COMPATIBLE' ? '#047857' : '#b45309' }}>{compatibility(row)}</td>
          <td style={{ padding: '0.75rem' }}><div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>{canDraft && row.status === 'draft' && <button className="secondary" disabled={saving} onClick={() => openEdit(row)}>Modifier</button>}{canActivate && row.status === 'draft' && <button disabled={saving} onClick={() => void activate(row)}>Activer</button>}{canActivate && row.status === 'active' && <button className="secondary" disabled={saving} onClick={() => void deactivate(row)}>Désactiver</button>}</div></td>
        </tr>)}</tbody>
      </table></div>}
    <Modal isOpen={modalMode !== null} onClose={() => !saving && setModalMode(null)} title={modalMode === 'create' ? 'Créer une affectation DRAFT' : 'Modifier le brouillon'}>
      <form onSubmit={submitDraft} style={{ display: 'grid', gap: '0.8rem' }}>
        {modalMode === 'create' && <>
          <label>Année scolaire<select required style={fieldStyle} value={form.academicYearId} onChange={event => setForm({ ...form, academicYearId: event.target.value })}><option value="">Sélectionner</option>{(db?.academicYears || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Classe<select required style={fieldStyle} value={form.classId} onChange={event => setForm({ ...form, classId: event.target.value })}><option value="">Sélectionner</option>{(db?.classes || []).map(row => <option key={row.id} value={row.id}>{getClassOptionLabel(row, db?.classes || [])}</option>)}</select></label>
          <label>Matière<select required style={fieldStyle} value={form.subjectId} onChange={event => setForm({ ...form, subjectId: event.target.value })}><option value="">Sélectionner</option>{(db?.subjects || []).filter(row => row.isActive !== false).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Enseignant<select required style={fieldStyle} value={form.teacherStaffId} onChange={event => setForm({ ...form, teacherStaffId: event.target.value })}><option value="">Sélectionner</option>{candidates.filter(row => row.isEligible).map(row => <option key={row.teacherStaffId} value={row.teacherStaffId}>{row.name} · {row.accountStatus === 'linked' ? 'compte lié' : 'DRAFT uniquement'}</option>)}</select></label>
        </>}
        <label>Note administrative<textarea style={{ ...fieldStyle, minHeight: 85 }} maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label>
        <div style={{ padding: '0.65rem', background: '#fffbeb', borderRadius: 8, color: '#92400e' }}>Sans programme publié, le brouillon reste possible. L’activation demeure bloquée.</div>
        {error && <div role="alert" style={{ color: '#991b1b' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}><button type="button" className="secondary" disabled={saving} onClick={() => setModalMode(null)}>Annuler</button><button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer DRAFT'}</button></div>
      </form>
    </Modal>
  </div>;
};
