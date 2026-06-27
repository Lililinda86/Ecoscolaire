import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { Plus, Edit2, Trash2, HeartPulse, FileSpreadsheet, Printer, Send, Copy } from 'lucide-react';
import type { Student, SectionType } from '../types';
import Modal from '../components/Modal';
import { sortClasses } from '../utils/sortClasses';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import * as XLSX from 'xlsx';
import { getStudentLimit, isStudentLimitReached, getStudentLimitLabel } from '../utils/saas';
import { normalizeParentEmails } from '../utils/emailHelpers';
import { db as firestoreDb } from '../db/firebase';
import { doc, setDoc, updateDoc, Timestamp, runTransaction } from 'firebase/firestore';

const Students: React.FC = () => {
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [, setRefresh] = useState(0);
  const { db, saveDB, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();
  
  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const currentCountDisplay = currentSchool?.studentCount ?? db.students.length;
  const limitReached = isStudentLimitReached(currentSchool, currentCountDisplay);
  const limitLabel = getStudentLimitLabel(currentSchool, currentCountDisplay);
  const [currentStudent, setCurrentStudent] = useState<Partial<Student>>({ gender: 'M', section: 'francophone', classId: '' });
  const [parentEmailsInput, setParentEmailsInput] = useState('');
  
  const [inviteModalStudent, setInviteModalStudent] = useState<Student | null>(null);
  const [inviteEmailTarget, setInviteEmailTarget] = useState<string>('');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string>('');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [importSection, setImportSection] = useState<SectionType>('francophone');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [previewStudents, setPreviewStudents] = useState<Student[] | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  // Derive a sorted list once for mapping
  const sortedClasses = sortClasses(db.classes);

  const filteredStudents = db.students.filter(student => {
    const matchSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSection = sectionFilter === 'all' || student.section === sectionFilter;
    const matchClass = classFilter === 'all' || student.classId === classFilter;
    return matchSearch && matchSection && matchClass;
  });

  const handleOpenModal = (student?: Student) => {
    if (student) {
      setIsEditing(true);
      setCurrentStudent(student);
      setParentEmailsInput((student.parentEmails || []).join(', '));
    } else {
      setCurrentStudent({ id: crypto.randomUUID(), name: '', gender: 'M', dob: '', section: 'francophone', parentName: '', classId: '' });
      setIsEditing(false);
      setParentEmailsInput('');
    }
    setModalOpen(true);
  };

  const handleOpenInviteModal = (student: Student) => {
    setInviteModalStudent(student);
    if (student.parentEmails && student.parentEmails.length > 0) {
      setInviteEmailTarget(student.parentEmails[0]);
    } else {
      setInviteEmailTarget('');
    }
    setGeneratedInviteLink('');
  };

  const generateInviteLink = async () => {
    if (!inviteModalStudent || !inviteEmailTarget) return;
    if (!currentSchool) return;

    try {
      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const invitation = {
        id: inviteId,
        schoolId: currentSchool.id,
        studentId: inviteModalStudent.id,
        parentEmail: inviteEmailTarget,
        parentEmailLower: inviteEmailTarget.toLowerCase().trim(),
        parentName: inviteModalStudent.parentName || 'Parent',
        studentName: inviteModalStudent.name,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // +30 jours
        createdBy: currentUser?.id || 'system'
      };

      await setDoc(doc(firestoreDb, 'parent_invitations', inviteId), invitation);
      
      const link = `${window.location.origin}/#/parent-signup?inviteId=${inviteId}`;
      setGeneratedInviteLink(link);
      logAuditAction({
        action: 'STUDENT_INVITE_GENERATED',
        targetType: 'STUDENT',
        targetId: inviteModalStudent.id,
        targetName: inviteModalStudent.name,
        details: { inviteId }
      });
    } catch (error: any) {
      alert("Erreur lors de la génération de l'invitation : " + error.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    
    if (!currentStudent.classId) {
      alert("Veuillez choisir une classe !");
      return;
    }

    setIsSaving(true);
    try {
      const normalizedEmails = normalizeParentEmails(parentEmailsInput);
      const finalStudent = { ...currentStudent, parentEmails: normalizedEmails } as Student;
      if (!finalStudent.schoolId && currentSchool) {
        finalStudent.schoolId = currentSchool.id;
      }

      if (isEditing && finalStudent.id) {
        const studentRef = doc(firestoreDb, 'students', finalStudent.id);
        const rawPatchData = {
          matricule: finalStudent.matricule,
          name: finalStudent.name,
          gender: finalStudent.gender,
          dob: finalStudent.dob,
          section: finalStudent.section,
          classId: finalStudent.classId,
          parentName: finalStudent.parentName,
          parentEmails: finalStudent.parentEmails,
          parentPhone: finalStudent.parentPhone,
          feeT1: finalStudent.feeT1,
          feeT2: finalStudent.feeT2,
          feeT3: finalStudent.feeT3,
          feeTransport: finalStudent.feeTransport,
          feeUniforms: finalStudent.feeUniforms,
          address: finalStudent.address,
          emergencyContact: finalStudent.emergencyContact,
          allergies: finalStudent.allergies,
          medicalConditions: finalStudent.medicalConditions,
        };
        const patchData = Object.fromEntries(Object.entries(rawPatchData).filter(([_, v]) => v !== undefined));
        await updateDoc(studentRef, patchData);
        
        // Mutate local state for UI update
        const idx = db.students.findIndex(s => s.id === finalStudent.id);
        if (idx !== -1) db.students[idx] = finalStudent;
        
      } else {
        if (!currentSchool) throw new Error("École non définie.");
        const studentId = finalStudent.id || crypto.randomUUID();
        finalStudent.id = studentId;
        const studentRef = doc(firestoreDb, 'students', studentId);
        const schoolRef = doc(firestoreDb, 'schools', currentSchool.id);
        
        await runTransaction(firestoreDb, async (transaction) => {
          const schoolDoc = await transaction.get(schoolRef);
          if (!schoolDoc.exists()) {
            throw new Error("NOT_FOUND_SCHOOL");
          }
          
          const schoolData = schoolDoc.data();
          const currentCount = schoolData.studentCount || 0;
          const limit = getStudentLimit(schoolData as any);
          
          if (currentCount >= limit) {
            throw new Error("QUOTA_EXCEEDED");
          }
          
          const studentDoc = await transaction.get(studentRef);
          if (studentDoc.exists()) {
            throw new Error("ALREADY_EXISTS");
          }
          
          transaction.set(studentRef, finalStudent);
          transaction.update(schoolRef, { studentCount: currentCount + 1 });
        });
        
        // Mutate local state
        db.students.push(finalStudent);
        currentSchool.studentCount = (currentSchool.studentCount || 0) + 1;
      }

      setRefresh(r => r + 1);
      setModalOpen(false);

      logAuditAction({
        action: isEditing ? 'UPDATE_STUDENT' : 'CREATE_STUDENT',
        targetType: 'STUDENT',
        targetId: finalStudent.id as string,
        targetName: finalStudent.name as string
      });
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        alert("Action refusée : La limite de votre abonnement SaaS est atteinte. Veuillez passer au plan supérieur.");
      } else if (err.message === 'ALREADY_EXISTS') {
        alert("Erreur métier : Cet élève existe déjà ou une requête concurrente a réussi.");
      } else if (err.code === 'permission-denied') {
        alert("Action refusée : Vous n'avez pas les droits nécessaires pour effectuer cette action.");
      } else if (err.code === 'unavailable' || !navigator.onLine) {
        alert("Erreur réseau : Impossible de vérifier le quota hors ligne. Veuillez vous reconnecter.");
      } else if (err.code === 'aborted') {
        alert("Erreur de concurrence : La transaction a été interrompue. Veuillez réessayer.");
      } else {
        alert("Erreur lors de l'enregistrement : " + err.message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!currentUser || !currentSchool) return;
    
    if (confirm(t('delete') + ' cet élève ?')) {
      const canDeleteDirectly = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
      
      try {
        if (canDeleteDirectly) {
          const studentRef = doc(firestoreDb, 'students', student.id);
          const schoolRef = doc(firestoreDb, 'schools', currentSchool.id);
          
          await runTransaction(firestoreDb, async (transaction) => {
            const studentDoc = await transaction.get(studentRef);
            if (!studentDoc.exists()) {
               throw new Error("NOT_FOUND");
            }
            
            const schoolDoc = await transaction.get(schoolRef);
            if (!schoolDoc.exists()) throw new Error("NOT_FOUND_SCHOOL");
            
            const schoolData = schoolDoc.data();
            const currentCount = schoolData.studentCount || 0;
            const newCount = Math.max(0, currentCount - 1);
            
            transaction.delete(studentRef);
            transaction.update(schoolRef, { studentCount: newCount });
          });
          
          // Mutate local state
          const idx = db.students.findIndex(s => s.id === student.id);
          if (idx !== -1) db.students.splice(idx, 1);
          currentSchool.studentCount = Math.max(0, (currentSchool.studentCount || 0) - 1);
          setRefresh(r => r + 1);
          
          alert("Élève supprimé avec succès.");
          logAuditAction({
            action: 'DELETE_STUDENT',
            targetType: 'STUDENT',
            targetId: student.id,
            targetName: student.name
          });
        } else {
          // Créer une requête de validation
          const requestId = crypto.randomUUID();
          const reqData = {
            id: requestId,
            schoolId: currentSchool.id,
            requesterId: currentUser.id,
            requesterRole: currentUser.role,
            actionType: 'DELETE_STUDENT' as const,
            targetCollection: 'students',
            targetDocumentId: student.id,
            proposedData: student,
            status: 'pending' as const,
            createdAt: new Date().toISOString()
          };
          
          await setDoc(doc(firestoreDb, 'validation_requests', requestId), reqData);
          
          if (!db.validation_requests) db.validation_requests = [];
          db.validation_requests.push(reqData);
          setRefresh(r => r + 1);
          
          alert("Demande de suppression envoyée pour validation (Directeur / Super Admin).");
        }
      } catch (err: any) {
        if (err.message === 'NOT_FOUND') {
          alert("Erreur métier : Cet élève n'existe pas ou a déjà été supprimé.");
        } else if (err.code === 'permission-denied') {
          alert("Action refusée : Vous n'avez pas les droits nécessaires pour effectuer cette action.");
        } else if (err.code === 'unavailable' || !navigator.onLine) {
          alert("Erreur réseau : Impossible d'effectuer l'action hors ligne. Veuillez vous reconnecter.");
        } else if (err.code === 'aborted') {
          alert("Erreur de concurrence : La transaction a été interrompue. Veuillez réessayer.");
        } else {
          alert("Erreur lors de la suppression : " + err.message);
        }
      }
    }
  };

  const handleDeleteAll = () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer TOUS les élèves de la base de données ? Cette action est irréversible.')) {
      const newDb = { ...db, students: [] };
      saveDB(newDb);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      alert("Veuillez choisir un fichier Excel.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        let headerRowIndex = -1;
        let headers: string[] = [];

        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          const hasName = row.some(cell => {
            const val = String(cell).toUpperCase().trim();
            return val.includes('NOM') || val.includes('PRENOM') || val.includes('MATRICULE') || val.includes('CLASSE');
          });
          if (hasName) {
            headerRowIndex = i;
            headers = row.map(c => String(c).trim());
            break;
          }
        }

        if (headerRowIndex === -1) {
          alert("En-têtes introuvables. Le tableau doit contenir une colonne 'NOM' ou 'MATRICULE'.");
          return;
        }

        interface PreviewStudent extends Student {
          rawClassName: string;
          detectedClassName: string;
        }
        const newStudents: PreviewStudent[] = [];

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const rawRow = rawRows[i];
          const row: any = {};
          headers.forEach((h, index) => {
            row[h] = rawRow[index];
          });

          // Fuzzy search function
          const getVal = (keywords: string[]) => {
            for (const key of Object.keys(row)) {
              const upperKey = key.toUpperCase();
              if (keywords.some(kw => upperKey.includes(kw))) {
                if (row[key] !== undefined && row[key] !== '') {
                  return String(row[key]).trim();
                }
              }
            }
            return '';
          };

          const fullName = getVal(['NOMS ET PRENOMS', 'NOM ET PRENOM']) || getVal(['NOM']) || getVal(['PRENOM']);
          if (!fullName) continue; // Skip empty rows

          const classeNameRaw = getVal(['CLASSE']);
          const matricule = getVal(['MATRICULE']);
          
          const parentEmailsStr = getVal(['EMAIL PARENT', 'EMAILS PARENTS', 'EMAIL PARENT 1', 'EMAILPARENT', 'PARENT EMAIL', 'EMAIL']);
          const normalizedEmails = normalizeParentEmails(parentEmailsStr);
          
          let classId = '';
          let finalSection: 'francophone' | 'anglophone' | '' = '';
          let detectedClassName = '';

          if (classeNameRaw) {
            const normalizeClassName = (raw: string) => {
              const name = raw.toUpperCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime les accents
                .replace(/[._-]/g, ' ') // Remplacer par des espaces
                .replace(/\s+/g, ' ') // Espaces multiples
                .trim();
                
              // Mapping Anglophone
              if (['PRE NURSERY'].includes(name)) return { name: 'Pre-Nursery', type: 'anglophone' as const };
              if (name === 'NURSERY 1') return { name: 'Nursery 1', type: 'anglophone' as const };
              if (name === 'NURSERY 2') return { name: 'Nursery 2', type: 'anglophone' as const };
              if (name === 'NURSERY 3') return { name: 'Nursery 3', type: 'anglophone' as const };
              if (name === 'CLASS 1') return { name: 'Class 1', type: 'anglophone' as const };
              if (name === 'CLASS 2') return { name: 'Class 2', type: 'anglophone' as const };
              if (name === 'CLASS 3') return { name: 'Class 3', type: 'anglophone' as const };
              if (name === 'CLASS 4') return { name: 'Class 4', type: 'anglophone' as const };
              if (name === 'CLASS 5') return { name: 'Class 5', type: 'anglophone' as const };
              if (name === 'CLASS 6') return { name: 'Class 6', type: 'anglophone' as const };
              
              // Mapping Francophone
              if (['PRE MATER', 'PRE MATERNELLE'].includes(name)) return { name: 'Pré-maternelle', type: 'francophone' as const };
              if (['PTTE SECTION', 'PETITE SECTION', 'PTE SECTION', 'MATERNELLE 1'].includes(name)) return { name: 'Maternelle 1', type: 'francophone' as const };
              if (['MOY SECTION', 'MOYENNE SECTION', 'MATERNELLE 2'].includes(name)) return { name: 'Maternelle 2', type: 'francophone' as const };
              if (['GRD SECTION', 'GRANDE SECTION', 'MATERNELLE 3'].includes(name)) return { name: 'Maternelle 3', type: 'francophone' as const };
              
              if (name === 'SIL') return { name: 'SIL', type: 'francophone' as const };
              if (name === 'CP') return { name: 'CP', type: 'francophone' as const };
              if (name === 'CE1') return { name: 'CE1', type: 'francophone' as const };
              if (name === 'CE2') return { name: 'CE2', type: 'francophone' as const };
              if (name === 'CM1') return { name: 'CM1', type: 'francophone' as const };
              if (name === 'CM2') return { name: 'CM2', type: 'francophone' as const };
              
              return null;
            };

            const mapping = normalizeClassName(classeNameRaw);
            
            if (mapping) {
              const matchingClasses = db.classes.filter(c => c.name.toLowerCase() === mapping.name.toLowerCase() && c.type === mapping.type);
              if (matchingClasses.length > 0) {
                classId = matchingClasses[0].id;
                finalSection = matchingClasses[0].type;
                detectedClassName = matchingClasses[0].name;
              }
            }
          }

          newStudents.push({
            id: crypto.randomUUID(),
            matricule: matricule || '-',
            name: fullName,
            gender: getVal(['SEXE', 'GENRE']).toUpperCase().startsWith('F') ? 'F' : 'M',
            dob: getVal(['DATE DE NAISSANCE', 'DATE', 'DOB']),
            section: finalSection || importSection,
            classId: classId,
            parentName: getVal(['TUTEUR', 'PARENT', 'NOMS DES PARENTS']) || 'Inconnu',
            parentPhone: getVal(['CONTACT', 'TÉLÉPHONE', 'TELEPHONE', 'TEL']) || '',
            address: getVal(['ADRESSE', 'QUARTIER']) || '',
            feeT1: 0, feeT2: 0, feeT3: 0, feeTransport: 0, feeUniforms: 0,
            rawClassName: classeNameRaw,
            detectedClassName: detectedClassName,
            parentEmails: normalizedEmails
          });
        }

        if (newStudents.length === 0) {
          alert("Aucun élève valide trouvé dans le fichier.");
          return;
        }

        setPreviewStudents(newStudents);
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la lecture du fichier Excel.");
      }
    };
    reader.readAsBinaryString(excelFile);
  };

  const handleConfirmImport = () => {
    if (previewStudents) {
      // SaaS Limit Check for import
      const remainingSlots = getStudentLimit(currentSchool) - db.students.length;
      if (previewStudents.length > remainingSlots) {
        alert(`L'import dépasse votre limite SaaS. Places restantes : ${remainingSlots}. Éditez votre fichier pour ne pas dépasser la limite.`);
        return;
      }

      const hasUnrecognizedClasses = previewStudents.some(s => !s.classId);
      if (hasUnrecognizedClasses) {
        const confirm = window.confirm("Attention : Certaines classes n'ont pas été reconnues et seront enregistrées comme 'À définir'. Voulez-vous quand même continuer l'importation ?");
        if (!confirm) return;
      }
      saveDB({ ...db, students: [...db.students, ...previewStudents] });
      setPreviewStudents(null);
      setImportModalOpen(false);
      setExcelFile(null);
    }
  };

  return (
    <div className="page-container" id="students-page">
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0 }}>{t('students', 'Élèves')}</h1>
          <div style={{ padding: '0.4rem 0.8rem', background: limitReached ? '#fee2e2' : '#eef2ff', color: limitReached ? '#dc2626' : '#4338ca', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
            Capacité SaaS : {limitLabel} (Synchronisé avec le serveur)
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={18} /> Imprimer la liste
          </button>
          <button className="secondary" onClick={handleDeleteAll} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={isSchoolSuspended}>
            <Trash2 size={18} /> Vider la liste
          </button>
          <button className="secondary" onClick={() => setImportModalOpen(true)} disabled={isSchoolSuspended}>
            <FileSpreadsheet size={18} /> Importer Excel
          </button>
          <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended}>
            <Plus size={18} /> {t('add', 'Ajouter')}
          </button>
        </div>
      </div>

      <div className="card print-area" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '2rem 2rem 0 2rem', display: 'none' }} className="print-area-header">
           <SchoolDocumentHeader school={currentSchool} documentTitle="Liste des Élèves" />
        </div>
        <style>{`@media print { .print-area-header { display: block !important; } }`}</style>
        
        <div className="no-print" style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: '#f8f9fa' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Rechercher un élève..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ minWidth: '250px', flex: 1 }}
            />
            <select value={sectionFilter} onChange={e => {setSectionFilter(e.target.value); setClassFilter('all');}}>
              <option value="all">Toutes les sections</option>
              <option value="francophone">Francophone</option>
              <option value="anglophone">Anglophone</option>
            </select>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="all">Toutes les classes</option>
              {db.classes.filter(c => sectionFilter === 'all' || c.type === sectionFilter).map(c => (
                 <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Matricule</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>{t('name', 'Nom')}</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Classe (Section)</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>{t('parent_name', 'Tuteur / Parent')}</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Contact</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>Adresse</th>
                <th className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Aucun élève trouvé
                  </td>
                </tr>
              ) : (
                filteredStudents.map(student => (
                  <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{student.matricule || '-'}</td>
                    <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {student.name}
                      {(student.allergies || student.medicalConditions) && (
                        <span title={`Santé: ${student.allergies ? 'Allergies ' : ''}${student.medicalConditions ? 'Conditions Médicales' : ''}`}>
                          <HeartPulse size={16} color="#dc2626" />
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {db.classes.find(c => c.id === student.classId)?.name || '-'} <span style={{fontSize: '0.85em', color: 'var(--text-muted)'}}>({student.section})</span>
                    </td>
                    <td style={{ padding: '1rem' }}>{student.parentName}</td>
                    <td style={{ padding: '1rem' }}>{student.parentPhone || '-'}</td>
                    <td style={{ padding: '1rem' }}>{student.address || '-'}</td>
                    <td className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>
                      <button className="secondary" onClick={() => handleOpenInviteModal(student)} style={{ marginRight: '0.5rem', color: 'var(--primary)' }} title="Inviter le parent" disabled={isSchoolSuspended}>
                        <Send size={16} />
                      </button>
                      <button className="secondary" onClick={() => handleOpenModal(student)} style={{ marginRight: '0.5rem' }} title="Modifier" disabled={isSchoolSuspended}>
                        <Edit2 size={16} />
                      </button>
                      <button className="secondary" onClick={() => handleDelete(student)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Supprimer (Soumis à validation)" disabled={isSchoolSuspended}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title={isEditing ? t('edit', 'Modifier') : t('add', 'Ajouter')}>
        <form onSubmit={handleSave}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Matricule</label>
              <input value={currentStudent.matricule || ''} onChange={e => setCurrentStudent({...currentStudent, matricule: e.target.value})} placeholder="Ex: MAT-001" />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>{t('name', 'Nom complet')}</label>
              <input required value={currentStudent.name || ''} onChange={e => setCurrentStudent({...currentStudent, name: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Sexe</label>
              <select value={currentStudent.gender} onChange={e => setCurrentStudent({...currentStudent, gender: e.target.value as 'M'|'F'})}>
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date de Naissance</label>
              <input type="date" required value={currentStudent.dob || ''} onChange={e => setCurrentStudent({...currentStudent, dob: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>{t('section', 'Section')}</label>
              <select 
                value={currentStudent.section} 
                onChange={e => setCurrentStudent({...currentStudent, section: e.target.value as SectionType, classId: ''})}
              >
                <option value="francophone">Francophone</option>
                <option value="anglophone">Anglophone</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Classe</label>
              <select 
                required
                value={currentStudent.classId || ''} 
                onChange={e => setCurrentStudent({...currentStudent, classId: e.target.value})}
              >
                <option value="">-- Choisir une classe --</option>
                  {sortedClasses.filter(c => c.type === currentStudent.section).map(c => (
                    <option key={c.id} value={c.id}>{c.name.replace(/m[èe]re/gi, 'Maternelle')}</option>
                  ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>{t('parent_name', 'Nom du Tuteur / Parent')}</label>
              <input required value={currentStudent.parentName || ''} onChange={e => setCurrentStudent({...currentStudent, parentName: e.target.value})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Emails des parents/tuteurs</label>
              <input 
                value={parentEmailsInput} 
                onChange={e => setParentEmailsInput(e.target.value)} 
                placeholder="email1@test.com, email2@test.com" 
              />
              <small style={{ color: 'var(--text-muted)' }}>Séparés par des virgules. Lie automatiquement l'élève au portail Parent.</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Contact (Téléphone)</label>
              <input value={currentStudent.parentPhone || ''} onChange={e => setCurrentStudent({...currentStudent, parentPhone: e.target.value})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Scolarité Tranche 1 (FCFA)</label>
              <input type="number" min="0" step="1" value={currentStudent.feeT1 ?? ''} onChange={e => setCurrentStudent({...currentStudent, feeT1: parseInt(e.target.value) || 0})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Scolarité Tranche 2 (FCFA)</label>
              <input type="number" min="0" step="1" value={currentStudent.feeT2 ?? ''} onChange={e => setCurrentStudent({...currentStudent, feeT2: parseInt(e.target.value) || 0})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Scolarité Tranche 3 (FCFA)</label>
              <input type="number" min="0" step="1" value={currentStudent.feeT3 ?? ''} onChange={e => setCurrentStudent({...currentStudent, feeT3: parseInt(e.target.value) || 0})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Frais de Transport (Annuel)</label>
              <input type="number" min="0" step="1" value={currentStudent.feeTransport ?? ''} onChange={e => setCurrentStudent({...currentStudent, feeTransport: parseInt(e.target.value) || 0})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Frais de Tenues (Uniformes)</label>
              <input type="number" min="0" step="1" value={currentStudent.feeUniforms ?? ''} onChange={e => setCurrentStudent({...currentStudent, feeUniforms: parseInt(e.target.value) || 0})} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Adresse d'habitation</label>
              <input value={currentStudent.address || ''} onChange={e => setCurrentStudent({...currentStudent, address: e.target.value})} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Contact d'Urgence</label>
              <input value={currentStudent.emergencyContact || ''} onChange={e => setCurrentStudent({...currentStudent, emergencyContact: e.target.value})} placeholder="Numéro en cas d'urgence" />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', padding: '1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ color: '#92400e' }}>Allergies (Santé)</label>
              <textarea 
                value={currentStudent.allergies || ''} 
                onChange={e => setCurrentStudent({...currentStudent, allergies: e.target.value})} 
                placeholder="Ex: Arachides, Pénicilline..."
                rows={2}
                style={{ width: '100%', borderColor: '#fcd34d' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ color: '#92400e' }}>Conditions Médicales Particulières</label>
              <textarea 
                value={currentStudent.medicalConditions || ''} 
                onChange={e => setCurrentStudent({...currentStudent, medicalConditions: e.target.value})} 
                placeholder="Ex: Asthme, Diabète..."
                rows={2}
                style={{ width: '100%', borderColor: '#fcd34d' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)} disabled={isSaving}>{t('cancel', 'Annuler')}</button>
            <button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : t('save', 'Enregistrer')}</button>
          </div>
        </form>
      </Modal>

      {/* Excel Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => {setImportModalOpen(false); setPreviewStudents(null);}} title="Importation d'élèves depuis Excel">
        {!previewStudents ? (
          <form onSubmit={handleImportSubmit}>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#eef2ff', borderRadius: '4px', border: '1px solid var(--primary-color)' }}>
              <p style={{ margin: '0 0 1rem 0', fontWeight: 500 }}>Étape 1 : Format de votre fichier Excel (.xlsx ou .xls)</p>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Assurez-vous d'avoir les colonnes suivantes : <strong>Nom, Prénom, Classe, Matricule</strong>.</p>
            </div>

            <p style={{ margin: '0 0 1rem 0', fontWeight: 500 }}>Étape 2 : Chargement dans la base de données</p>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Section par défaut (utilisée si non précisée dans le fichier)</label>
                <select value={importSection} onChange={e => setImportSection(e.target.value as SectionType)}>
                  <option value="francophone">Francophone</option>
                  <option value="anglophone">Anglophone</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
               <button type="button" onClick={() => {
                 import('../db/storage').then(({ defaultDB }) => {
                   const missing = defaultDB.classes.filter(defCls => !db.classes.some(c => c.id === defCls.id));
                   if (missing.length > 0) {
                     saveDB({ ...db, classes: [...db.classes, ...missing] });
                     alert(`${missing.length} classes manquantes ont été injectées avec succès !`);
                   } else {
                     alert("Toutes les classes sont déjà présentes.");
                   }
                 });
               }} style={{ background: 'var(--success)', padding: '0.5rem', width: '100%', marginBottom: '1rem' }}>
                 🛠️ Cliquez ici pour réparer les classes manquantes (Pre-Nursery, etc.)
               </button>
            </div>

            <div className="form-group">
              <label>Fichier Excel complété (.xlsx, .xls)</label>
              <input type="file" accept=".xlsx, .xls" required onChange={e => setExcelFile(e.target.files ? e.target.files[0] : null)} style={{ padding: '0.5rem', border: '1px dashed var(--border-color)', width: '100%', background: 'var(--bg-color)', cursor: 'pointer' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button type="button" className="secondary" onClick={() => setImportModalOpen(false)}>{t('cancel', 'Annuler')}</button>
              <button type="submit">Afficher l'aperçu avant import</button>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#dcfce7', borderRadius: '4px', border: '1px solid var(--success)', color: 'var(--success)' }}>
              <p style={{ margin: 0, fontWeight: 500 }}>
                Aperçu : {previewStudents.length} élèves trouvés. Veuillez vérifier les données.
              </p>
            </div>
            
            <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Matricule</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Nom complet</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Classe Excel (Brute)</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Classe Détectée</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Section</th>
                  </tr>
                </thead>
                <tbody>
                  {previewStudents.map((s, i) => {
                    const matchedClass = s.classId ? db.classes.find(c => c.id === s.classId) : null;
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.5rem' }}>{s.matricule}</td>
                        <td style={{ padding: '0.5rem', fontWeight: 500 }}>{s.name}</td>
                        <td style={{ padding: '0.5rem', color: '#666', fontStyle: 'italic' }}>
                          {s.rawClassName || '-'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {matchedClass ? (
                            <span style={{ color: 'var(--success)', fontWeight: 500 }}>{matchedClass.name}</span>
                          ) : (
                            <span style={{color: 'var(--danger)', fontWeight: 500}}>À définir</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            background: s.section === 'anglophone' ? '#e0f2fe' : '#fce7f3', 
                            color: s.section === 'anglophone' ? '#0369a1' : '#be185d',
                            borderRadius: '999px',
                            fontSize: '0.8rem'
                          }}>
                            {s.section || 'À définir'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="button" className="secondary" onClick={() => setPreviewStudents(null)}>Retour</button>
              <button type="button" onClick={handleConfirmImport} style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>Confirmer l'importation</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!inviteModalStudent} onClose={() => { setInviteModalStudent(null); setGeneratedInviteLink(''); }} title="Inviter un parent">
        {inviteModalStudent && (
          <div style={{ padding: '1rem' }}>
            <p style={{ marginBottom: '1rem' }}>
              Générer une invitation sécurisée pour que le parent de <strong>{inviteModalStudent.name}</strong> puisse accéder au portail.
            </p>
            
            {(!inviteModalStudent.parentEmails || inviteModalStudent.parentEmails.length === 0) ? (
              <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', marginBottom: '1rem' }}>
                Cet élève n'a aucun email parent renseigné. Veuillez d'abord modifier sa fiche.
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label>Sélectionnez l'email à inviter :</label>
                <select 
                  value={inviteEmailTarget} 
                  onChange={(e) => setInviteEmailTarget(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.5rem' }}
                >
                  {inviteModalStudent.parentEmails.map(email => (
                    <option key={email} value={email}>{email}</option>
                  ))}
                </select>
              </div>
            )}

            {!generatedInviteLink ? (
              <button 
                onClick={generateInviteLink}
                disabled={!inviteEmailTarget}
                style={{ width: '100%', padding: '0.75rem', background: 'var(--primary)', color: 'white', borderRadius: '4px', border: 'none', cursor: inviteEmailTarget ? 'pointer' : 'not-allowed' }}
              >
                Générer le lien d'invitation
              </button>
            ) : (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>Lien généré avec succès !</p>
                <input 
                  type="text" 
                  readOnly 
                  value={generatedInviteLink} 
                  style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }} 
                />
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteLink);
                      alert('Lien copié dans le presse-papier !');
                    }}
                    style={{ flex: 1, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'var(--secondary-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    <Copy size={16} /> Copier
                  </button>
                  <a 
                    href={`https://wa.me/?text=${encodeURIComponent(`Bonjour, voici votre lien pour suivre la scolarité de ${inviteModalStudent.name}. Cliquez ici : ${generatedInviteLink}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ flex: 1, padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#25D366', color: 'white', textDecoration: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    <Send size={16} /> WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
};

export default Students;
