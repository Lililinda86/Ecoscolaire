import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { Plus, Edit2, Trash2, HeartPulse, FileSpreadsheet, Printer, Send, Copy, MessageSquare } from 'lucide-react';
import { normalizeCameroonPhoneNumber, normalizeClassName, getDefaultFeesForClass } from '../utils/importUtils';
import type { Student, SectionType } from '../types';
import Modal from '../components/Modal';
import { sortClasses } from '../utils/sortClasses';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import * as XLSX from 'xlsx';
import { getStudentLimit, isStudentLimitReached, getStudentLimitLabel } from '../utils/saas';
import { normalizeParentEmails } from '../utils/emailHelpers';
import { db as firestoreDb } from '../db/firebase';
import { doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';

const getErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
};

const Students: React.FC = () => {
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [, setRefresh] = useState(0);
  const { db, safeMergeDB, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();

  const currentCountDisplay = currentSchool?.studentCount ?? db.students.length;
  const limitReached = isStudentLimitReached(currentSchool, currentCountDisplay);
  const limitLabel = getStudentLimitLabel(currentSchool, currentCountDisplay);
  const [currentStudent, setCurrentStudent] = useState<Partial<Student>>({ gender: 'M', section: 'francophone', classId: '' });
  const [parentEmailsInput, setParentEmailsInput] = useState('');

  const [inviteModalStudent, setInviteModalStudent] = useState<Student | null>(null);
  const [inviteEmailTarget, setInviteEmailTarget] = useState<string>('');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string>('');
  const [isImportModalOpen, setImportModalOpen] = useState(false);
  const [importReport, setImportReport] = useState<{
    totalRead: number;
    readyCount: number;
    duplicates: number;
    errors: string[];
  } | null>(null);
  const [importSection, setImportSection] = useState<SectionType>('francophone');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [previewStudents, setPreviewStudents] = useState<Student[] | null>(null);

  const [noMedicalConditionConfirmed, setNoMedicalConditionConfirmed] = useState(false);
  const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [stepValidationError, setStepValidationError] = useState<string | null>(null);
  const [isConfirmAbandonOpen, setIsConfirmAbandonOpen] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');

  const buildStudentDisplayName = (lastName?: string, firstName?: string): string => {
    const l = (lastName || '').trim().replace(/\s+/g, ' ');
    const f = (firstName || '').trim().replace(/\s+/g, ' ');
    if (l && f) return `${l} ${f}`;
    if (l) return l;
    if (f) return f;
    return '';
  };

  const requestCloseStudentModal = () => {
    if (isSaving) return;
    const currentSnap = JSON.stringify({ currentStudent, parentEmailsInput });
    if (currentSnap !== initialSnapshot) {
      setIsConfirmAbandonOpen(true);
    } else {
      setModalOpen(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  // Helper pour déduire le libellé du cycle (Section 6 P0-35)
  const getCycleLabel = (cls: { cycle?: string; level?: string; name: string }) => {
    const c = cls.cycle || cls.level;
    if (c === 'nursery' || c === 'preschool' || c === 'maternelle') return 'Maternelle';
    if (c === 'primary' || c === 'primaire') return 'Primaire';
    if (c === 'secondary' || c === 'secondaire') return 'Secondaire';

    // Fallback rigoureux par nom exact ou pattern
    const n = cls.name.toLowerCase().trim();
    if (n.includes('maternelle') || n.includes('nursery') || n.includes('pré-') || n.includes('petite section') || n.includes('moyenne section') || n.includes('grande section')) {
      return 'Maternelle';
    }
    if (n.startsWith('class ') || n === 'sil' || n === 'cp' || n === 'ce1' || n === 'ce2' || n === 'cm1' || n === 'cm2') {
      return 'Primaire';
    }
    if (n.startsWith('form ') || n.includes('sixth') || n.includes('6e') || n.includes('6ème') || n.includes('5e') || n.includes('5ème') || n.includes('4e') || n.includes('4ème') || n.includes('3e') || n.includes('3ème') || n.includes('seconde') || n.includes('2nde') || n.includes('première') || n.includes('1re') || n.includes('terminale')) {
      return 'Secondaire';
    }
    return 'Primaire';
  };

  // Helper unique de qualification d'une classe sélectionnable pour un élève (CAS A - Section 3 & 5)
  const isSelectableClassForStudent = (
    classItem: unknown,
    school: typeof currentSchool,
    studentSection?: string
  ): boolean => {
    if (!classItem || typeof classItem !== 'object' || !school) return false;
    const cls = classItem as Record<string, unknown>;

    // 1. Id non vide
    const id = typeof cls.id === 'string' ? cls.id.trim() : '';
    if (!id) return false;

    // 2. schoolId strictement égal à currentSchool.id
    const sId = typeof cls.schoolId === 'string' ? cls.schoolId.trim() : String(cls.schoolId || '');
    if (sId !== school.id) return false;

    // 3. Actives uniquement : isActive !== false
    if (cls.isActive === false) return false;

    // 4. Compatibilité linguistique si spécifiée (type ou section)
    const classType = typeof cls.type === 'string' ? cls.type : (typeof cls.section === 'string' ? cls.section : undefined);
    if (studentSection && classType && classType !== studentSection) return false;

    return true;
  };

  // Liste dérivée unique des classes sélectionnables pour l'école
  const currentClassObj = currentStudent.classId ? db.classes.find(c => c.id === currentStudent.classId) : null;
  const rawSchoolClasses = (db.classes || []).filter(c => {
    if (currentClassObj && c.id === currentClassObj.id && String(c.schoolId || '') === currentSchool?.id) {
      return true;
    }
    return isSelectableClassForStudent(c, currentSchool, currentStudent.section);
  });

  // Déduplication par ID
  const uniqueSchoolClasses = Array.from(new Map(rawSchoolClasses.map(c => [c.id, c])).values());
  const sortedClasses = sortClasses(uniqueSchoolClasses as unknown as import('../types').ClassSection[]);

  const filteredStudents = db.students.filter(student => {
    const matchSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSection = sectionFilter === 'all' || student.section === sectionFilter;
    const matchClass = classFilter === 'all' || student.classId === classFilter;
    return matchSearch && matchSection && matchClass;
  });

  const handleOpenModal = (student?: Student) => {
    setCurrentStep(1);
    setStepValidationError(null);
    setNoMedicalConditionConfirmed(false);
    let initStudent: Partial<Student>;
    let initEmails = '';

    if (student) {
      setIsEditing(true);
      initStudent = {
        ...student,
        studentLastName: student.studentLastName || '',
        studentFirstName: student.studentFirstName || '',
        fatherName: student.fatherName || '',
        fatherPhone: student.fatherPhone || '',
        fatherProfession: student.fatherProfession || '',
        motherName: student.motherName || '',
        motherPhone: student.motherPhone || '',
        motherProfession: student.motherProfession || '',
        guardianRelationship: student.guardianRelationship || 'other',
        guardianRelationshipDetails: student.guardianRelationshipDetails || '',
        studentStatus: student.studentStatus || 'nouveau',
        registrationYear: student.registrationYear || '2026-2027',
        registrationFeeExpected: student.registrationFeeExpected ?? 15000,
        registrationFeePaid: student.registrationFeePaid ?? 0,
        registrationFeeStatus: student.registrationFeeStatus || 'unpaid',
        usesTransport: student.usesTransport || false,
        transportMonthlyFee: student.transportMonthlyFee ?? 0,
        transportStatus: student.transportStatus || 'none',
        transportPaid: student.transportPaid ?? 0
      };
      initEmails = (student.parentEmails || []).join(', ');
      setCurrentStudent(initStudent);
      setParentEmailsInput(initEmails);
    } else {
      initStudent = {
        id: crypto.randomUUID(), name: '', studentLastName: '', studentFirstName: '', gender: 'M', dob: '', section: 'francophone', parentName: '', classId: '',
        fatherName: '', fatherPhone: '', fatherProfession: '', motherName: '', motherPhone: '', motherProfession: '',
        guardianRelationship: 'other', guardianRelationshipDetails: '',
        studentStatus: 'nouveau', registrationYear: '2026-2027', registrationFeeExpected: 15000, registrationFeePaid: 0,
        registrationFeeStatus: 'unpaid', usesTransport: false, transportMonthlyFee: 0, transportStatus: 'none', transportPaid: 0
      };
      initEmails = '';
      setCurrentStudent(initStudent);
      setIsEditing(false);
      setParentEmailsInput(initEmails);
    }
    setInitialSnapshot(JSON.stringify({ currentStudent: initStudent, parentEmailsInput: initEmails }));
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

      await setDoc(doc(firestoreDb, 'parent_invitations', inviteId), invitation, { merge: true });

      const link = `${window.location.origin}/#/parent-signup?inviteId=${inviteId}`;
      setGeneratedInviteLink(link);
      logAuditAction({
        action: 'STUDENT_INVITE_GENERATED',
        targetType: 'STUDENT',
        targetId: inviteModalStudent.id,
        targetName: inviteModalStudent.name,
        details: { inviteId }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      alert("Erreur lors de la génération de l'invitation : " + message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    if (currentStep !== 4) return;

    if (!currentStudent.classId) {
      alert("Veuillez choisir une classe !");
      return;
    }

    // Validation préalable côté frontend (Section 6)
    const selectedClassItem = db.classes.find(c => c.id === currentStudent.classId);
    if (!isSelectableClassForStudent(selectedClassItem, currentSchool, currentStudent.section)) {
      alert("La classe sélectionnée n’est plus active ou ne correspond pas à cette école et à cette année académique. Sélectionnez une autre classe.");
      return;
    }

    setIsSaving(true);
    try {
      const normalizedEmails = normalizeParentEmails(parentEmailsInput);
      const parentPhone = currentStudent.parentPhone ? (normalizeCameroonPhoneNumber(currentStudent.parentPhone) || currentStudent.parentPhone) : '';
      const matricule = currentStudent.matricule ? currentStudent.matricule.trim() : `MAT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const computedName = buildStudentDisplayName(currentStudent.studentLastName, currentStudent.studentFirstName);
      const finalName = computedName || currentStudent.name || '';

      const finalStudent = {
        ...currentStudent,
        name: finalName,
        parentEmails: normalizedEmails,
        parentPhone,
        matricule
      } as Student;
      if (!finalStudent.schoolId && currentSchool) {
        finalStudent.schoolId = currentSchool.id;
      }

      const expected = finalStudent.registrationFeeExpected ?? 15000;
      const paid = finalStudent.registrationFeePaid ?? 0;
      let status: 'unpaid' | 'partial' | 'paid' = 'unpaid';
      if (paid >= expected) status = 'paid';
      else if (paid > 0) status = 'partial';
      finalStudent.registrationFeeStatus = status;

      if (isEditing && finalStudent.id) {
        const studentRef = doc(firestoreDb, 'students', finalStudent.id);
        const rawPatchData = {
          matricule: finalStudent.matricule,
          name: finalStudent.name,
          studentLastName: finalStudent.studentLastName,
          studentFirstName: finalStudent.studentFirstName,
          gender: finalStudent.gender,
          dob: finalStudent.dob,
          placeOfBirth: finalStudent.placeOfBirth,
          section: finalStudent.section,
          classId: finalStudent.classId,
          fatherName: finalStudent.fatherName,
          fatherPhone: finalStudent.fatherPhone,
          fatherProfession: finalStudent.fatherProfession,
          motherName: finalStudent.motherName,
          motherPhone: finalStudent.motherPhone,
          motherProfession: finalStudent.motherProfession,
          guardianRelationship: finalStudent.guardianRelationship,
          guardianRelationshipDetails: finalStudent.guardianRelationshipDetails,
          parentName: finalStudent.parentName,
          parentEmails: finalStudent.parentEmails,
          parentPhone: finalStudent.parentPhone,
          address: finalStudent.address,
          emergencyContact: finalStudent.emergencyContact,
          allergies: finalStudent.allergies,
          medicalConditions: finalStudent.medicalConditions,
          studentStatus: finalStudent.studentStatus,
          registrationYear: finalStudent.registrationYear
        };
        const patchData = Object.fromEntries(Object.entries(rawPatchData).filter(([, v]) => v !== undefined));
        await updateDoc(studentRef, patchData);

        // Mutate local state for UI update
        const idx = db.students.findIndex(s => s.id === finalStudent.id);
        if (idx !== -1) db.students[idx] = finalStudent;

      } else {
        if (!currentSchool) throw new Error("École non définie.");
        const studentId = finalStudent.id || crypto.randomUUID();
        finalStudent.id = studentId;
        const studentRef = doc(firestoreDb, 'students', studentId);

        const currentCountDisplay = currentSchool.studentCount ?? db.students.length;
        if (isStudentLimitReached(currentSchool, currentCountDisplay)) {
          throw new Error("QUOTA_EXCEEDED");
        }

        await setDoc(studentRef, finalStudent, { merge: true });

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
    } catch (err: unknown) {
      const code = getErrorCode(err);
      const message = getErrorMessage(err);
      if (message === 'QUOTA_EXCEEDED') {
        alert("Action refusée : La limite de votre abonnement SaaS est atteinte. Veuillez passer au plan supérieur.");
      } else if (message === 'ALREADY_EXISTS') {
        alert("Erreur métier : Cet élève existe déjà ou une requête concurrente a réussi.");
      } else if (code === 'permission-denied') {
        console.error("PERMISSION DENIED ERROR DETAILS:", err);
        alert("Action refusée : Vous n'avez pas les droits nécessaires pour effectuer cette action.");
      } else if (code === 'unavailable' || !navigator.onLine) {
        alert("Erreur réseau : Impossible de vérifier le quota hors ligne. Veuillez vous reconnecter.");
      } else if (code === 'aborted') {
        alert("Erreur de concurrence : La transaction a été interrompue. Veuillez réessayer.");
      } else {
        alert("Erreur lors de l'enregistrement : " + message);
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
          await deleteDoc(studentRef);

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

          await setDoc(doc(firestoreDb, 'validation_requests', requestId), reqData, { merge: true });

          if (!db.validation_requests) db.validation_requests = [];
          db.validation_requests.push(reqData);
          setRefresh(r => r + 1);

          alert("Demande de suppression envoyée pour validation (Directeur / Super Admin).");
        }
      } catch (err: unknown) {
        const code = getErrorCode(err);
        const message = getErrorMessage(err);
        if (message === 'NOT_FOUND') {
          alert("Erreur métier : Cet élève n'existe pas ou a déjà été supprimé.");
        } else if (code === 'permission-denied') {
          alert("Action refusée : Vous n'avez pas les droits nécessaires pour effectuer cette action.");
        } else if (code === 'unavailable' || !navigator.onLine) {
          alert("Erreur réseau : Impossible d'effectuer l'action hors ligne. Veuillez vous reconnecter.");
        } else if (code === 'aborted') {
          alert("Erreur de concurrence : La transaction a été interrompue. Veuillez réessayer.");
        } else {
          alert("Erreur lors de la suppression : " + message);
        }
      }
    }
  };

  const handleDeleteAll = () => {
    alert("Fonction temporairement indisponible pour protéger les données.");
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
        const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

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
        const errorsLog: string[] = [];
        let duplicateCount = 0;

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const rawRow = rawRows[i];
          const row: Record<string, unknown> = {};
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

          const nom = getVal(['NOM']);
          const prenom = getVal(['PRENOM']);
          const fullName = getVal(['NOMS ET PRENOMS', 'NOM ET PRENOM']) || (nom ? `${nom} ${prenom}`.trim() : '');

          if (!fullName) {
            errorsLog.push(`Ligne ${i + 1} : Nom ou prénom manquant.`);
            continue;
          }

          const classeNameRaw = getVal(['CLASSE']);
          const matricule = getVal(['MATRICULE']);
          const parentEmailsStr = getVal(['EMAIL PARENT', 'EMAILS PARENTS', 'EMAIL PARENT 1', 'EMAILPARENT', 'PARENT EMAIL', 'EMAIL']);
          const normalizedEmails = normalizeParentEmails(parentEmailsStr);

          // Validation classe prédéfinie
          let classId = '';
          let finalSection: 'francophone' | 'anglophone' | '' = '';
          let detectedClassName = '';

          if (classeNameRaw) {
            const match = normalizeClassName(classeNameRaw);
            if (match) {
              const matchedClasses = db.classes.filter(c => c.name.toLowerCase() === match.matchedName.toLowerCase() && c.type === match.section);
              if (matchedClasses.length > 0) {
                classId = matchedClasses[0].id;
                finalSection = matchedClasses[0].type;
                detectedClassName = matchedClasses[0].name;
              } else {
                errorsLog.push(`Ligne ${i + 1} : Classe "${classeNameRaw}" reconnue comme "${match.matchedName}" mais pas encore créée dans l'école.`);
              }
            } else {
              // Tentative de suggestion
              if (classeNameRaw.toUpperCase().includes('FROM')) {
                errorsLog.push(`Ligne ${i + 1} : Classe "${classeNameRaw}" inconnue. Suggestion : "Form 1" ou "Form 2".`);
              } else {
                errorsLog.push(`Ligne ${i + 1} : Classe "${classeNameRaw}" inconnue dans le référentiel.`);
              }
              continue;
            }
          } else {
            errorsLog.push(`Ligne ${i + 1} : Classe non renseignée.`);
            continue;
          }

          // Validation Téléphone parent
          const rawPhone = getVal(['CONTACT', 'TÉLÉPHONE', 'TELEPHONE', 'TEL', 'PHONE', 'TELEPHONE_PARENT']);
          const normalizedPhone = normalizeCameroonPhoneNumber(rawPhone);
          if (rawPhone && !normalizedPhone) {
            errorsLog.push(`Ligne ${i + 1} : Téléphone parent "${rawPhone}" invalide.`);
            continue;
          }

          // Détection doublon local / existant dans l'année scolaire
          const isDuplicate = db.students.some(s => s.name.toLowerCase() === fullName.toLowerCase() && s.classId === classId) ||
                              newStudents.some(s => s.name.toLowerCase() === fullName.toLowerCase() && s.classId === classId);
          if (isDuplicate) {
            duplicateCount++;
            errorsLog.push(`Ligne ${i + 1} : Doublon détecté pour l'élève "${fullName}".`);
            continue;
          }

          // Extraction des colonnes financières optionnelles
          const regExpected = parseFloat(getVal(['INSCRIPTION_ATTENDUE', 'DROIT INSCRIPTION ATTENDU', 'REGISTRATION'])) || 15000;
          const regPaid = parseFloat(getVal(['INSCRIPTION_PAYEE', 'DROIT INSCRIPTION PAYE'])) || 0;
          const tuitionExpected = parseFloat(getVal(['SCOLARITE_ANNUELLE', 'PENSION ATTENDUE', 'TUITION'])) || 0;
          const tuitionPaid = parseFloat(getVal(['PENSION PAYEE'])) || 0;

          const t1 = parseFloat(getVal(['TRANCHE_1', 'TRANCHE 1'])) || 0;
          const t2 = parseFloat(getVal(['TRANCHE_2', 'TRANCHE 2'])) || 0;
          const t3 = parseFloat(getVal(['TRANCHE_3', 'TRANCHE 3'])) || 0;

          newStudents.push({
            id: crypto.randomUUID(),
            matricule: matricule || '-',
            name: fullName,
            gender: getVal(['SEXE', 'GENRE']).toUpperCase().startsWith('F') ? 'F' : 'M',
            dob: getVal(['DATE DE NAISSANCE', 'DATE', 'DOB']),
            section: finalSection || importSection,
            classId: classId,
            parentName: getVal(['TUTEUR', 'PARENT', 'NOMS DES PARENTS', 'NOM_PARENT']) || 'Inconnu',
            parentPhone: normalizedPhone || '',
            address: getVal(['ADRESSE', 'QUARTIER', 'ADRESSE_PARENT']) || '',

            // Paramètres financiers enrichis
            registrationFeeExpected: regExpected,
            registrationFeePaid: regPaid,
            registrationFeeStatus: regPaid >= regExpected ? 'paid' : (regPaid > 0 ? 'partial' : 'unpaid'),

            tuitionExpected: tuitionExpected || (t1 + t2 + t3),
            tuitionPaid: tuitionPaid,
            tuitionStatus: tuitionPaid >= (tuitionExpected || (t1 + t2 + t3)) ? 'paid' : (tuitionPaid > 0 ? 'partial' : 'unpaid'),

            feeT1: t1,
            feeT2: t2,
            feeT3: t3,
            feeTransport: parseFloat(getVal(['TRANSPORT'])) || 0,
            feeUniforms: parseFloat(getVal(['TENUE_GRATUITE'])) || 0,

            rawClassName: classeNameRaw,
            detectedClassName: detectedClassName,
            parentEmails: normalizedEmails
          });
        }

        setImportReport({
          totalRead: rawRows.length - (headerRowIndex + 1),
          readyCount: newStudents.length,
          duplicates: duplicateCount,
          errors: errorsLog
        });

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

      safeMergeDB({ ...db, students: [...db.students, ...previewStudents] });
      setPreviewStudents(null);
      setImportReport(null);
      setImportModalOpen(false);
      setExcelFile(null);
      alert("Importation finalisée avec succès !");
    }
  };

  const exportInscriptionsCSV = () => {
    const rows = [
      [
        'ID', 'Nom', 'Sexe', 'Date de naissance', 'Section', 'Classe',
        'Statut élève', 'Année scolaire', 'Nom parent / tuteur', 'Téléphone parent', 'Email parent',
        'Droit inscription attendu', 'Droit inscription payé', 'Statut droit inscription',
        'Pension attendue', 'Pension payée', 'Statut pension',
        'Utilise transport', 'Quartier transport', 'Point de ramassage transport',
        'Flotte / Bus transport', 'Tarif mensuel transport', 'Transport payé', 'Statut transport'
      ]
    ];

    filteredStudents.forEach(student => {
      const className = db.classes.find(c => c.id === student.classId)?.name || student.rawClassName || 'Inconnue';
      const parentEmail = (student.parentEmails || [])[0] || '';

      const escapeCsv = (str: string | number | boolean | undefined | null) => {
        if (str === null || str === undefined) return '';
        const s = String(str);
        if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const expectedTuition = (student.feeT1 || 0) + (student.feeT2 || 0) + (student.feeT3 || 0);

      rows.push([
        escapeCsv(student.id),
        escapeCsv(student.name),
        escapeCsv(student.gender),
        escapeCsv(student.dob),
        escapeCsv(student.section),
        escapeCsv(className),
        escapeCsv(student.studentStatus || 'nouveau'),
        escapeCsv(student.registrationYear || '2026-2027'),
        escapeCsv(student.parentName),
        escapeCsv(student.parentPhone),
        escapeCsv(parentEmail),
        escapeCsv(student.registrationFeeExpected ?? 15000),
        escapeCsv(student.registrationFeePaid ?? 0),
        escapeCsv(student.registrationFeeStatus || 'unpaid'),
        escapeCsv(expectedTuition),
        escapeCsv(student.tuitionPaid ?? 0),
        escapeCsv(student.tuitionStatus || 'unpaid'),
        escapeCsv(student.usesTransport ? 'Oui' : 'Non'),
        escapeCsv(student.transportNeighborhood),
        escapeCsv(student.transportPickupPoint),
        escapeCsv(student.transportFleet),
        escapeCsv(student.transportMonthlyFee ?? 0),
        escapeCsv(student.transportPaid ?? 0),
        escapeCsv(student.transportStatus || 'none')
      ]);
    });

    const csvContent = '\uFEFFsep=;\n' + rows.map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const isItalo = currentSchool?.name?.toLowerCase().includes('italo');
    link.setAttribute("download", isItalo ? 'italo-inscriptions-2026-2027.csv' : 'inscriptions-2026-2027.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatPhoneForWhatsApp = (phone?: string) => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('00237')) {
      cleaned = '237' + cleaned.substring(5);
    } else if (cleaned.startsWith('237')) {
      // keep it
    } else if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) {
      cleaned = '237' + cleaned;
    }
    return cleaned.length >= 9 ? cleaned : '';
  };

  const needsReminder = (student: Student) => {
    const expectedReg = student.registrationFeeExpected ?? 15000;
    const paidReg = student.registrationFeePaid ?? 0;
    const remainingReg = Math.max(expectedReg - paidReg, 0);

    const expectedTuition = student.tuitionExpected && student.tuitionExpected > 0
      ? student.tuitionExpected
      : ((student.feeT1 || 0) + (student.feeT2 || 0) + (student.feeT3 || 0));
    const paidTuition = student.tuitionPaid ?? 0;
    const remainingTuition = Math.max(expectedTuition - paidTuition, 0);

    const expectedTransport = student.transportMonthlyFee || student.feeTransport || 0;
    const transportOwed = student.usesTransport && expectedTransport > 0 && (student.transportPaid || 0) < expectedTransport;

    return remainingReg > 0 || remainingTuition > 0 || transportOwed;
  };

  const handleWhatsAppReminder = (student: Student) => {
    const phone = formatPhoneForWhatsApp(student.parentPhone);
    if (!phone) return;

    const expectedReg = student.registrationFeeExpected ?? 15000;
    const paidReg = student.registrationFeePaid ?? 0;
    const remainingReg = Math.max(expectedReg - paidReg, 0);

    const expectedTuition = student.tuitionExpected && student.tuitionExpected > 0
      ? student.tuitionExpected
      : ((student.feeT1 || 0) + (student.feeT2 || 0) + (student.feeT3 || 0));
    const paidTuition = student.tuitionPaid ?? 0;
    const remainingTuition = Math.max(expectedTuition - paidTuition, 0);

    const expectedTransport = student.transportMonthlyFee || student.feeTransport || 0;
    const transportOwed = student.usesTransport && expectedTransport > 0 && (student.transportPaid || 0) < expectedTransport;

    if (remainingReg === 0 && remainingTuition === 0 && !transportOwed) return;

    let message = `Bonjour Madame/Monsieur,\n\nNous vous contactons au sujet du dossier scolaire de ${student.name} pour l'année 2026-2027.\n\nÀ ce jour, le solde à régulariser est le suivant :\n`;

    if (remainingReg > 0) {
      message += `- Droit d'inscription : ${remainingReg.toLocaleString('fr-FR')} FCFA\n`;
    }
    if (remainingTuition > 0) {
      message += `- Pension scolaire : ${remainingTuition.toLocaleString('fr-FR')} FCFA\n`;
    }
    if (transportOwed) {
      message += `- Transport : à régulariser\n`;
    }

    message += `\nNous vous invitons à vous rapprocher de l'administration afin de régulariser la situation ou convenir d'un échéancier si nécessaire.\n\nCordialement,\nAdministration ITALO`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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
            {filteredStudents.length} {filteredStudents.length <= 1 ? 'élève inscrit' : 'élèves inscrits'} — Capacité SaaS : {limitLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended} aria-label="Ajouter un élève">
            <Plus size={18} /> {t('add', 'Ajouter un élève')}
          </button>
          <button className="secondary" onClick={() => setImportModalOpen(true)} disabled={isSchoolSuspended} aria-label="Importer depuis Excel">
            <FileSpreadsheet size={18} /> Importer Excel
          </button>
          <button className="secondary" onClick={exportInscriptionsCSV} disabled={isSchoolSuspended || filteredStudents.length === 0} aria-label="Exporter les inscriptions">
            <FileSpreadsheet size={18} /> Exporter inscriptions
          </button>
          <button className="secondary" onClick={() => window.print()} aria-label="Imprimer la liste">
            <Printer size={18} /> Imprimer
          </button>

          {/* Menu secondaire d'actions dangereuses */}
          {['superAdmin', 'owner', 'director'].includes(currentUser?.role || '') && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsMoreActionsOpen(prev => !prev)}
                aria-expanded={isMoreActionsOpen}
                aria-controls="more-actions-menu"
                aria-label="Autres actions"
                style={{ fontSize: '0.9rem' }}
              >
                Autres actions ▾
              </button>
              {isMoreActionsOpen && (
                <div
                  id="more-actions-menu"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '110%',
                    background: '#fff',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 20,
                    minWidth: '180px',
                    padding: '0.5rem'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setIsMoreActionsOpen(false); handleDeleteAll(); }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                    disabled={isSchoolSuspended}
                    aria-label="Vider la liste des élèves"
                  >
                    <Trash2 size={16} /> Vider la liste
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card print-area" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '2rem 2rem 0 2rem', display: 'none' }} className="print-area-header">
           <SchoolDocumentHeader school={currentSchool} documentTitle="Liste des Élèves" />
        </div>
        <style>{`@media print { .print-area-header { display: block !important; } }`}</style>

        <div className="no-print" style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: '#f8f9fa' }}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Rechercher un élève, matricule, classe, tuteur..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ minWidth: '280px', flex: 1 }}
              aria-label="Rechercher un élève"
            />
            <select value={sectionFilter} onChange={e => {setSectionFilter(e.target.value); setClassFilter('all');}} aria-label="Filtrer par section">
              <option value="all">Toutes les sections</option>
              <option value="francophone">Francophone</option>
              <option value="anglophone">Anglophone</option>
            </select>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)} aria-label="Filtrer par classe">
              <option value="all">Toutes les classes</option>
              {db.classes.filter(c => sectionFilter === 'all' || c.type === sectionFilter).map(c => (
                 <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {(searchTerm !== '' || sectionFilter !== 'all' || classFilter !== 'all') && (
              <button
                type="button"
                className="secondary"
                onClick={() => { setSearchTerm(''); setSectionFilter('all'); setClassFilter('all'); }}
                style={{ fontSize: '0.85rem' }}
                aria-label="Réinitialiser les filtres"
              >
                Réinitialiser les filtres
              </button>
            )}
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
                  <td colSpan={7} style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {db.students.length === 0
                      ? 'Aucun élève n’est encore inscrit dans cet établissement.'
                      : (searchTerm !== ''
                          ? 'Aucun élève trouvé pour cette recherche.'
                          : 'Aucun élève ne correspond aux filtres sélectionnés.'
                        )
                    }
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
                      <button
                        className="secondary"
                        onClick={() => handleWhatsAppReminder(student)}
                        style={{ marginRight: '0.5rem', color: '#25D366', borderColor: needsReminder(student) && formatPhoneForWhatsApp(student.parentPhone) ? '#25D366' : undefined, opacity: needsReminder(student) && formatPhoneForWhatsApp(student.parentPhone) ? 1 : 0.5 }}
                        title="Relancer par WhatsApp (Droit d'inscription, Pension, Transport)"
                        disabled={isSchoolSuspended || !needsReminder(student) || !formatPhoneForWhatsApp(student.parentPhone)}
                      >
                        <MessageSquare size={16} />
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

      <Modal isOpen={isModalOpen} onClose={requestCloseStudentModal} title={isEditing ? t('edit', 'Modifier l’élève') : t('add', 'Ajouter un élève')}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', maxHeight: '75vh' }}>
          {/* Header Step Indicator */}
          <div style={{ padding: '0.75rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary-color)' }}>
              Étape {currentStep} sur 4 : {
                currentStep === 1 ? '👤 Identité' :
                currentStep === 2 ? '🏫 Scolarité' :
                currentStep === 3 ? '📞 Responsable Légal' : '🩺 Compléments & Santé'
              }
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  style={{
                    width: '24px',
                    height: '6px',
                    borderRadius: '3px',
                    background: s === currentStep ? 'var(--primary-color)' : s < currentStep ? '#818cf8' : '#cbd5e1'
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            {stepValidationError && (
              <div role="alert" style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 500 }}>
                ⚠️ {stepValidationError}
              </div>
            )}
            {currentStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {isEditing && currentStudent.name && !currentStudent.studentLastName && !currentStudent.studentFirstName && (
                  <div style={{ padding: '0.6rem 0.8rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.85rem', color: '#1e40af' }}>
                    ℹ️ Ancienne fiche : le nom et le prénom n’ont pas encore été séparés.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Matricule <span style={{ fontSize: '0.8rem', color: '#64748b' }}>(Facultatif)</span></label>
                    <input
                      value={currentStudent.matricule || ''}
                      onChange={e => setCurrentStudent({...currentStudent, matricule: e.target.value})}
                      placeholder="Laisser vide pour générer automatiquement"
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label>Nom <span style={{ color: 'red' }}>*</span></label>
                    <input
                      required
                      value={currentStudent.studentLastName || ''}
                      onChange={e => {
                        const l = e.target.value;
                        const computed = buildStudentDisplayName(l, currentStudent.studentFirstName);
                        setCurrentStudent({...currentStudent, studentLastName: l, name: computed || currentStudent.name || ''});
                      }}
                      placeholder="Ex: N’GONO"
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label>Prénom(s) <span style={{ color: 'red' }}>*</span></label>
                    <input
                      required
                      value={currentStudent.studentFirstName || ''}
                      onChange={e => {
                        const f = e.target.value;
                        const computed = buildStudentDisplayName(currentStudent.studentLastName, f);
                        setCurrentStudent({...currentStudent, studentFirstName: f, name: computed || currentStudent.name || ''});
                      }}
                      placeholder="Ex: Mballa Élise"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Sexe <span style={{ color: 'red' }}>*</span></label>
                    <select value={currentStudent.gender} onChange={e => setCurrentStudent({...currentStudent, gender: e.target.value as 'M'|'F'})}>
                      <option value="M">Masculin</option>
                      <option value="F">Féminin</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Date de Naissance <span style={{ color: 'red' }}>*</span></label>
                    <input
                      type="date"
                      required
                      value={currentStudent.dob || ''}
                      onChange={e => setCurrentStudent({...currentStudent, dob: e.target.value})}
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Lieu de Naissance</label>
                    <input
                      value={currentStudent.placeOfBirth || ''}
                      onChange={e => setCurrentStudent({...currentStudent, placeOfBirth: e.target.value})}
                      placeholder="Ex: Yaoundé"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label>{t('section', 'Section')} <span style={{ color: 'red' }}>*</span></label>
                    <select
                      value={currentStudent.section}
                      onChange={e => {
                        const newSection = e.target.value as SectionType;
                        setCurrentStudent(prev => ({
                          ...prev,
                          section: newSection,
                          classId: '',
                          feeT1: 0,
                          feeT2: 0,
                          feeT3: 0,
                          registrationFeeExpected: 15000
                        }));
                      }}
                    >
                      <option value="francophone">Francophone</option>
                      <option value="anglophone">Anglophone</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '2 1 300px' }}>
                    <label>Classe <span style={{ color: 'red' }}>*</span></label>
                    <select
                      required
                      value={currentStudent.classId || ''}
                      onChange={e => {
                        const cId = e.target.value;
                        const matchedClass = sortedClasses.find(c => c.id === cId);
                        if (matchedClass) {
                          const fees = getDefaultFeesForClass(matchedClass.name, currentStudent.section || 'francophone');
                          setCurrentStudent(prev => ({
                            ...prev,
                            classId: cId,
                            feeT1: fees.t1,
                            feeT2: fees.t2,
                            feeT3: fees.t3,
                            registrationFeeExpected: fees.registration,
                          }));
                        } else {
                          setCurrentStudent(prev => ({ ...prev, classId: cId }));
                        }
                      }}
                    >
                      <option value="">-- Choisir une classe --</option>
                      {Object.entries(
                        sortedClasses
                          .filter(c => !c.type || c.type === currentStudent.section)
                          .reduce((acc, c) => {
                            const cycleLabel = getCycleLabel(c);
                            if (!acc[cycleLabel]) acc[cycleLabel] = [];
                            acc[cycleLabel].push(c);
                            return acc;
                          }, {} as Record<string, typeof sortedClasses>)
                      ).map(([cycle, classes]) => (
                        <optgroup key={cycle} label={`--- ${cycle.toUpperCase()} ---`}>
                          {classes.map(c => {
                            const isInactiveCurrent = currentClassObj && c.id === currentClassObj.id && c.isActive === false;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name} {isInactiveCurrent ? '(Inactive - Classe Actuelle)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label>Statut Élève</label>
                    <select value={currentStudent.studentStatus || 'nouveau'} onChange={e => setCurrentStudent({...currentStudent, studentStatus: e.target.value as 'nouveau' | 'ancien'})}>
                      <option value="nouveau">Nouveau</option>
                      <option value="ancien">Ancien</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label>Année Scolaire</label>
                    <input value={currentStudent.registrationYear || '2026-2027'} onChange={e => setCurrentStudent({...currentStudent, registrationYear: e.target.value})} />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Section Père */}
                <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#334155', fontSize: '0.9rem' }}>👨‍👦 Informations du Père (Facultatif)</h4>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Nom & Prénom du Père</label>
                      <input value={currentStudent.fatherName || ''} onChange={e => setCurrentStudent({...currentStudent, fatherName: e.target.value})} placeholder="Ex: N’GONO Paul" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                      <label>Téléphone du Père</label>
                      <input value={currentStudent.fatherPhone || ''} onChange={e => setCurrentStudent({...currentStudent, fatherPhone: e.target.value})} placeholder="Ex: +237650336558" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                      <label>Profession du Père</label>
                      <input value={currentStudent.fatherProfession || ''} onChange={e => setCurrentStudent({...currentStudent, fatherProfession: e.target.value})} placeholder="Ex: Enseignant" />
                    </div>
                  </div>
                </div>

                {/* Section Mère */}
                <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#334155', fontSize: '0.9rem' }}>👩‍👦 Informations de la Mère (Facultatif)</h4>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Nom & Prénom de la Mère</label>
                      <input value={currentStudent.motherName || ''} onChange={e => setCurrentStudent({...currentStudent, motherName: e.target.value})} placeholder="Ex: EBOA Marie" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                      <label>Téléphone de la Mère</label>
                      <input value={currentStudent.motherPhone || ''} onChange={e => setCurrentStudent({...currentStudent, motherPhone: e.target.value})} placeholder="Ex: +237690112233" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 180px' }}>
                      <label>Profession de la Mère</label>
                      <input value={currentStudent.motherProfession || ''} onChange={e => setCurrentStudent({...currentStudent, motherProfession: e.target.value})} placeholder="Ex: Comptable" />
                    </div>
                  </div>
                </div>

                {/* Section Responsable Légal */}
                <div style={{ padding: '0.85rem 1rem', background: '#eef2ff', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#3730a3', fontSize: '0.9rem' }}>🏠 Responsable Légal Principal (Obligatoire)</h4>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Définir le responsable principal</label>
                      <select
                        value={currentStudent.guardianRelationship || 'other'}
                        onChange={e => {
                          const rel = e.target.value as 'father' | 'mother' | 'other';
                          let pName = currentStudent.parentName || '';
                          let pPhone = currentStudent.parentPhone || '';

                          if (rel === 'father' && currentStudent.fatherName) {
                            pName = currentStudent.fatherName;
                            if (currentStudent.fatherPhone) pPhone = currentStudent.fatherPhone;
                          } else if (rel === 'mother' && currentStudent.motherName) {
                            pName = currentStudent.motherName;
                            if (currentStudent.motherPhone) pPhone = currentStudent.motherPhone;
                          }

                          setCurrentStudent(prev => ({
                            ...prev,
                            guardianRelationship: rel,
                            parentName: pName,
                            parentPhone: pPhone
                          }));
                        }}
                      >
                        <option value="father">Père</option>
                        <option value="mother">Mère</option>
                        <option value="other">Autre (Tuteur / Mandataire)</option>
                      </select>
                    </div>
                    {currentStudent.guardianRelationship === 'other' && (
                      <div className="form-group" style={{ flex: '1 1 200px' }}>
                        <label>Préciser le lien de parenté</label>
                        <input
                          value={currentStudent.guardianRelationshipDetails || ''}
                          onChange={e => setCurrentStudent({...currentStudent, guardianRelationshipDetails: e.target.value})}
                          placeholder="Ex: Oncle, Tante, Grand-parent..."
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Nom du Responsable <span style={{ color: 'red' }}>*</span></label>
                      <input required value={currentStudent.parentName || ''} onChange={e => setCurrentStudent({...currentStudent, parentName: e.target.value})} placeholder="Ex: Paul Dupont" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Contact (Téléphone) <span style={{ color: 'red' }}>*</span></label>
                      <input required value={currentStudent.parentPhone || ''} onChange={e => setCurrentStudent({...currentStudent, parentPhone: e.target.value})} placeholder="Ex: +237650336558" />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '0.75rem' }}>
                    <label>Emails des parents (séparés par des virgules)</label>
                    <input
                      value={parentEmailsInput}
                      onChange={e => setParentEmailsInput(e.target.value)}
                      placeholder="parent1@example.com, parent2@example.com"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Adresse d'habitation</label>
                      <input value={currentStudent.address || ''} onChange={e => setCurrentStudent({...currentStudent, address: e.target.value})} placeholder="Ex: Akwa, Douala" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label>Contact d'Urgence</label>
                      <input value={currentStudent.emergencyContact || ''} onChange={e => setCurrentStudent({...currentStudent, emergencyContact: e.target.value})} placeholder="Numéro en cas d'urgence" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Santé */}
                <div style={{ padding: '1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#92400e', fontSize: '0.95rem' }}>🩺 Santé & Remarques Médicales</h4>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label style={{ color: '#92400e' }}>Allergies</label>
                      <textarea
                        value={currentStudent.allergies || ''}
                        onChange={e => setCurrentStudent({...currentStudent, allergies: e.target.value})}
                        placeholder="Ex: Arachides, Pénicilline..."
                        rows={2}
                        style={{ width: '100%', borderColor: '#fcd34d' }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label style={{ color: '#92400e' }}>Conditions Médicales</label>
                      <textarea
                        value={currentStudent.medicalConditions || ''}
                        onChange={e => setCurrentStudent({...currentStudent, medicalConditions: e.target.value})}
                        placeholder="Ex: Asthme, Diabète..."
                        rows={2}
                        style={{ width: '100%', borderColor: '#fcd34d' }}
                      />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#78350f' }}>
                    <input
                      type="checkbox"
                      checked={noMedicalConditionConfirmed}
                      onChange={e => setNoMedicalConditionConfirmed(e.target.checked)}
                    />
                    Aucune allergie ou condition médicale connue à signaler
                  </label>
                </div>

                {/* Récapitulatif compact */}
                <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#475569', fontSize: '0.9rem' }}>📋 Récapitulatif du Dossier Élève</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', color: '#334155' }}>
                    <div>Nom complet: <strong>{buildStudentDisplayName(currentStudent.studentLastName, currentStudent.studentFirstName) || currentStudent.name || '-'}</strong></div>
                    <div>Sexe / DOB: <strong>{currentStudent.gender} ({currentStudent.dob || '-'})</strong></div>
                    <div>Classe: <strong>{db.classes.find(c => c.id === currentStudent.classId)?.name || 'Non sélectionnée'}</strong></div>
                    <div>Responsable: <strong>{currentStudent.parentName || '-'} ({currentStudent.parentPhone || '-'})</strong></div>
                  </div>
                </div>

                {/* Synthèse financière et Transport */}
                {isEditing ? (
                  <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#475569', fontSize: '0.95rem' }}>💼 Synthèse Financière & Transport (Lecture Seule)</h4>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                      Gestion autonome dans les modules <strong>Paiements</strong> et <strong>Bus scolaires</strong>.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <div>Inscr. Attendue: <strong>{(currentStudent.registrationFeeExpected || 15000).toLocaleString('fr-FR')} FCFA</strong></div>
                      <div>Inscr. Payée: <strong>{(currentStudent.registrationFeePaid || 0).toLocaleString('fr-FR')} FCFA</strong></div>
                      <div>Statut Inscr.: <strong>{currentStudent.registrationFeeStatus || 'unpaid'}</strong></div>
                      <div>Transport: <strong>{currentStudent.usesTransport ? 'Actif' : 'Non utilisé'}</strong></div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '1rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1', fontSize: '0.95rem' }}>💼 Droits d’Inscription Initiaux</h4>
                    <p style={{ fontSize: '0.8rem', color: '#0369a1', margin: '0 0 0.75rem 0' }}>
                      Les encaissements réels sont enregistrés et reçus générés dans le module <strong>Paiements</strong>.
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: '1 1 150px' }}>
                        <label style={{ color: '#0369a1' }}>Droit attendu</label>
                        <input type="number" readOnly disabled value={currentStudent.registrationFeeExpected ?? 15000} style={{ backgroundColor: '#e0f2fe' }} />
                      </div>
                      <div className="form-group" style={{ flex: '1 1 150px' }}>
                        <label style={{ color: '#0369a1' }}>Statut Initial</label>
                        <input type="text" readOnly disabled value="Non payé (À régulariser en caisse)" style={{ backgroundColor: '#e0f2fe', fontWeight: 500 }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Modal Footer */}
          <div style={{ padding: '0.75rem 1rem', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="secondary" onClick={requestCloseStudentModal} disabled={isSaving}>
              {t('cancel', 'Annuler')}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {currentStep > 1 && (
                <button type="button" className="secondary" onClick={() => setCurrentStep(s => Math.max(s - 1, 1))} disabled={isSaving}>
                  Précédent
                </button>
              )}
              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStepValidationError(null);
                    if (currentStep === 1) {
                      if (!currentStudent.studentLastName && !currentStudent.name) {
                        setStepValidationError('Veuillez renseigner le nom.');
                        return;
                      }
                      if (!currentStudent.studentFirstName && !currentStudent.name) {
                        setStepValidationError('Veuillez renseigner le ou les prénoms.');
                        return;
                      }
                      if (!currentStudent.dob) {
                        setStepValidationError('Veuillez renseigner la date de naissance.');
                        return;
                      }
                      if (new Date(currentStudent.dob) > new Date()) {
                        setStepValidationError('La date de naissance ne peut pas être dans le futur.');
                        return;
                      }
                    }
                    if (currentStep === 2 && !currentStudent.classId) {
                      setStepValidationError('Veuillez sélectionner une classe.');
                      return;
                    }
                    if (currentStep === 3) {
                      if (!currentStudent.parentName) {
                        setStepValidationError('Veuillez renseigner le nom du responsable légal.');
                        return;
                      }
                      if (!currentStudent.parentPhone) {
                        setStepValidationError('Veuillez renseigner le téléphone du responsable légal.');
                        return;
                      }
                    }
                    setCurrentStep(s => Math.min(s + 1, 4));
                  }}
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSaving}
                  onClick={(e) => {
                    setStepValidationError(null);
                    const hasAllergies = Boolean((currentStudent.allergies || '').trim());
                    const hasMedical = Boolean((currentStudent.medicalConditions || '').trim());
                    if (!hasAllergies && !hasMedical && !noMedicalConditionConfirmed) {
                      e.preventDefault();
                      setStepValidationError('Veuillez renseigner les informations médicales ou confirmer qu’aucune condition connue n’est à signaler.');
                    }
                  }}
                >
                  {isSaving ? 'Enregistrement...' : t('save', 'Enregistrer')}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Abandon Confirmation Modal */}
      <Modal isOpen={isConfirmAbandonOpen} onClose={() => setIsConfirmAbandonOpen(false)} title="Abandonner les modifications ?">
        <div style={{ padding: '1rem 0' }}>
          <p style={{ margin: '0 0 1.5rem 0', color: 'var(--text-color)' }}>
            Les informations saisies ne seront pas enregistrées.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" className="secondary" onClick={() => setIsConfirmAbandonOpen(false)}>
              Continuer la saisie
            </button>
            <button
              type="button"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
              onClick={() => {
                setIsConfirmAbandonOpen(false);
                setModalOpen(false);
              }}
            >
              Abandonner
            </button>
          </div>
        </div>
      </Modal>

      {/* Excel Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => {setImportModalOpen(false); setPreviewStudents(null); setImportReport(null);}} title="Importation d'élèves depuis Excel">
        {!previewStudents ? (
          <form onSubmit={handleImportSubmit}>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#eef2ff', borderRadius: '4px', border: '1px solid var(--primary-color)' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 500 }}>Étape 1 : Format de votre fichier Excel (.xlsx)</p>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Pour garantir la compatibilité, téléchargez notre modèle standardisé contenant les barèmes et la liste des classes autorisées.
              </p>
              <button type="button" onClick={() => {
                const wsDataEleves = [
                  [
                    'matricule', 'nom', 'prenom', 'sexe', 'date_naissance', 'section', 'classe', 'cycle', 'annee_scolaire', 'statut_eleve', 'nom_parent', 'telephone_parent', 'quartier',
                    'inscription_attendue', 'inscription_payee', 'scolarite_annuelle', 'tranche_1', 'tranche_2', 'tranche_3', 'transport', 'transport_mensuel', 'tenue_gratuite',
                    'adresse', 'ancien_etablissement', 'redoublant', 'contact_urgence', 'allergies', 'probleme_medical', 'observations'
                  ],
                  [
                    'MAT-001', 'Dupont', 'Jean', 'M', '15/05/2015', 'francophone', 'CM2', 'primary', '2026-2027', 'nouveau', 'Paul Dupont', '650336558', 'Bastos',
                    15000, 15000, 90000, 50000, 40000, 0, 0, 0, 0,
                    'Bastos', 'Ecole Alpha', 'Non', '699887766', 'Aucune', 'Aucun', 'Excellent élève'
                  ],
                  [
                    'MAT-002', 'Smith', 'Jane', 'F', '20/10/2016', 'anglophone', 'Class 1', 'primary', '2026-2027', 'ancien', 'John Smith', '677889900', 'Bonamoussadi',
                    15000, 0, 85000, 40000, 30000, 15000, 0, 0, 0,
                    'Bonamoussadi', '', 'Non', '', '', '', ''
                  ]
                ];

                const activeClasses = db.classes.filter(c => c.isActive !== false);
                const wsDataClasses = [
                  ['nom', 'section', 'cycle', 'educationType', 'levelOrder'],
                  ...activeClasses.map(c => [c.name, c.type, c.cycle || '', c.educationType || '', c.levelOrder || ''])
                ];

                const wsDataBareme = [
                  ['section', 'classe', 'inscription_attendue', 'scolarite_annuelle', 'tranche_1', 'tranche_2', 'tranche_3', 'transport_mensuel'],
                  ['anglophone', 'Pre-Nursery', 15000, 130000, 60000, 40000, 20000, 0],
                  ['anglophone', 'Nursery 1', 15000, 115000, 50000, 40000, 25000, 0],
                  ['anglophone', 'Class 1', 15000, 85000, 40000, 30000, 15000, 0],
                  ['anglophone', 'Class 6', 15000, 90000, 50000, 40000, 0, 0],
                  ['francophone', 'SIL', 15000, 85000, 40000, 30000, 15000, 0],
                  ['francophone', 'CM2', 15000, 90000, 50000, 40000, 0, 0],
                  ['francophone', '6ème', 15000, 115000, 50000, 40000, 25000, 0],
                  ['francophone', '5ème', 15000, 120000, 55000, 40000, 25000, 0]
                ];

                const wb = XLSX.utils.book_new();
                const wsEleves = XLSX.utils.aoa_to_sheet(wsDataEleves);
                const wsClasses = XLSX.utils.aoa_to_sheet(wsDataClasses);
                const wsBareme = XLSX.utils.aoa_to_sheet(wsDataBareme);

                XLSX.utils.book_append_sheet(wb, wsEleves, 'Eleves');
                XLSX.utils.book_append_sheet(wb, wsClasses, 'Classes_Autorisees');
                XLSX.utils.book_append_sheet(wb, wsBareme, 'Bareme_Frais');

                XLSX.writeFile(wb, 'Modele_Import_Eleves.xlsx');
              }} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-color)', fontSize: '0.85rem' }}>
                📥 Télécharger le modèle d'import élèves (.xlsx)
              </button>
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
            {importReport && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-color)' }}>Rapport de Validation de l'Import</h4>
                <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: 0 }}>
                  <li>Lignes lues dans le fichier : <strong>{importReport.totalRead}</strong></li>
                  <li style={{ color: 'var(--success)' }}>Élèves valides prêts à importer : <strong>{importReport.readyCount}</strong></li>
                  {importReport.duplicates > 0 && <li style={{ color: '#d97706' }}>Doublons ignorés : <strong>{importReport.duplicates}</strong></li>}
                </ul>

                {importReport.errors.length > 0 && (
                  <div style={{ marginTop: '1rem' }}>
                    <h5 style={{ margin: '0 0 0.5rem 0', color: 'var(--danger)' }}>Alertes et Rejets :</h5>
                    <div style={{ maxHeight: '120px', overflowY: 'auto', background: '#fffefc', padding: '0.5rem', border: '1px solid #fee2e2', borderRadius: '4px', color: '#b91c1c', fontSize: '0.85rem' }}>
                      {importReport.errors.map((err, idx) => (
                        <div key={idx} style={{ marginBottom: '0.25rem' }}>⚠️ {err}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ background: '#f8f9fa', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Matricule</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Nom complet</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Classe Excel (Brute)</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Classe Détectée</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Pension Attendue</th>
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
                        <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                          {(s.tuitionExpected || 0).toLocaleString('fr-FR')} FCFA
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button type="button" className="secondary" onClick={() => { setPreviewStudents(null); setImportReport(null); }}>Retour</button>
              <button type="button" onClick={handleConfirmImport} disabled={previewStudents.length === 0} style={{ background: 'var(--success)', borderColor: 'var(--success)' }}>Confirmer l'importation</button>
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
