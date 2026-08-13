import React, { useRef, useState } from 'react';
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
import { escapeCsvCell, sanitizeCsvFilenameSegment, getGuardianRelationshipLabel, getStudentStatusLabel } from '../utils/studentCsvExport';
import { db as firestoreDb } from '../db/firebase';
import { doc, setDoc, updateDoc, Timestamp, serverTimestamp, writeBatch } from 'firebase/firestore';
import { resolveStudentEnrollmentAcademicYear } from '../utils/studentEnrollment';
import {
  acquireStudentSubmissionLock,
  createStudentAtomically,
  normalizeStudentMatricule,
  releaseStudentSubmissionLock
} from '../services/studentCreation';

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

const normalizeForComparison = (str: string): string => {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, ' ');
};

const normalizeImportedBirthDate = (rawValue: unknown): string | null => {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  let year = 0;
  let month = 0;
  let day = 0;

  if (rawValue instanceof Date) {
    year = rawValue.getFullYear();
    month = rawValue.getMonth() + 1;
    day = rawValue.getDate();
  } else if (typeof rawValue === 'number') {
    if (rawValue <= 0) return null;
    try {
      const parsed = XLSX.SSF.parse_date_code(Math.floor(rawValue));
      if (!parsed) return null;
      year = parsed.y;
      month = parsed.m;
      day = parsed.d;
    } catch {
      return null;
    }
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    // YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      year = Number(ymdMatch[1]);
      month = Number(ymdMatch[2]);
      day = Number(ymdMatch[3]);
    } else {
      // DD-MM-YYYY or DD/MM/YYYY
      const dmyMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
      if (dmyMatch) {
        year = Number(dmyMatch[3]);
        month = Number(dmyMatch[2]);
        day = Number(dmyMatch[1]);
      } else {
        return null;
      }
    }
  } else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > 31) {
    return null;
  }

  // Strict Calendar Validation
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    return null;
  }

  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  const isoStr = `${year}-${paddedMonth}-${paddedDay}`;

  // Today check in YYYY-MM-DD
  const today = new Date();
  const localYear = today.getFullYear();
  const localMonth = String(today.getMonth() + 1).padStart(2, '0');
  const localDay = String(today.getDate()).padStart(2, '0');
  const todayStr = `${localYear}-${localMonth}-${localDay}`;

  if (isoStr > todayStr) {
    return null;
  }

  return isoStr;
};

const toImportedStudentPayload = (student: Student, schoolId: string): Student => {
  if (!student.studentLastName?.trim()) {
    throw new Error("Nom de l'élève obligatoire");
  }
  if (!student.studentFirstName?.trim()) {
    throw new Error("Prénom de l'élève obligatoire");
  }
  if (!student.gender) {
    throw new Error("Sexe de l'élève obligatoire");
  }
  if (student.gender !== 'M' && student.gender !== 'F') {
    throw new Error("Sexe de l'élève invalide");
  }
  const validatedDob = normalizeImportedBirthDate(student.dob);
  if (!validatedDob) {
    throw new Error("Date de naissance invalide ou absente");
  }
  if (!student.section) {
    throw new Error("Section scolaire invalide ou absente");
  }
  if (student.section !== 'francophone' && student.section !== 'anglophone') {
    throw new Error("Section scolaire invalide ou absente");
  }
  if (!student.classId) {
    throw new Error("Classe de l'élève obligatoire");
  }
  if (!student.parentName?.trim()) {
    throw new Error("Nom du responsable légal obligatoire");
  }

  const normalizedLastName = student.studentLastName.trim().replace(/\s+/g, ' ');
  const normalizedFirstName = student.studentFirstName.trim().replace(/\s+/g, ' ');
  const normalizedName = `${normalizedLastName} ${normalizedFirstName}`
    .trim()
    .replace(/\s+/g, ' ');

  const normalizedMatricule = student.matricule?.trim();
  const finalMatricule = normalizedMatricule && normalizedMatricule !== '-'
    ? normalizedMatricule
    : '-';

  const payload: Student = {
    id: student.id,
    schoolId,
    schoolingStatus: 'active',
    matricule: finalMatricule,
    studentLastName: normalizedLastName,
    studentFirstName: normalizedFirstName,
    name: normalizedName,
    gender: student.gender,
    dob: student.dob.trim(),
    section: student.section,
    classId: student.classId,
    studentStatus: 'nouveau',
    parentName: student.parentName.trim()
  };

  if (student.parentPhone?.trim()) {
    payload.parentPhone = student.parentPhone.trim();
  }

  let cleanedEmails: string[] | undefined;
  if (student.parentEmails && student.parentEmails.length > 0) {
    const trimmed = student.parentEmails
      .map(email => email?.trim())
      .filter(email => email !== undefined && email !== '');
    const unique = Array.from(new Set(trimmed));
    if (unique.length > 0) {
      cleanedEmails = unique;
    }
  }
  if (cleanedEmails) {
    payload.parentEmails = cleanedEmails;
  }

  if (student.address?.trim()) {
    payload.address = student.address.trim();
  }

  return payload;
};

const Students: React.FC = () => {
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingStudentOriginal, setEditingStudentOriginal] = useState<Student | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [isDuplicateConfirmOpen, setIsDuplicateConfirmOpen] = useState(false);
  const [, setRefresh] = useState(0);
  const { db, addStudentsLocal, updateStudentLocal, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();

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

  const forceCloseStudentModal = () => {
    setIsDuplicateConfirmOpen(false);
    setModalOpen(false);
  };

  const requestCloseStudentModal = () => {
    if (isSaving) return;
    const currentSnap = JSON.stringify({ currentStudent, parentEmailsInput });
    if (currentSnap !== initialSnapshot) {
      setIsConfirmAbandonOpen(true);
    } else {
      forceCloseStudentModal();
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  type SchoolingStatusFilter = 'active' | 'inactive' | 'all';
  const [schoolingStatusFilter, setSchoolingStatusFilter] = useState<SchoolingStatusFilter>('active');

  const [selectedStudentForStatus, setSelectedStudentForStatus] = useState<Student | null>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [departureReason, setDepartureReason] = useState<'school_change' | 'graduated' | 'withdrawn' | 'other' | ''>('');
  const [departureDate, setDepartureDate] = useState('');
  const [departureNote, setDepartureNote] = useState('');
  const [isStatusSaving, setIsStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const getStudentSchoolingStatus = (student: Student): 'active' | 'inactive' => {
    return student.schoolingStatus ?? 'active';
  };

  const getDepartureReasonLabel = (reason?: string): string => {
    if (reason === 'school_change') return 'Changement d’établissement';
    if (reason === 'graduated') return 'Fin de cycle';
    if (reason === 'withdrawn') return 'Retrait de l’élève';
    if (reason === 'other') return 'Autre';
    return '';
  };

  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!openRowMenuId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenRowMenuId(null);
    };
    const handleClickOutside = () => setOpenRowMenuId(null);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [openRowMenuId]);

  const effectiveRole = typeof currentUser?.role === 'string' ? currentUser.role.trim() : '';
  const canManageStudents = ['superAdmin', 'owner', 'director', 'secretary'].includes(effectiveRole);
  const canViewSensitive = currentUser && currentUser.role !== 'boardViewer';
  const canChangeStudentActiveStatus =
    !!effectiveRole &&
    ['superAdmin', 'owner', 'director'].includes(effectiveRole);

  if (!currentUser) return null;

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
    const term = searchTerm.toLowerCase().trim();
    const className = (db.classes.find(c => c.id === student.classId)?.name || '').toLowerCase();
    const matchSearch = !term ||
      (student.name || '').toLowerCase().includes(term) ||
      (student.studentLastName || '').toLowerCase().includes(term) ||
      (student.studentFirstName || '').toLowerCase().includes(term) ||
      (student.matricule || '').toLowerCase().includes(term) ||
      className.includes(term) ||
      (student.parentName || '').toLowerCase().includes(term) ||
      (student.fatherName || '').toLowerCase().includes(term) ||
      (student.motherName || '').toLowerCase().includes(term) ||
      (student.parentPhone || '').includes(term);

    const matchSection = sectionFilter === 'all' || student.section === sectionFilter;
    const matchClass = classFilter === 'all' || student.classId === classFilter;
    const matchStatus = statusFilter === 'all' || (student.studentStatus || 'nouveau') === statusFilter;
    const matchSchoolingStatus = schoolingStatusFilter === 'all' ||
      getStudentSchoolingStatus(student) === schoolingStatusFilter;
    return matchSearch && matchSection && matchClass && matchStatus && matchSchoolingStatus;
  });

  const exportableStudents = filteredStudents.filter(
    student =>
      Boolean(currentSchool?.id) &&
      student.schoolId === currentSchool?.id
  );

  const handleOpenModal = (student?: Student) => {
    setCurrentStep(1);
    setStepValidationError(null);
    setNoMedicalConditionConfirmed(false);
    let initStudent: Partial<Student>;
    let initEmails = '';

    if (student) {
      setIsEditing(true);
      setEditingStudentOriginal(student);
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
      setEditingStudentOriginal(null);
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

  const handleSave = async (
    e?: React.FormEvent,
    confirmProbableDuplicate = false
  ) => {
    e?.preventDefault();
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

    if (!acquireStudentSubmissionLock(saveInFlightRef)) return;
    setIsSaving(true);
    try {
      const normalizedEmails = normalizeParentEmails(parentEmailsInput);
      const parentPhone = currentStudent.parentPhone ? (normalizeCameroonPhoneNumber(currentStudent.parentPhone) || currentStudent.parentPhone) : '';
      const matricule = currentStudent.matricule?.trim() ?? '';
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
        const getPatchValue = <K extends keyof Student>(
          key: K,
          defaultValue: Student[K]
        ): Student[K] | undefined => {
          const originalValue = editingStudentOriginal ? editingStudentOriginal[key] : undefined;
          const currentValue = finalStudent[key];

          if (originalValue === undefined) {
            if (currentValue === defaultValue || currentValue === '' || currentValue === undefined) {
              return undefined;
            }
            return currentValue;
          }
          return currentValue;
        };

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
          guardianRelationship: getPatchValue('guardianRelationship', 'other'),
          guardianRelationshipDetails: getPatchValue('guardianRelationshipDetails', ''),
          parentName: finalStudent.parentName,
          parentEmails: finalStudent.parentEmails,
          parentPhone: finalStudent.parentPhone,
          address: finalStudent.address,
          emergencyContact: finalStudent.emergencyContact,
          allergies: finalStudent.allergies,
          medicalConditions: finalStudent.medicalConditions,
          studentStatus: getPatchValue('studentStatus', 'nouveau'),
          registrationYear: getPatchValue('registrationYear', '2026-2027')
        };
        const patchData = Object.fromEntries(Object.entries(rawPatchData).filter(([, v]) => v !== undefined));
        await updateDoc(studentRef, patchData);

        // Mutate local state for UI update
        const updatedLocalStudent = {
          ...editingStudentOriginal,
          ...patchData
        } as Student;
        const idx = db.students.findIndex(s => s.id === finalStudent.id);
        if (idx !== -1) db.students[idx] = updatedLocalStudent;

      } else {
        if (!currentSchool) throw new Error("École non définie.");
        const activeAcademicYear = resolveStudentEnrollmentAcademicYear(db.academicYears, currentSchool);
        if (!activeAcademicYear) {
          throw new Error("ACTIVE_ACADEMIC_YEAR_REQUIRED");
        }
        const studentId = finalStudent.id || crypto.randomUUID();
        finalStudent.id = studentId;
        finalStudent.schoolId = currentSchool.id;
        finalStudent.academicYearId = activeAcademicYear.id;
        finalStudent.registrationYear = activeAcademicYear.name;
        finalStudent.schoolingStatus = 'active';
        const currentCountDisplay = currentSchool.studentCount ?? db.students.length;
        if (isStudentLimitReached(currentSchool, currentCountDisplay)) {
          throw new Error("QUOTA_EXCEEDED");
        }

        const optionalStudentFields: Partial<Student> = {
          placeOfBirth: finalStudent.placeOfBirth,
          fatherName: finalStudent.fatherName,
          fatherPhone: finalStudent.fatherPhone,
          fatherProfession: finalStudent.fatherProfession,
          motherName: finalStudent.motherName,
          motherPhone: finalStudent.motherPhone,
          motherProfession: finalStudent.motherProfession,
          guardianRelationship: finalStudent.guardianRelationship,
          guardianRelationshipDetails: finalStudent.guardianRelationshipDetails,
          parentEmails: finalStudent.parentEmails,
          address: finalStudent.address,
          emergencyContact: finalStudent.emergencyContact,
          allergies: finalStudent.allergies,
          medicalConditions: finalStudent.medicalConditions,
          registrationFeeExpected: finalStudent.registrationFeeExpected,
          tuitionExpected: finalStudent.tuitionExpected,
          feeT1: finalStudent.feeT1,
          feeT2: finalStudent.feeT2,
          feeT3: finalStudent.feeT3
        };
        const studentToSave = Object.fromEntries(Object.entries({
          id: studentId,
          schoolId: currentSchool.id,
          academicYearId: activeAcademicYear.id,
          registrationYear: activeAcademicYear.name,
          schoolingStatus: 'active',
          matricule: finalStudent.matricule,
          name: finalStudent.name,
          studentLastName: finalStudent.studentLastName,
          studentFirstName: finalStudent.studentFirstName,
          gender: finalStudent.gender,
          dob: finalStudent.dob,
          section: finalStudent.section,
          classId: finalStudent.classId,
          studentStatus: finalStudent.studentStatus || 'nouveau',
          parentName: finalStudent.parentName,
          parentPhone: finalStudent.parentPhone,
          registrationFeePaid: 0,
          registrationFeeStatus: 'unpaid',
          ...optionalStudentFields
        }).filter(([, value]) => value !== undefined && value !== ''));

        const creationResult = await createStudentAtomically({
          firestore: firestoreDb,
          studentId,
          schoolId: currentSchool.id,
          actorId: currentUser.id,
          requestedMatricule: currentStudent.matricule,
          studentData: studentToSave,
          confirmProbableDuplicate,
          isMatriculeKnown: normalizedMatricule => db.students.some(student => {
            if (
              student.schoolId !== currentSchool.id
              || student.id === studentId
              || !student.matricule
            ) {
              return false;
            }
            try {
              return normalizeStudentMatricule(student.matricule) === normalizedMatricule;
            } catch {
              return false;
            }
          })
        });
        finalStudent.matricule = creationResult.matricule;
        finalStudent.matriculeNormalized = creationResult.matriculeNormalized;
        finalStudent.matriculeReservationId = creationResult.matriculeReservationId;
        finalStudent.duplicateFingerprint = creationResult.duplicateFingerprint;
        finalStudent.duplicateReservationId = creationResult.duplicateReservationId;

        // Mutate local state
        if (!db.students.some(student => student.id === studentId)) {
          db.students.push(finalStudent);
          if (creationResult.created) {
            currentSchool.studentCount = (currentSchool.studentCount || 0) + 1;
          }
        }
      }

      setRefresh(r => r + 1);
      forceCloseStudentModal();

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
      } else if (message === 'ACTIVE_ACADEMIC_YEAR_REQUIRED') {
        alert("Création impossible : aucune année académique active valide n'est configurée pour cette école.");
      } else if (message === 'MATRICULE_ALREADY_EXISTS') {
        alert("Création impossible : ce matricule est déjà utilisé dans cette école.");
      } else if (message === 'AUTOMATIC_MATRICULE_EXHAUSTED') {
        alert("Création impossible : aucun matricule automatique unique n’a pu être réservé. Veuillez réessayer.");
      } else if (message === 'PROBABLE_DUPLICATE') {
        setIsDuplicateConfirmOpen(true);
      } else if (message === 'STUDENT_ID_CONFLICT') {
        alert("Création impossible : l’identifiant de cette saisie est déjà utilisé.");
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
      releaseStudentSubmissionLock(saveInFlightRef);
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!canChangeStudentActiveStatus) {
      setStatusError("Action refusée : Permissions insuffisantes.");
      return;
    }
    if (!currentSchool?.id || !selectedStudentForStatus?.id) {
      setStatusError("Action impossible : École ou élève manquant.");
      return;
    }
    if (selectedStudentForStatus.schoolId !== currentSchool.id) {
      setStatusError("Action impossible : L'élève n'appartient pas à l'école active.");
      return;
    }
    if (getStudentSchoolingStatus(selectedStudentForStatus) !== 'active') {
      setStatusError("Action impossible : L'élève est déjà inactif.");
      return;
    }
    if (!departureReason) {
      setStatusError("Veuillez sélectionner un motif de départ.");
      return;
    }
    if (!departureDate) {
      setStatusError("Veuillez sélectionner une date de départ.");
      return;
    }
    if (!currentUser?.id) {
      setStatusError("Action impossible : Identifiant utilisateur introuvable.");
      return;
    }

    const targetId = selectedStudentForStatus.id;
    const targetName = selectedStudentForStatus.name;
    const actorId = currentUser.id;

    setIsStatusSaving(true);
    setStatusError(null);

    try {
      const studentRef = doc(firestoreDb, 'students', targetId);
      const patchData = {
        schoolingStatus: 'inactive' as const,
        departureReason,
        departureDate,
        departureNote: departureNote.trim(),
        deactivatedAt: serverTimestamp(),
        deactivatedBy: actorId
      };

      await updateDoc(studentRef, patchData);

      updateStudentLocal(targetId, {
        schoolingStatus: 'inactive',
        departureReason,
        departureDate,
        departureNote: departureNote.trim(),
        deactivatedBy: actorId
      });

      setIsDeactivateModalOpen(false);
      setSelectedStudentForStatus(null);
      setDepartureNote('');
      setDepartureDate('');
      setDepartureReason('');

      logAuditAction({
        action: 'DEACTIVATE_STUDENT',
        targetType: 'STUDENT',
        targetId,
        targetName
      });

      alert("Élève désactivé avec succès.");
    } catch (err: unknown) {
      console.error(err);
      setStatusError(getErrorMessage(err));
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleReactivate = async () => {
    if (!canChangeStudentActiveStatus) {
      setStatusError("Action refusée : Permissions insuffisantes.");
      return;
    }
    if (!currentSchool?.id || !selectedStudentForStatus?.id) {
      setStatusError("Action impossible : École ou élève manquant.");
      return;
    }
    if (selectedStudentForStatus.schoolId !== currentSchool.id) {
      setStatusError("Action impossible : L'élève n'appartient pas à l'école active.");
      return;
    }
    if (getStudentSchoolingStatus(selectedStudentForStatus) !== 'inactive') {
      setStatusError("Action impossible : L'élève est déjà actif.");
      return;
    }
    if (!currentUser?.id) {
      setStatusError("Action impossible : Identifiant utilisateur introuvable.");
      return;
    }

    const targetId = selectedStudentForStatus.id;
    const targetName = selectedStudentForStatus.name;
    const actorId = currentUser.id;

    setIsStatusSaving(true);
    setStatusError(null);

    try {
      const studentRef = doc(firestoreDb, 'students', targetId);
      const patchData = {
        schoolingStatus: 'active' as const,
        reactivatedAt: serverTimestamp(),
        reactivatedBy: actorId
      };

      await updateDoc(studentRef, patchData);

      updateStudentLocal(targetId, {
        schoolingStatus: 'active',
        reactivatedBy: actorId
      });

      setIsReactivateModalOpen(false);
      setSelectedStudentForStatus(null);

      logAuditAction({
        action: 'REACTIVATE_STUDENT',
        targetType: 'STUDENT',
        targetId,
        targetName
      });

      alert("Élève réactivé avec succès.");
    } catch (err: unknown) {
      console.error(err);
      setStatusError(getErrorMessage(err));
    } finally {
      setIsStatusSaving(false);
    }
  };

  const handleDeactivateStudent = async (student: Student) => {
    if (!currentUser || !currentSchool) return;

    if (!canChangeStudentActiveStatus) {
      alert("Action refusée : Vous n'avez pas les droits nécessaires pour effectuer cette action.");
      return;
    }

    if (confirm("Retirer cet élève de la liste des élèves actifs ?")) {
      try {
        const studentRef = doc(firestoreDb, 'students', student.id);
        const patchData = {
          schoolingStatus: 'inactive' as const,
          departureReason: 'withdrawn' as const,
          departureDate: new Date().toISOString().split('T')[0],
          departureNote: 'Retiré des élèves actifs',
          deactivatedAt: serverTimestamp(),
          deactivatedBy: currentUser.id
        };
        await updateDoc(studentRef, patchData);

        // Mutate local state
        const idx = db.students.findIndex(s => s.id === student.id);
        if (idx !== -1) {
          db.students[idx] = {
            ...db.students[idx],
            schoolingStatus: 'inactive',
            departureReason: 'withdrawn',
            departureDate: patchData.departureDate,
            departureNote: patchData.departureNote,
            deactivatedAt: new Date().toISOString(),
            deactivatedBy: currentUser.id
          };
        }
        setRefresh(r => r + 1);

        alert("Élève désactivé avec succès.");
        logAuditAction({
          action: 'DELETE_STUDENT',
          targetType: 'STUDENT',
          targetId: student.id,
          targetName: student.name
        });
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

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) {
      alert("Veuillez choisir un fichier Excel.");
      return;
    }
    if (!currentSchool?.id || !currentUser?.id) {
      alert("Action impossible : École ou utilisateur introuvable.");
      return;
    }
    if (!canManageStudents) {
      alert("Action refusée : Permissions insuffisantes.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });

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

          const getRawVal = (keywords: string[]) => {
            for (const key of Object.keys(row)) {
              const upperKey = key.toUpperCase();
              if (keywords.some(kw => upperKey.includes(kw))) {
                if (row[key] !== undefined && row[key] !== '') {
                  return row[key];
                }
              }
            }
            return undefined;
          };

          const nom = getVal(['NOM']);
          const prenom = getVal(['PRENOM']);
          const normalizedLastName = nom.trim().replace(/\s+/g, ' ');
          const normalizedFirstName = prenom.trim().replace(/\s+/g, ' ');

          if (!normalizedLastName) {
            errorsLog.push(`Ligne ${i + 1} : Nom de l'élève obligatoire.`);
            continue;
          }

          if (!normalizedFirstName) {
            errorsLog.push(`Ligne ${i + 1} : Prénom de l'élève obligatoire.`);
            continue;
          }

          const fullName = [normalizedLastName, normalizedFirstName].filter(Boolean).join(' ');

          // Validation Sexe
          const rawGender = getVal(['SEXE', 'GENRE']).toUpperCase().trim();
          let gender: 'M' | 'F' | '' = '';
          if (['M', 'MASCULIN', 'GARÇON', 'GARCON'].includes(rawGender)) {
            gender = 'M';
          } else if (['F', 'FÉMININ', 'FEMININ', 'FILLE'].includes(rawGender)) {
            gender = 'F';
          }

          if (!gender) {
            errorsLog.push(`Ligne ${i + 1} : Sexe de l'élève obligatoire ou non reconnu ("${rawGender}").`);
            continue;
          }

          // Validation Date de naissance
          const rawDob = getRawVal(['DATE DE NAISSANCE', 'DATE', 'DOB']);
          const normalizedDob = normalizeImportedBirthDate(rawDob);
          if (!normalizedDob) {
            errorsLog.push(`Ligne ${i + 1} : Date de naissance absente, invalide ou future.`);
            continue;
          }

          const classeNameRaw = getVal(['CLASSE']);
          const matricule = getVal(['MATRICULE']);
          const parentEmailsStr = getVal(['EMAIL PARENT', 'EMAILS PARENTS', 'EMAIL PARENT 1', 'EMAILPARENT', 'PARENT EMAIL', 'EMAIL']);
          const normalizedEmails = normalizeParentEmails(parentEmailsStr);

          // Validation classe prédéfinie et section
          let classId = '';
          let finalSection: 'francophone' | 'anglophone' | '' = '';
          let detectedClassName = '';

          if (classeNameRaw) {
            const match = normalizeClassName(classeNameRaw);
            if (match) {
              const matchedClasses = db.classes.filter(c =>
                c.schoolId === currentSchool.id &&
                (c.isActive === undefined || c.isActive !== false) &&
                c.name.toLowerCase() === match.matchedName.toLowerCase() &&
                c.type === match.section
              );
              if (matchedClasses.length === 1) {
                classId = matchedClasses[0].id;
                finalSection = matchedClasses[0].type;
                detectedClassName = matchedClasses[0].name;

                // Validation cohérence section
                if (!finalSection || (finalSection !== 'francophone' && finalSection !== 'anglophone')) {
                  errorsLog.push(`Ligne ${i + 1} : Section de la classe "${classeNameRaw}" absente ou incohérente.`);
                  continue;
                }
                const importSection = getVal(['SECTION'])?.toLowerCase();
                if (importSection && importSection !== finalSection) {
                  errorsLog.push(`Ligne ${i + 1} : Section contradictoire pour la classe "${classeNameRaw}" (Excel: "${importSection}", Classe: "${finalSection}").`);
                  continue;
                }
              } else if (matchedClasses.length > 1) {
                errorsLog.push(`Ligne ${i + 1} : Correspondance de classe ambiguë pour "${classeNameRaw}".`);
                continue;
              } else {
                errorsLog.push(`Ligne ${i + 1} : Classe "${classeNameRaw}" reconnue comme "${match.matchedName}" mais inactive ou absente de cette école.`);
                continue;
              }
            } else {
              errorsLog.push(`Ligne ${i + 1} : Format de classe "${classeNameRaw}" invalide.`);
              continue;
            }
          } else {
            errorsLog.push(`Ligne ${i + 1} : Classe non renseignée.`);
            continue;
          }

          // Validation Responsable (parentName) - CAS A
          const rawParentName = getVal(['TUTEUR', 'PARENT', 'NOMS DES PARENTS', 'NOM_PARENT']);
          if (!rawParentName || !rawParentName.trim()) {
            errorsLog.push(`Ligne ${i + 1} : Nom du responsable légal obligatoire.`);
            continue;
          }
          const parentName = rawParentName.trim().replace(/\s+/g, ' ');

          // Validation Téléphone parent
          const rawPhone = getVal(['CONTACT', 'TÉLÉPHONE', 'TELEPHONE', 'TEL', 'PHONE', 'TELEPHONE_PARENT']);
          if (!rawPhone || !rawPhone.trim()) {
            errorsLog.push(`Ligne ${i + 1} : Téléphone du responsable légal obligatoire.`);
            continue;
          }
          const normalizedPhone = normalizeCameroonPhoneNumber(rawPhone);
          if (!normalizedPhone) {
            errorsLog.push(`Ligne ${i + 1} : Téléphone parent "${rawPhone}" invalide.`);
            continue;
          }

          // Détection doublons
          const isValidMatricule = (m: string | undefined): boolean => {
            if (!m) return false;
            const cleaned = m.trim();
            return cleaned !== '' && cleaned !== '-';
          };

          const isMatriculeDuplicateInFile = isValidMatricule(matricule) && newStudents.some(s => isValidMatricule(s.matricule) && normalizeForComparison(s.matricule!) === normalizeForComparison(matricule!));
          const isMatriculeDuplicateInDb = isValidMatricule(matricule) && db.students.some(s => s.schoolId === currentSchool.id && isValidMatricule(s.matricule) && normalizeForComparison(s.matricule!) === normalizeForComparison(matricule!));

          const isDuplicateIdentityInFile = newStudents.some(s =>
            normalizeForComparison(s.studentLastName || '') === normalizeForComparison(normalizedLastName) &&
            normalizeForComparison(s.studentFirstName || '') === normalizeForComparison(normalizedFirstName) &&
            normalizeForComparison(s.dob) === normalizeForComparison(normalizedDob) &&
            s.classId === classId
          );

          const isDuplicateIdentityInDb = db.students.some(s =>
            s.schoolId === currentSchool.id &&
            normalizeForComparison(s.studentLastName || s.name) === normalizeForComparison(normalizedLastName) &&
            normalizeForComparison(s.studentFirstName || '') === normalizeForComparison(normalizedFirstName) &&
            normalizeForComparison(s.dob) === normalizeForComparison(normalizedDob) &&
            s.classId === classId
          );

          if (isMatriculeDuplicateInFile || isMatriculeDuplicateInDb) {
            duplicateCount++;
            errorsLog.push(`Ligne ${i + 1} : Doublon matricule détecté pour "${matricule}".`);
            continue;
          }

          if (isDuplicateIdentityInFile || isDuplicateIdentityInDb) {
            duplicateCount++;
            errorsLog.push(`Ligne ${i + 1} : Doublon d'identité détecté pour l'élève "${fullName}".`);
            continue;
          }

          const normalizedMatricule = matricule?.trim();
          const finalMatricule = normalizedMatricule && normalizedMatricule !== '-'
            ? normalizedMatricule
            : '-';

          // Construction explicite champ par champ du payload Student
          const studentPayload: Student = {
            id: crypto.randomUUID(),
            schoolId: currentSchool.id,
            schoolingStatus: 'active',
            matricule: finalMatricule,
            studentLastName: normalizedLastName,
            studentFirstName: normalizedFirstName,
            name: fullName,
            gender: gender,
            dob: normalizedDob,
            section: finalSection,
            classId: classId,
            studentStatus: 'nouveau',
            parentName: parentName,
            parentPhone: normalizedPhone,
            parentEmails: normalizedEmails,
            address: getVal(['ADRESSE', 'QUARTIER', 'ADRESSE_PARENT']) || ''
          };

          newStudents.push({
            ...studentPayload,
            rawClassName: classeNameRaw,
            detectedClassName: detectedClassName
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

  const handleConfirmImport = async () => {
    if (!previewStudents || previewStudents.length === 0) return;

    if (!currentSchool?.id || !currentUser?.id) {
      alert("Erreur : École active ou utilisateur non connecté.");
      return;
    }
    if (!canManageStudents) {
      alert("Action refusée : Permissions insuffisantes.");
      return;
    }

    if (previewStudents.length > 450) {
      alert("Le lot d'importation dépasse la limite de 450 élèves. Veuillez diviser votre fichier.");
      return;
    }

    // Quota Check
    const remainingSlots = getStudentLimit(currentSchool) - db.students.length;
    if (previewStudents.length > remainingSlots) {
      alert(`L'import dépasse votre limite SaaS. Places restantes : ${remainingSlots}. Éditez votre fichier pour ne pas dépasser la limite.`);
      return;
    }

    setIsSaving(true);

    try {
      const persistedStudents: Student[] = [];

      for (const student of previewStudents) {
        const importedPayload = toImportedStudentPayload(student, currentSchool.id);
        persistedStudents.push(importedPayload);
      }

      // Contrôle de sécurité exhaustif de tout le lot avant d'initier le batch
      for (const student of persistedStudents) {
        if (!student.id) {
          throw new Error("Violation de sécurité : ID élève manquant.");
        }
        if (student.schoolId !== currentSchool.id) {
          throw new Error("Violation de sécurité : Un élève ciblant une autre école a été détecté dans le lot.");
        }
        if (!student.studentLastName?.trim()) {
          throw new Error("Erreur de données : Le nom de l'élève est obligatoire.");
        }
        if (!student.studentFirstName?.trim()) {
          throw new Error("Erreur de données : Le prénom de l'élève est obligatoire.");
        }
        const expectedName = `${student.studentLastName.trim()} ${student.studentFirstName.trim()}`.trim().replace(/\s+/g, ' ');
        if (student.name !== expectedName) {
          throw new Error("Erreur de données : Cohérence du nom complet invalide.");
        }
        if (student.gender !== 'M' && student.gender !== 'F') {
          throw new Error("Erreur de données : Sexe de l'élève invalide.");
        }
        if (!student.dob || !/^\d{4}-\d{2}-\d{2}$/.test(student.dob)) {
          throw new Error("Erreur de données : Format de date de naissance invalide.");
        }
        const dDate = new Date(student.dob);
        if (isNaN(dDate.getTime()) || dDate > new Date()) {
          throw new Error("Erreur de données : Date de naissance invalide ou dans le futur.");
        }
        if (student.section !== 'francophone' && student.section !== 'anglophone') {
          throw new Error("Erreur de données : Section scolaire invalide.");
        }
        if (!student.classId) {
          throw new Error("Erreur de données : La classe de l'élève est obligatoire.");
        }
        const cls = db.classes.find(c => c.id === student.classId);
        if (!cls || cls.schoolId !== currentSchool.id || cls.isActive === false || cls.type !== student.section) {
          throw new Error("Erreur de données : Classe non trouvée, inactive ou incohérente avec la section.");
        }

        // Données financières interdites
        const financialFields = [
          "registrationFeeExpected", "registrationFeePaid", "registrationFeeStatus",
          "tuitionExpected", "tuitionPaid", "tuitionStatus",
          "feeT1", "feeT2", "feeT3", "feeTransport", "feeUniforms"
        ];
        for (const f of financialFields) {
          if ((student as unknown as Record<string, unknown>)[f] !== undefined) {
            throw new Error(`Violation de sécurité : Donnée financière "${f}" interdite dans l'importation.`);
          }
        }

        // Données médicales interdites
        if (student.allergies !== undefined || student.medicalConditions !== undefined) {
          throw new Error("Violation de sécurité : Donnée médicale interdite dans l'importation.");
        }

        // Données de transport interdites
        if (student.usesTransport !== undefined || student.transportMonthlyFee !== undefined) {
          throw new Error("Violation de sécurité : Donnée de transport interdite dans l'importation.");
        }

        // Données de départ interdites
        if (student.departureReason !== undefined || student.departureDate !== undefined) {
          throw new Error("Violation de sécurité : Donnée de départ/désactivation interdite dans l'importation.");
        }

        // Aucune valeur undefined autorisée
        for (const [key, value] of Object.entries(student)) {
          if (value === undefined) {
            throw new Error(`Erreur d'intégrité : Propriété "${key}" à undefined détectée.`);
          }
        }
      }

      const batch = writeBatch(firestoreDb);

      for (const student of persistedStudents) {
        const studentRef = doc(firestoreDb, 'students', student.id);
        batch.set(studentRef, student);
      }

      await batch.commit();

      addStudentsLocal(persistedStudents);
      setPreviewStudents(null);
      setImportReport(null);
      setImportModalOpen(false);
      setExcelFile(null);
      alert("Importation finalisée avec succès !");
    } catch (err: unknown) {
      console.error(err);
      alert("Erreur lors de l'enregistrement du lot. Zéro élève n'a été importé. Détails : " + getErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const exportInscriptionsCSV = () => {
    if (!canManageStudents) {
      alert("Action refusée : Permissions insuffisantes.");
      return;
    }
    if (!currentSchool?.id) {
      alert("Aucune école active sélectionnée.");
      return;
    }
    if (exportableStudents.length === 0) {
      alert("Aucune inscription à exporter.");
      return;
    }

    try {
      const headers = [
        'Matricule', 'Nom', 'Prénom(s)', 'Nom complet', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Section', 'Classe',
        'Statut élève', 'Année scolaire', 'Père', 'Tél Père', 'Profession Père', 'Mère', 'Tél Mère', 'Profession Mère', 'Responsable légal', 'Relation', 'Téléphone responsable', 'Email parent',
        'Adresse', 'Contact urgence', 'Statut scolaire', 'Date de départ', 'Motif de départ'
      ];

      const rows = [
        headers.map(h => escapeCsvCell(h))
      ];

      exportableStudents.forEach(student => {
        const classObj = db.classes.find(c => c.id === student.classId && c.schoolId === currentSchool.id);
        const className = classObj ? classObj.name : 'Classe introuvable';
        const parentEmail = (student.parentEmails || [])[0] || '';
        const exportedRegistrationYear = student.registrationYear?.trim() || '';

        rows.push([
          escapeCsvCell(student.matricule || '-'),
          escapeCsvCell(student.studentLastName || ''),
          escapeCsvCell(student.studentFirstName || ''),
          escapeCsvCell(student.name),
          escapeCsvCell(student.gender),
          escapeCsvCell(student.dob),
          escapeCsvCell(student.placeOfBirth || ''),
          escapeCsvCell(student.section),
          escapeCsvCell(className),
          escapeCsvCell(getStudentStatusLabel(student.studentStatus)),
          escapeCsvCell(exportedRegistrationYear),
          escapeCsvCell(student.fatherName || ''),
          escapeCsvCell(student.fatherPhone || ''),
          escapeCsvCell(student.fatherProfession || ''),
          escapeCsvCell(student.motherName || ''),
          escapeCsvCell(student.motherPhone || ''),
          escapeCsvCell(student.motherProfession || ''),
          escapeCsvCell(student.parentName),
          escapeCsvCell(getGuardianRelationshipLabel(student.guardianRelationship)),
          escapeCsvCell(student.parentPhone),
          escapeCsvCell(parentEmail),
          escapeCsvCell(student.address || ''),
          escapeCsvCell(student.emergencyContact || ''),
          escapeCsvCell(getStudentSchoolingStatus(student) === 'inactive' ? 'Inactif' : 'Actif'),
          escapeCsvCell(student.departureDate || ''),
          escapeCsvCell(getDepartureReasonLabel(student.departureReason))
        ]);
      });

      const csvContent = '\uFEFFsep=;\n' + rows.map(e => e.join(";")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      let url: string | null = null;
      let link: HTMLAnchorElement | null = null;
      const isItalo = currentSchool?.name?.toLowerCase().includes('italo');
      const sanitizedYear = sanitizeCsvFilenameSegment(currentSchool?.academicYear);
      const suffix = sanitizedYear ? `-${sanitizedYear}` : '';
      const filename = isItalo ? `italo-inscriptions${suffix}.csv` : `inscriptions${suffix}.csv`;

      try {
        url = URL.createObjectURL(blob);
        link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
      } finally {
        link?.remove();
        if (url) {
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue lors de la génération de l'export.");
    }
  };

  const normalizeWhatsAppPhone = (rawPhone?: string): string | null => {
    if (!rawPhone) return null;
    const trimmed = rawPhone.trim();
    if (!trimmed) return null;

    const compact = trimmed.replace(/[\s\-().]/g, '');
    const hadPlusPrefix = compact.startsWith('+');
    const hadInternationalAccessPrefix = compact.startsWith('00');

    let digits = compact;
    if (hadPlusPrefix) {
      digits = compact.slice(1);
    } else if (hadInternationalAccessPrefix) {
      digits = compact.slice(2);
    }

    // Refuser si digits contient autre chose que des chiffres
    if (!/^\d+$/.test(digits)) {
      return null;
    }

    // A. Mobile camerounais local
    // - exactement neuf chiffres
    // - commence par 6
    // - préfixer 237
    if (digits.length === 9 && digits.startsWith('6') && !hadPlusPrefix && !hadInternationalAccessPrefix) {
      return '237' + digits;
    }

    // B. Numéro camerounais international
    // - format exact 2376XXXXXXXX
    // - douze chiffres au total
    // - accepter avec +237, 00237 ou 237
    if (digits.length === 12 && digits.startsWith('2376')) {
      return digits;
    }

    // C. Autre numéro international
    // - doit avoir été explicitement fourni avec + ou 00
    // - format E.164: /^[1-9]\d{7,14}$/
    if ((hadPlusPrefix || hadInternationalAccessPrefix) && /^[1-9]\d{7,14}$/.test(digits)) {
      // S'assurer que si c'est du Cameroun, c'est obligatoirement du type Cameroun international (2376...)
      if (digits.startsWith('237') && !digits.startsWith('2376')) {
        return null;
      }
      return digits;
    }

    // D. Rejeter tout le reste
    return null;
  };

  type WhatsAppPhoneResult = {
    rawPhone: string;
    normalizedPhone: string | null;
    source: 'guardian' | 'father' | 'mother' | null;
    reason?: 'missing' | 'invalid';
  };

  const getStudentWhatsAppPhone = (student: Student): WhatsAppPhoneResult => {
    // 1. Normaliser parentPhone
    const parentNormalized = normalizeWhatsAppPhone(student.parentPhone);
    if (parentNormalized) {
      return {
        rawPhone: student.parentPhone || '',
        normalizedPhone: parentNormalized,
        source: 'guardian'
      };
    }

    // Si parentPhone est absent OU invalide :
    // Vérifier les tuteurs si guardianRelationship correspond
    if (student.guardianRelationship === 'father') {
      const fatherNormalized = normalizeWhatsAppPhone(student.fatherPhone);
      if (fatherNormalized) {
        return {
          rawPhone: student.fatherPhone || '',
          normalizedPhone: fatherNormalized,
          source: 'father'
        };
      }
    } else if (student.guardianRelationship === 'mother') {
      const motherNormalized = normalizeWhatsAppPhone(student.motherPhone);
      if (motherNormalized) {
        return {
          rawPhone: student.motherPhone || '',
          normalizedPhone: motherNormalized,
          source: 'mother'
        };
      }
    }

    // Déterminer la raison
    // Y a-t-il au moins un candidat autorisé renseigné ?
    const hasParentPhone = !!(student.parentPhone && student.parentPhone.trim());
    const hasFatherAuth = student.guardianRelationship === 'father' && !!(student.fatherPhone && student.fatherPhone.trim());
    const hasMotherAuth = student.guardianRelationship === 'mother' && !!(student.motherPhone && student.motherPhone.trim());

    if (hasParentPhone || hasFatherAuth || hasMotherAuth) {
      // Au moins un renseigné mais tous invalides
      const activeRaw = hasParentPhone
        ? student.parentPhone
        : (hasFatherAuth ? student.fatherPhone : student.motherPhone);
      return {
        rawPhone: activeRaw || '',
        normalizedPhone: null,
        source: null,
        reason: 'invalid'
      };
    }

    return {
      rawPhone: '',
      normalizedPhone: null,
      source: null,
      reason: 'missing'
    };
  };

  const handleWhatsAppContact = (student: Student) => {
    const phoneInfo = getStudentWhatsAppPhone(student);
    if (!phoneInfo.normalizedPhone) return;

    const schoolReference = currentSchool?.name?.trim()
      ? `l’établissement ${currentSchool.name.trim()}`
      : 'votre établissement';

    const message = `Bonjour, nous vous contactons au sujet de l’élève ${student.name}. Merci de vous rapprocher de ${schoolReference}.`;

    const url = `https://wa.me/${phoneInfo.normalizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('students', 'Élèves')}</h1>
          <div style={{ padding: '0.4rem 0.8rem', background: limitReached ? '#fee2e2' : '#eef2ff', color: limitReached ? '#dc2626' : '#4338ca', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 500 }}>
            {filteredStudents.length} {filteredStudents.length <= 1 ? 'élève inscrit' : 'élèves inscrits'}
            {currentSchool?.isInternalSchool || currentSchool?.subscriptionPlan === 'premium'
              ? ' · Offre Premium illimitée'
              : ` sur ${getStudentLimit(currentSchool)} (${limitLabel})`
            }
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {canManageStudents && (
            <>
              <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended} aria-label="Ajouter un élève">
                <Plus size={18} /> {t('add', 'Ajouter un élève')}
              </button>
              <button className="secondary" onClick={() => setImportModalOpen(true)} disabled={isSchoolSuspended} aria-label="Importer depuis Excel">
                <FileSpreadsheet size={18} /> Importer Excel
              </button>
            </>
          )}
          <button className="secondary" onClick={exportInscriptionsCSV} disabled={isSchoolSuspended || exportableStudents.length === 0} aria-label="Exporter les inscriptions">
            <FileSpreadsheet size={18} /> Exporter inscriptions
          </button>
          <button className="secondary" onClick={() => window.print()} aria-label="Imprimer la liste">
            <Printer size={18} /> Imprimer
          </button>
        </div>
      </div>

      <div className="card print-area" style={{ padding: 0 }}>
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
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrer par statut">
              <option value="all">Tous les statuts</option>
              <option value="nouveau">Nouveau</option>
              <option value="ancien">Ancien</option>
            </select>
            <select value={schoolingStatusFilter} onChange={e => setSchoolingStatusFilter(e.target.value as SchoolingStatusFilter)} aria-label="Situation scolaire">
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
              <option value="all">Tous</option>
            </select>
            {(searchTerm !== '' || sectionFilter !== 'all' || classFilter !== 'all' || statusFilter !== 'all' || schoolingStatusFilter !== 'active') && (
              <button
                type="button"
                className="secondary"
                onClick={() => { setSearchTerm(''); setSectionFilter('all'); setClassFilter('all'); setStatusFilter('all'); setSchoolingStatusFilter('active'); }}
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
            <thead style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>Matricule</th>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>{t('name', 'Nom')}</th>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>Classe (Section)</th>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>{t('parent_name', 'Tuteur / Parent')}</th>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>Contact</th>
                <th scope="col" style={{ padding: '1rem', textAlign: 'left' }}>Statut</th>
                <th scope="col" className="no-print" style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
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
                          : (sectionFilter !== 'all' || classFilter !== 'all' || statusFilter !== 'all'
                              ? 'Aucun élève ne correspond aux filtres sélectionnés.'
                              : (schoolingStatusFilter === 'active'
                                  ? 'Aucun élève actif trouvé.'
                                  : (schoolingStatusFilter === 'inactive'
                                      ? 'Aucun ancien élève trouvé.'
                                      : 'Aucun élève trouvé.'
                                    )
                                )
                            )
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
                      {(canViewSensitive && (student.allergies || student.medicalConditions)) && (
                        <span title={`Santé: ${student.allergies ? 'Allergies ' : ''}${student.medicalConditions ? 'Conditions Médicales' : ''}`}>
                          <HeartPulse size={16} color="#dc2626" />
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {db.classes.find(c => c.id === student.classId)?.name || '-'} <span style={{fontSize: '0.85em', color: 'var(--text-muted)'}}>({student.section})</span>
                    </td>
                    <td style={{ padding: '1rem' }}>{student.parentName}</td>
                    <td style={{ padding: '1rem' }}>{canViewSensitive ? (student.parentPhone || '-') : '***'}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                        <span style={{
                          padding: '0.2rem 0.6rem',
                          borderRadius: '12px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          background: student.studentStatus === 'ancien' ? '#e2e8f0' : '#dcfce7',
                          color: student.studentStatus === 'ancien' ? '#475569' : '#15803d'
                        }}>
                          {student.studentStatus === 'ancien' ? 'Ancien' : student.studentStatus === 'nouveau' ? 'Nouveau' : (student.studentStatus ? String(student.studentStatus) : 'Non renseigné')}
                        </span>
                        {(() => {
                          const isInactive = getStudentSchoolingStatus(student) === 'inactive';
                          return (
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: isInactive ? '#fee2e2' : '#e0f2fe',
                              color: isInactive ? '#991b1b' : '#0369a1'
                            }}>
                              {isInactive ? 'Inactif' : 'Actif'}
                            </span>
                          );
                        })()}
                        {getStudentSchoolingStatus(student) === 'inactive' && student.departureReason && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            ({getDepartureReasonLabel(student.departureReason)})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="no-print" style={{ padding: '1rem', textAlign: 'right', position: 'relative' }}>
                      <div style={{ display: 'inline-block', position: 'relative' }}>
                        <button
                          type="button"
                          className="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenRowMenuId(prev => (prev === student.id ? null : student.id));
                          }}
                          aria-expanded={openRowMenuId === student.id}
                          aria-controls={`student-menu-${student.id}`}
                          aria-label={`Actions pour ${student.name}`}
                          disabled={isSchoolSuspended}
                          style={{ fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
                        >
                          Actions ▾
                        </button>
                        {openRowMenuId === student.id && (
                          <div
                            id={`student-menu-${student.id}`}
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: '110%',
                              background: '#fff',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              zIndex: 30,
                              minWidth: '210px',
                              padding: '0.35rem 0',
                              textAlign: 'left'
                            }}
                          >
                            {canManageStudents && (
                              <button
                                type="button"
                                data-action="edit-student"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenRowMenuId(null);
                                  handleOpenModal(student);
                                }}
                                disabled={isSchoolSuspended}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0.5rem 0.75rem',
                                  cursor: isSchoolSuspended ? 'not-allowed' : 'pointer',
                                  fontSize: '0.85rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  color: 'var(--text-primary, #1f2937)',
                                  opacity: isSchoolSuspended ? 0.55 : 1
                                }}
                              >
                                <Edit2 size={14} aria-hidden="true" style={{ color: 'inherit' }} />
                                Modifier l’élève
                              </button>
                            )}
                            {canChangeStudentActiveStatus && (
                              getStudentSchoolingStatus(student) === 'active' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRowMenuId(null);
                                    setSelectedStudentForStatus(student);
                                    setDepartureReason('');
                                    setDepartureDate(new Date().toISOString().split('T')[0]);
                                    setDepartureNote('');
                                    setStatusError(null);
                                    setIsDeactivateModalOpen(true);
                                  }}
                                  disabled={isSchoolSuspended}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'none',
                                    border: 'none',
                                    padding: '0.5rem 0.75rem',
                                    cursor: isSchoolSuspended ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: 'var(--danger)',
                                    opacity: isSchoolSuspended ? 0.55 : 1
                                  }}
                                >
                                  <Trash2 size={14} aria-hidden="true" style={{ color: 'inherit' }} />
                                  Désactiver l’élève
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRowMenuId(null);
                                    setSelectedStudentForStatus(student);
                                    setStatusError(null);
                                    setIsReactivateModalOpen(true);
                                  }}
                                  disabled={isSchoolSuspended}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    background: 'none',
                                    border: 'none',
                                    padding: '0.5rem 0.75rem',
                                    cursor: isSchoolSuspended ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: 'var(--success)',
                                    opacity: isSchoolSuspended ? 0.55 : 1
                                  }}
                                >
                                  <Plus size={14} aria-hidden="true" style={{ color: 'inherit' }} />
                                  Réactiver l’élève
                                </button>
                              )
                            )}
                            {getStudentSchoolingStatus(student) !== 'inactive' && (
                              <button
                                type="button"
                                onClick={() => { setOpenRowMenuId(null); handleOpenInviteModal(student); }}
                                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}
                              >
                                <Send size={14} aria-hidden="true" /> Inviter le responsable
                              </button>
                            )}
                            {(() => {
                              const phoneInfo = getStudentWhatsAppPhone(student);
                              const isEnabled = !isSchoolSuspended && !!phoneInfo.normalizedPhone;
                              const reasonText = isSchoolSuspended
                                ? 'Établissement suspendu'
                                : (phoneInfo.reason === 'missing'
                                    ? 'Aucun numéro renseigné'
                                    : (phoneInfo.reason === 'invalid'
                                        ? 'Numéro incomplet — corriger dans Modifier l’élève'
                                        : ''
                                      )
                                  );
                              return (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => { setOpenRowMenuId(null); handleWhatsAppContact(student); }}
                                    disabled={!isEnabled}
                                    title={reasonText}
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      background: 'none',
                                      border: 'none',
                                      padding: '0.5rem 0.75rem',
                                      cursor: isEnabled ? 'pointer' : 'not-allowed',
                                      opacity: isEnabled ? 1 : 0.5,
                                      fontSize: '0.85rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                      color: isEnabled ? '#25D366' : 'var(--text-muted)'
                                    }}
                                  >
                                    <MessageSquare size={14} aria-hidden="true" /> Contacter par WhatsApp
                                  </button>
                                  {!isEnabled && reasonText && (
                                    <div style={{ padding: '0 0.75rem 0.35rem 2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      {reasonText}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            {getStudentSchoolingStatus(student) === 'active' && canChangeStudentActiveStatus && (
                              <button
                                type="button"
                                onClick={() => { setOpenRowMenuId(null); handleDeactivateStudent(student); }}
                                disabled={isSchoolSuspended}
                                title="Retirer cet élève de la liste des élèves actifs."
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  padding: '0.5rem 0.75rem',
                                  cursor: isSchoolSuspended ? 'not-allowed' : 'pointer',
                                  fontSize: '0.85rem',
                                  color: 'var(--danger)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  opacity: isSchoolSuspended ? 0.55 : 1
                                }}
                              >
                                <Trash2 size={14} aria-hidden="true" style={{ color: 'inherit' }} /> Retirer des élèves actifs
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={requestCloseStudentModal}
        title={isEditing ? t('edit', 'Modifier l’élève') : t('add', 'Ajouter un élève')}
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
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
                    <label>Matricule <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{isEditing ? '(non modifiable)' : '(Facultatif)'}</span></label>
                    <input
                      value={currentStudent.matricule || ''}
                      onChange={e => setCurrentStudent({...currentStudent, matricule: e.target.value})}
                      readOnly={isEditing}
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
                          const fees = getDefaultFeesForClass(matchedClass.name, currentStudent.section || 'francophone', db.school);
                          if (fees) {
                            setCurrentStudent(prev => ({
                              ...prev,
                              classId: cId,
                              feeT1: fees.t1,
                              feeT2: fees.t2,
                              feeT3: fees.t3,
                              tuitionExpected: fees.tuition,
                              registrationFeeExpected: fees.registration,
                            }));
                          } else {
                            // Frais non configurés
                            setCurrentStudent(prev => ({
                              ...prev,
                              classId: cId,
                              feeT1: undefined,
                              feeT2: undefined,
                              feeT3: undefined,
                              tuitionExpected: undefined,
                              registrationFeeExpected: undefined,
                            }));
                          }
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
                    <input
                      readOnly
                      value={
                        isEditing
                          ? (currentStudent.registrationYear || 'Année non renseignée (fiche legacy)')
                          : (resolveStudentEnrollmentAcademicYear(db.academicYears, currentSchool)?.name || 'Aucune année active configurée')
                      }
                      aria-label="Année scolaire active"
                    />
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
                      <label htmlFor="student-allergies-input" style={{ color: '#92400e', fontWeight: 500 }}>Allergies</label>
                      <textarea
                        id="student-allergies-input"
                        value={currentStudent.allergies || ''}
                        disabled={isSaving}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.trim()) setNoMedicalConditionConfirmed(false);
                          setCurrentStudent(prev => ({ ...prev, allergies: val }));
                        }}
                        placeholder="Ex: Arachides, Pénicilline..."
                        rows={2}
                        style={{ width: '100%', borderColor: '#fcd34d' }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                      <label htmlFor="student-medical-conditions-input" style={{ color: '#92400e', fontWeight: 500 }}>Conditions Médicales</label>
                      <textarea
                        id="student-medical-conditions-input"
                        value={currentStudent.medicalConditions || ''}
                        disabled={isSaving}
                        onChange={e => {
                          const val = e.target.value;
                          if (val.trim()) setNoMedicalConditionConfirmed(false);
                          setCurrentStudent(prev => ({ ...prev, medicalConditions: val }));
                        }}
                        placeholder="Ex: Asthme, Diabète..."
                        rows={2}
                        style={{ width: '100%', borderColor: '#fcd34d' }}
                      />
                    </div>
                  </div>
                  <label htmlFor="student-no-medical-condition-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isSaving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: '#78350f' }}>
                    <input
                      id="student-no-medical-condition-checkbox"
                      type="checkbox"
                      disabled={isSaving}
                      checked={noMedicalConditionConfirmed}
                      onChange={e => setNoMedicalConditionConfirmed(e.target.checked)}
                      style={{ width: 'auto', cursor: isSaving ? 'not-allowed' : 'pointer' }}
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
                      setTimeout(() => {
                        const el = document.getElementById('student-allergies-input');
                        if (el) el.focus();
                      }, 50);
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

      <Modal
        isOpen={isDuplicateConfirmOpen}
        onClose={() => setIsDuplicateConfirmOpen(false)}
        title="Doublon probable détecté"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <div style={{ padding: '0.25rem 0' }}>
          <p style={{ margin: '0 0 1rem 0' }}>
            Un élève de la même école possède déjà les mêmes nom, prénom, date de naissance et sexe.
          </p>
          <p style={{ margin: '0 0 1.5rem 0', color: '#92400e' }}>
            Vérifiez la saisie. Ne confirmez que s’il s’agit réellement de deux enfants différents.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setIsDuplicateConfirmOpen(false)}
              disabled={isSaving}
            >
              Revenir à la saisie
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDuplicateConfirmOpen(false);
                void handleSave(undefined, true);
              }}
              disabled={isSaving}
            >
              Confirmer deux enfants différents
            </button>
          </div>
        </div>
      </Modal>

      {/* Abandon Confirmation Modal */}
      <Modal
        isOpen={isConfirmAbandonOpen}
        onClose={() => setIsConfirmAbandonOpen(false)}
        title="Abandonner les modifications ?"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
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
                forceCloseStudentModal();
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

      {/* Deactivation Modal */}
      <Modal
        isOpen={isDeactivateModalOpen}
        onClose={() => {
          setIsDeactivateModalOpen(false);
          setSelectedStudentForStatus(null);
          setDepartureNote('');
          setDepartureDate('');
          setDepartureReason('');
          setStatusError(null);
        }}
        title="Désactiver l’élève"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
            Le dossier et l’historique de cet élève seront conservés. L’élève pourra être réactivé ultérieurement.
          </p>
          {statusError && (
            <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {statusError}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); handleDeactivate(); }}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Motif de départ *</label>
              <select
                value={departureReason}
                onChange={(e) => setDepartureReason(e.target.value as 'school_change' | 'graduated' | 'withdrawn' | 'other' | '')}
                required
                style={{ width: '100%', padding: '0.5rem' }}
              >
                <option value="">Sélectionner un motif</option>
                <option value="school_change">Changement d’établissement</option>
                <option value="graduated">Fin de cycle</option>
                <option value="withdrawn">Retrait de l’élève</option>
                <option value="other">Autre</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Date de départ *</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Commentaire (facultatif)</label>
              <textarea
                value={departureNote}
                onChange={(e) => setDepartureNote(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', minHeight: '80px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                type="button"
                className="secondary"
                disabled={isStatusSaving}
                onClick={() => {
                  setIsDeactivateModalOpen(false);
                  setSelectedStudentForStatus(null);
                  setDepartureNote('');
                  setDepartureDate('');
                  setDepartureReason('');
                  setStatusError(null);
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isStatusSaving || !departureReason || !departureDate}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' }}
              >
                {isStatusSaving ? 'Enregistrement...' : 'Confirmer la désactivation'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Reactivation Modal */}
      <Modal
        isOpen={isReactivateModalOpen}
        onClose={() => {
          setIsReactivateModalOpen(false);
          setSelectedStudentForStatus(null);
          setStatusError(null);
        }}
        title="Réactiver l’élève"
        closeOnBackdrop={false}
        closeOnEscape={false}
      >
        <div style={{ padding: '1rem' }}>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
            L’élève réapparaîtra dans la liste des élèves actifs. Son historique sera conservé.
          </p>
          {statusError && (
            <div style={{ padding: '0.75rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {statusError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button
              type="button"
              className="secondary"
              disabled={isStatusSaving}
              onClick={() => {
                setIsReactivateModalOpen(false);
                setSelectedStudentForStatus(null);
                setStatusError(null);
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={isStatusSaving}
              onClick={handleReactivate}
              style={{ background: 'var(--success)', borderColor: 'var(--success)', color: 'white' }}
            >
              {isStatusSaving ? 'Enregistrement...' : 'Confirmer la réactivation'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default Students;
