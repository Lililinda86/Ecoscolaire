import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';
import './Settings.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SchoolFeeCatalog } from '../components/Settings/SchoolFeeCatalog';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Edit2, Trash2, BookOpen } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db as firestoreDb } from '../db/firebase';
import Modal from '../components/Modal';
import { sortClasses } from '../utils/sortClasses';
import { getClassOptionLabel } from '../utils/classCatalog';
import type { School, EducationCycle } from '../types';
import { AcademicCalendarSettings } from '../components/Settings/AcademicCalendarSettings';
import { TuitionDeadlineSettings } from '../components/Settings/TuitionDeadlineSettings';
import {
  validateTuitionPaymentDeadlines,
  type TuitionPaymentDeadlines
} from '../utils/tuitionDeadlines';

const Settings: React.FC = () => {
  const { db, safeMergeDB, currentUser } = useAppContext();
  const navigate = useNavigate();
  const [newClass, setNewClass] = useState({ name: '', type: 'francophone' as 'francophone' | 'anglophone' });
  const [isSubjModalOpen, setSubjModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState('');
  const [campaySecretInput, setCampaySecretInput] = useState('');
  const [isSavingTuitionDeadlines, setIsSavingTuitionDeadlines] = useState(false);
  const [draftTuitionDeadlines, setDraftTuitionDeadlines] = useState<TuitionPaymentDeadlines>({
    T1: '', T2: '', T3: ''
  });

  // Draft state variables for batch updates
  const [draftName, setDraftName] = useState('');
  const [draftAcademicYear, setDraftAcademicYear] = useState('');
  const [draftDirectorName, setDraftDirectorName] = useState('');
  const [draftAccreditationNumber, setDraftAccreditationNumber] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [draftAddress, setDraftAddress] = useState('');
  // 1. PIN security: draft initialized to empty string and never exposed or logged.
  const [draftAdminPin, setDraftAdminPin] = useState('');

  const [draftEducationCycles, setDraftEducationCycles] = useState<EducationCycle[]>([]);
  const [draftFounderName, setDraftFounderName] = useState('');
  const [draftPrincipalName, setDraftPrincipalName] = useState('');

  const activeAcademicYear = (db.academicYears || []).find(year =>
    year.id === db.school?.activeAcademicYearId && year.schoolId === db.school?.id
  );

  useEffect(() => {
    setDraftTuitionDeadlines(activeAcademicYear?.tuitionPaymentDeadlines || { T1: '', T2: '', T3: '' });
  }, [activeAcademicYear?.id, activeAcademicYear?.tuitionPaymentDeadlines]);

  const handleSaveTuitionDeadlines = async () => {
    if (!activeAcademicYear || !currentUser || isSavingTuitionDeadlines) return;
    const validationError = validateTuitionPaymentDeadlines(activeAcademicYear.name, draftTuitionDeadlines);
    if (validationError) {
      alert(validationError);
      return;
    }
    setIsSavingTuitionDeadlines(true);
    try {
      await updateDoc(doc(firestoreDb, 'academicYears', activeAcademicYear.id), {
        tuitionPaymentDeadlines: draftTuitionDeadlines
      });
      await safeMergeDB({
        ...db,
        academicYears: (db.academicYears || []).map(year => year.id === activeAcademicYear.id
          ? { ...year, tuitionPaymentDeadlines: { ...draftTuitionDeadlines } }
          : year)
      });
      alert('Échéances de scolarité enregistrées. Aucun montant ni calendrier Transport n’a été modifié.');
    } catch (error) {
      console.error(error);
      alert("Impossible d’enregistrer les échéances de scolarité.");
    } finally {
      setIsSavingTuitionDeadlines(false);
    }
  };

  const [draftCycleNames, setDraftCycleNames] = useState({
    nursery: '',
    primary: '',
    secondary: ''
  });

  const [
    draftCycleAccreditationNumbers,
    setDraftCycleAccreditationNumbers
  ] = useState({
    nursery: '',
    primary: '',
    secondary: ''
  });

  // 2. Draft fees stored as strings to capture exact raw user typing.
  const [draftFees, setDraftFees] = useState({
    feeT1: '0',
    feeT2: '0',
    feeT3: '0',
    feeTransport: '0',
    feeUniforms: '0'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [draftTransportPolicy, setDraftTransportPolicy] = useState(false);
  const [draftItaloTransportEnabled, setDraftItaloTransportEnabled] = useState(false);
  const [draftTransportBillingPeriods, setDraftTransportBillingPeriods] = useState('');
  const [draftPkRates, setDraftPkRates] = useState({ pk14To33: '4000', pk34To42: '5000' });
  const [tariffReason, setTariffReason] = useState('');

  const canEditFees = ['owner', 'director', 'superAdmin'].includes(currentUser?.role || '');
  const [draftClassFees, setDraftClassFees] = useState<Record<string, { registration?: string; tuition?: string; t1?: string; t2?: string; t3?: string }>>({});

  // 3. Draft initialization strategy: Keep track of initialized school id via ref to avoid overwriting modified drafts on contextual reload of db.school.
  const initializedSchoolIdRef = useRef<string | null>(null);

  const initDraftsFromSchool = useCallback(
    (school: School) => {
      setDraftName(school.name || '');
      setDraftAcademicYear(school.academicYear || '');
      setDraftDirectorName(school.directorName || '');
      setDraftAccreditationNumber(school.accreditationNumber || '');
      setDraftPhone(school.phone || '');
      setDraftEmail(school.email || '');
      setDraftAddress(school.address || '');
      setDraftAdminPin(''); // PIN input is always blank initially
      setDraftEducationCycles(school.educationCycles ?? []);
      setDraftFounderName(school.founderName || '');
      setDraftPrincipalName(school.principalName || '');
      setDraftCycleNames({
        nursery: school.cycleNames?.nursery || '',
        primary: school.cycleNames?.primary || '',
        secondary: school.cycleNames?.secondary || ''
      });
      setDraftCycleAccreditationNumbers({
        nursery: school.cycleAccreditationNumbers?.nursery || '',
        primary: school.cycleAccreditationNumbers?.primary || '',
        secondary: school.cycleAccreditationNumbers?.secondary || ''
      });
      setDraftFees({
        feeT1: String(school.globalFees?.feeT1 ?? 0),
        feeT2: String(school.globalFees?.feeT2 ?? 0),
        feeT3: String(school.globalFees?.feeT3 ?? 0),
        feeTransport: String(school.globalFees?.feeTransport ?? 0),
        feeUniforms: String(school.globalFees?.feeUniforms ?? 0)
      });
      setDraftTransportPolicy(school.transportPolicy?.secretaryManageAll === true);
      setDraftItaloTransportEnabled(school.transportPolicy?.feePolicyId === 'ITALO_PK_2026');
      setDraftTransportBillingPeriods((school.transportPolicy?.billingPeriods || []).join(', '));
      setDraftPkRates({ pk14To33: String(school.transportPolicy?.pkRates?.pk14To33 ?? 4000), pk34To42: String(school.transportPolicy?.pkRates?.pk34To42 ?? 5000) });
      
      const feesInit: Record<string, { registration?: string; tuition?: string; t1?: string; t2?: string; t3?: string }> = {};
      if (school.classFees) {
        Object.keys(school.classFees).forEach(className => {
          const config = school.classFees![className];
          feesInit[className] = {
            registration: config.registration?.toString() || '',
            tuition: config.tuition?.toString() || '',
            t1: config.t1?.toString() || '',
            t2: config.t2?.toString() || '',
            t3: config.t3?.toString() || ''
          };
        });
      }
      setDraftClassFees(feesInit);
      
      initializedSchoolIdRef.current = school.id;
    },
    []
  );

  useEffect(() => {
    const school = db.school;

    if (!school || initializedSchoolIdRef.current === school.id) {
      return;
    }

    initDraftsFromSchool(school);
    initializedSchoolIdRef.current = school.id;
  }, [db.school, initDraftsFromSchool]);

  useEffect(() => {
    if (window.location.hash === '#/settings?section=academic-calendar' || window.location.hash === '#academic-calendar') {
      setTimeout(() => {
        const el = document.getElementById('academic-calendar');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 500);
    }
  }, []);

  if (!currentUser || !['superAdmin', 'owner', 'director'].includes(currentUser.role)) return null;

  const handleSaveCampaySecret = async () => {
    if (!db.school || !campaySecretInput.trim()) return;
    
    try {
      const secretRef = doc(firestoreDb, `schools/${db.school.id}/secrets/payment`);
      await setDoc(secretRef, {
        campaySecret: campaySecretInput.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      safeMergeDB({ ...db, school: { ...(db.school as NonNullable<typeof db.school>), paymentSettings: { ...(db.school?.paymentSettings||{}), hasCampaySecret: true } } });
      
      setCampaySecretInput('');
      alert("Secret Campay configuré et sauvegardé avec succès de façon sécurisée.");
    } catch (error) {
      console.error(error);
      alert("Erreur : Seul le propriétaire ou superAdmin peut modifier les secrets de paiement.");
    }
  };

  const normalizeFee = (label: string, rawValue: string): number => {
    const value = rawValue.trim();
    if (!/^\d+$/.test(value)) {
      throw new Error(`${label} doit être un nombre entier positif ou nul.`);
    }
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`${label} est invalide.`);
    }
    return amount;
  };

  const handleSaveChanges = async () => {
    if (!db.school || isSaving) return;

    // 1. Validation Name
    const normName = draftName.trim();
    if (!normName) {
      alert("Le nom de l'école est obligatoire.");
      return;
    }

    // 2. Validation Academic Year (YYYY-YYYY format where year2 = year1 + 1)
    const yearRegex = /^(\d{4})-(\d{4})$/;
    const yearMatch = draftAcademicYear.trim().match(yearRegex);
    if (!yearMatch) {
      alert("L'année scolaire doit respecter le format YYYY-YYYY (ex: 2026-2027).");
      return;
    }
    const yearStart = parseInt(yearMatch[1], 10);
    const yearEnd = parseInt(yearMatch[2], 10);
    if (yearEnd !== yearStart + 1) {
      alert("L'année de fin doit être égale à l'année de début + 1 (ex: 2026-2027).");
      return;
    }

    // 3. Validation Email
    const normEmail = draftEmail.trim();
    if (normEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      alert("Le format de l'adresse email est incorrect.");
      return;
    }

    // 4. Validation Cycles
    if (draftEducationCycles.length === 0) {
      alert("Vous devez sélectionner au moins un cycle scolaire pour l'établissement.");
      return;
    }

    // 5. Validation Fees
    let normalizedFees;
    try {
      normalizedFees = {
        feeT1: normalizeFee("Scolarité T1", draftFees.feeT1),
        feeT2: normalizeFee("Scolarité T2", draftFees.feeT2),
        feeT3: normalizeFee("Scolarité T3", draftFees.feeT3),
        feeTransport: normalizeFee("Transport Bus", draftFees.feeTransport),
        feeUniforms: normalizeFee("Tenues Uniformes", draftFees.feeUniforms)
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Frais comptables invalides.";
      alert(errorMsg);
      return;
    }
    const normalizedTransportPeriods = [...new Set(draftTransportBillingPeriods
      .split(/[\s,;]+/)
      .map(value => value.trim())
      .filter(Boolean))].sort();
    if (draftItaloTransportEnabled) {
      if (normalizedTransportPeriods.length === 0) {
        alert('Configurez au moins un mois facturable pour le transport ITALO.');
        return;
      }
      const allowedYears = new Set([String(yearStart), String(yearEnd)]);
      if (normalizedTransportPeriods.some(period =>
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !allowedYears.has(period.slice(0, 4)))) {
        alert('Chaque mois transport doit utiliser YYYY-MM et appartenir à l’année scolaire affichée.');
        return;
      }
    }


    // 6. PIN Conditional Inclusion
    const normPin = draftAdminPin.trim();

    setIsSaving(true);
    try {
      const updatedSchool = {
        ...db.school,
        name: normName,
        academicYear: draftAcademicYear.trim(),
        directorName: draftDirectorName.trim(),
        accreditationNumber: draftAccreditationNumber.trim(),
        phone: draftPhone.trim(),
        email: normEmail,
        address: draftAddress.trim(),
        educationCycles: [...draftEducationCycles].sort((a, b) => {
          const order = { nursery: 0, primary: 1, secondary: 2 };
          return order[a] - order[b];
        }),
        founderName: draftFounderName.trim(),
        principalName: draftPrincipalName.trim(),
        cycleNames: {
          ...(db.school.cycleNames ?? {}),
          nursery: draftCycleNames.nursery.trim(),
          primary: draftCycleNames.primary.trim(),
          secondary: draftCycleNames.secondary.trim()
        },
        cycleAccreditationNumbers: {
          ...(db.school.cycleAccreditationNumbers ?? {}),
          nursery: draftCycleAccreditationNumbers.nursery.trim(),
          primary: draftCycleAccreditationNumbers.primary.trim(),
          secondary: draftCycleAccreditationNumbers.secondary.trim()
        },
        ...(normPin ? { adminPin: normPin } : {}),
        globalFees: {
          ...(db.school.globalFees || {}),
          feeT1: normalizedFees.feeT1,
          feeT2: normalizedFees.feeT2,
          feeT3: normalizedFees.feeT3,
          feeTransport: normalizedFees.feeTransport,
          feeUniforms: normalizedFees.feeUniforms
        },
        transportPolicy: {
          ...(db.school.transportPolicy || {}),
          secretaryManageAll: draftTransportPolicy,
          feePolicyId: draftItaloTransportEnabled ? ('ITALO_PK_2026' as const) : null,
          billingPeriods: draftItaloTransportEnabled ? normalizedTransportPeriods : [],
          pkRates: { pk14To33: normalizeFee('PK14–PK33', draftPkRates.pk14To33), pk34To42: normalizeFee('PK34–PK42', draftPkRates.pk34To42) }
        }
      };

      const classFeesToSave: Record<string, { registration?: number; tuition?: number; t1?: number; t2?: number; t3?: number }> = {};
      for (const [className, fees] of Object.entries(draftClassFees)) {
        const classFee: { registration?: number; tuition?: number; t1?: number; t2?: number; t3?: number } = {};
        if (fees.registration?.trim()) classFee.registration = normalizeFee(`Inscription (${className})`, fees.registration);
        if (fees.tuition?.trim()) classFee.tuition = normalizeFee(`Scolarité (${className})`, fees.tuition);
        if (fees.t1?.trim()) classFee.t1 = normalizeFee(`T1 (${className})`, fees.t1);
        if (fees.t2?.trim()) classFee.t2 = normalizeFee(`T2 (${className})`, fees.t2);
        if (fees.t3?.trim()) classFee.t3 = normalizeFee(`T3 (${className})`, fees.t3);
        
        if (Object.keys(classFee).length > 0) {
           if (classFee.tuition !== undefined) {
               const tTotal = (classFee.t1 || 0) + (classFee.t2 || 0) + (classFee.t3 || 0);
               if (tTotal > 0 && tTotal !== classFee.tuition) {
                   throw new Error(`Le total des tranches (${tTotal}) ne correspond pas à la scolarité (${classFee.tuition}) pour la classe ${className}.`);
               }
           }
           classFeesToSave[className] = classFee;
        }
      }
      updatedSchool.classFees = classFeesToSave;

      const tariffConfiguration = { globalFees: updatedSchool.globalFees, classFees: updatedSchool.classFees, transportPolicy: updatedSchool.transportPolicy };
      const originalConfiguration = { globalFees: db.school.globalFees, classFees: db.school.classFees, transportPolicy: db.school.transportPolicy };
      if (JSON.stringify(tariffConfiguration) !== JSON.stringify(originalConfiguration)) {
        if (!tariffReason.trim()) throw new Error('Indiquez le motif de la nouvelle version tarifaire.');
        const response = await httpsCallable<Record<string, unknown>, { version: string }>(functions, 'manageSchoolFee')({
          schoolId: db.school.id, action: 'configure', academicYear: db.school.academicYear,
          expectedVersion: db.school.financialTariffVersion || null, reason: tariffReason, configuration: tariffConfiguration
        });
        updatedSchool.financialTariffVersion = response.data.version;
      }
      const metadata = Object.fromEntries(Object.entries(updatedSchool).filter(([key]) => !['globalFees', 'classFees', 'transportPolicy', 'financialTariffVersion', 'feeCatalog'].includes(key)));
      await setDoc(doc(firestoreDb, 'schools', db.school.id), metadata, { merge: true });
      if (draftTransportPolicy !== (db.school.transportPolicy?.secretaryManageAll === true)) {
        await updateDoc(doc(firestoreDb, 'schools', db.school.id), { 'transportPolicy.secretaryManageAll': draftTransportPolicy });
      }
      await safeMergeDB({
        ...db,
        school: updatedSchool
      });
      alert("Paramètres enregistrés avec succès.");
      initDraftsFromSchool(updatedSchool);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Une erreur est survenue lors de l'enregistrement.");
      if (db.school) initDraftsFromSchool(db.school);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name.trim()) return;
    const newDb = { ...db, classes: [...db.classes, { id: crypto.randomUUID(), name: newClass.name, type: newClass.type }] };
    safeMergeDB(newDb);
    setNewClass({ name: '', type: 'francophone' });
  };

  const handleDeleteClass = (id: string) => {
    if (confirm("Voulez-vous vraiment supprimer cette classe ?")) {
      safeMergeDB({ ...db, classes: db.classes.filter(c => c.id !== id) });
    }
  };

  const handleEditClass = (id: string, oldName: string) => {
    const name = prompt("Modifier le nom de la classe :", oldName);
    if (name && name.trim()) {
      safeMergeDB({ ...db, classes: db.classes.map(c => c.id === id ? { ...c, name: name.trim() } : c) });
    }
  };



  const handleNewAcademicYear = () => {
    if(window.confirm("NOUVELLE ANNÉE : Voulez-vous réinitialiser les données pédagogiques courantes ? Les écritures financières publiées resteront conservées et immuables.")) {
      safeMergeDB({
        ...db,
        grades: [],
        attendance: [],
        staffAttendance: []
        // Retains all financial ledgers, students, classes, staff and inventory.
      });
      alert("L'application a été rafraîchie avec succès pour entamer la nouvelle année scolaire !");
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validation: 300 KB limit
    if (file.size > 300 * 1024) {
      alert("Erreur: Le fichier est trop volumineux (limite: 300 Ko maximum).");
      e.target.value = '';
      return;
    }
    
    // Validation: format (PNG, JPG, JPEG, WEBP)
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert("Erreur: Format non supporté. Veuillez utiliser PNG, JPG, JPEG ou WEBP.");
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (db.school) {
        try {
          await safeMergeDB({
            ...db,
            school: {
              ...db.school,
              logoUrl: base64String
            }
          });
          alert("Logo enregistré avec succès");
        } catch (error) {
          console.error(error);
          alert("Erreur lors de l'enregistrement du logo.");
        }
      }
    };
    reader.onerror = () => {
      alert("Erreur lors de la lecture de l'image.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    if (db.school) {
      try {
        await safeMergeDB({
          ...db,
          school: {
            ...db.school,
            logoUrl: null
          }
        });
        alert("Logo supprimé avec succès");
      } catch (error) {
        console.error(error);
        alert("Erreur lors de la suppression du logo.");
      }
    }
  };

  return (
    <div className="page-container financial-settings-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Paramètres</h1>
        <button
          type="button"
          onClick={handleSaveChanges}
          disabled={isSaving}
          style={{ background: 'var(--primary-color)', color: 'white', padding: '0.6rem 1.5rem', fontWeight: 600 }}
        >
          {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <nav className="settings-sections" aria-label="Sections des paramètres">{[['institution', 'Établissement'], ['cycles-classes', 'Cycles & classes'], ['academic-calendar', 'Année académique'], ['financial-tariff-version', 'Finances & tarifs'], ['transport-configuration', 'Transport'], ['documents-receipts', 'Documents & reçus'], ['school-policies', 'Politiques'], ['roles-validations', 'Rôles & validations']].map(([id, label]) => <button type="button" key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{label}</button>)}</nav>
        <h2 id="institution">Informations de l'Établissement</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nom de l'école</label>
            <input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Année Scolaire</label>
            <input
              value={draftAcademicYear}
              onChange={e => setDraftAcademicYear(e.target.value)}
              style={{ width: '100%' }}
              placeholder="2026-2027"
            />
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Numéro d'Agrément</label>
          <input
            value={draftAccreditationNumber}
            onChange={e => setDraftAccreditationNumber(e.target.value)}
            style={{ width: '100%' }}
            placeholder="Ex: Arrêté N° 123/MINEDUB/..."
          />
        </div>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)', opacity: 0.5 }} />

        <h2 id="cycles-classes">Cycles proposés par l'établissement</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Les cycles sélectionnés décrivent l’établissement. Les classes sont gérées séparément dans le module Classes.
        </p>
        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draftEducationCycles.includes('nursery')}
              onChange={e => {
                if (e.target.checked) {
                  setDraftEducationCycles(prev => [...prev, 'nursery']);
                } else {
                  setDraftEducationCycles(prev => prev.filter(c => c !== 'nursery'));
                }
              }}
            />
            Maternelle
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draftEducationCycles.includes('primary')}
              onChange={e => {
                if (e.target.checked) {
                  setDraftEducationCycles(prev => [...prev, 'primary']);
                } else {
                  setDraftEducationCycles(prev => prev.filter(c => c !== 'primary'));
                }
              }}
            />
            Primaire
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draftEducationCycles.includes('secondary')}
              onChange={e => {
                if (e.target.checked) {
                  setDraftEducationCycles(prev => [...prev, 'secondary']);
                } else {
                  setDraftEducationCycles(prev => prev.filter(c => c !== 'secondary'));
                }
              }}
            />
            Secondaire
          </label>
        </div>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)', opacity: 0.5 }} />

        <h2>Noms officiels par cycle</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nom officiel maternelle</label>
            <input
              value={draftCycleNames.nursery}
              onChange={e => setDraftCycleNames(prev => ({ ...prev, nursery: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftName || "Nom général"}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nom officiel primaire</label>
            <input
              value={draftCycleNames.primary}
              onChange={e => setDraftCycleNames(prev => ({ ...prev, primary: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftName || "Nom général"}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nom officiel secondaire</label>
            <input
              value={draftCycleNames.secondary}
              onChange={e => setDraftCycleNames(prev => ({ ...prev, secondary: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftName || "Nom général"}
            />
          </div>
        </div>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)', opacity: 0.5 }} />

        <h2>Numéros d'agrément par cycle</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Agrément maternelle</label>
            <input
              value={draftCycleAccreditationNumbers.nursery}
              onChange={e => setDraftCycleAccreditationNumbers(prev => ({ ...prev, nursery: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftAccreditationNumber || "Agrément général"}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Agrément primaire</label>
            <input
              value={draftCycleAccreditationNumbers.primary}
              onChange={e => setDraftCycleAccreditationNumbers(prev => ({ ...prev, primary: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftAccreditationNumber || "Agrément général"}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Agrément secondaire</label>
            <input
              value={draftCycleAccreditationNumbers.secondary}
              onChange={e => setDraftCycleAccreditationNumbers(prev => ({ ...prev, secondary: e.target.value }))}
              style={{ width: '100%' }}
              placeholder={draftAccreditationNumber || "Agrément général"}
            />
          </div>
        </div>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)', opacity: 0.5 }} />

        <h2>Direction et gouvernance</h2>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Fondateur / Promoteur</label>
            <input
              value={draftFounderName}
              onChange={e => setDraftFounderName(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Nom du Fondateur ou Promoteur"
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Directeur maternelle et primaire</label>
            <input
              value={draftDirectorName}
              onChange={e => setDraftDirectorName(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Nom du Directeur"
            />
            {(draftEducationCycles.includes('nursery') || draftEducationCycles.includes('primary')) && !draftDirectorName.trim() && (
              <span style={{ fontSize: '0.8rem', color: '#b91c1c', display: 'block', marginTop: '0.25rem' }}>
                ⚠️ Recommandé : renseignez un directeur pour les cycles maternelle/primaire actifs.
              </span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Principal du secondaire</label>
            <input
              value={draftPrincipalName}
              onChange={e => setDraftPrincipalName(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Nom du Principal"
            />
            {draftEducationCycles.includes('secondary') && !draftPrincipalName.trim() && (
              <span style={{ fontSize: '0.8rem', color: '#b91c1c', display: 'block', marginTop: '0.25rem' }}>
                ⚠️ Recommandé : renseignez un principal pour le cycle secondaire actif.
              </span>
            )}
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Les autres responsables sont gérés dans le module Personnel.
        </p>

        <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-color)', opacity: 0.5 }} />

        <h2>Logo et coordonnées</h2>

        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--primary-color)' }}>Logo de l'établissement</label>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Ce logo apparaîtra sur les reçus et documents imprimables. Formats acceptés : PNG, JPG, JPEG, WEBP (Max 300 Ko).
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--primary-color)', marginBottom: '1rem', fontWeight: 500 }}>
            Après avoir choisi le logo, l'enregistrement est automatique.
          </p>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {db.school?.logoUrl && (
              <div style={{ padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#fff' }}>
                <img 
                  src={db.school.logoUrl} 
                  alt="Aperçu du logo" 
                  style={{ width: '80px', height: '80px', objectFit: 'contain' }} 
                />
              </div>
            )}
            
            <div style={{ flex: 1, minWidth: '250px' }}>
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/webp" 
                onChange={handleLogoUpload}
                style={{ marginBottom: '0.5rem', width: '100%' }}
              />
              
              {db.school?.logoUrl && (
                <button 
                  type="button" 
                  onClick={handleRemoveLogo} 
                  style={{ background: 'var(--danger)', fontSize: '0.85rem', padding: '0.4rem 0.8rem', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Supprimer le logo
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Téléphone Officiel</label>
            <input
              value={draftPhone}
              onChange={e => setDraftPhone(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Ex: (+237) 600 00 00 00"
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Email Officiel</label>
            <input
              type="email"
              value={draftEmail}
              onChange={e => setDraftEmail(e.target.value)}
              style={{ width: '100%' }}
              placeholder="Ex: contact@ecole.com"
            />
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Adresse Complète</label>
          <input
            value={draftAddress}
            onChange={e => setDraftAddress(e.target.value)}
            style={{ width: '100%' }}
            placeholder="Ex: Quartier Bonamoussadi, BP 1234 Douala, Cameroun"
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Nouveau Code PIN Administrateur</label>
            <input 
              type="password"
              name="new-admin-pin"
              autoComplete="new-password"
              value={draftAdminPin}
              placeholder="Entrez un nouveau code pour le modifier..."
              onChange={e => setDraftAdminPin(e.target.value)}
              style={{ width: '100%', borderColor: 'var(--warning)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#f97316' }}>💳 Clé Publique Campay</label>
            <input 
              type="text"
              value={db.school?.paymentSettings?.campayPublic || ''}
              placeholder="Mode Simulation actif par défaut si vide..."
              onChange={e => safeMergeDB({ ...db, school: { ...(db.school as NonNullable<typeof db.school>), paymentSettings: { ...(db.school?.paymentSettings||{}), campayPublic: e.target.value } } })}
              style={{ width: '100%', borderColor: '#f97316', marginBottom: '1rem' }}
            />

            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#ef4444' }}>
              🔒 Campay Secret
              <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: '12px', background: db.school?.paymentSettings?.hasCampaySecret ? '#dcfce7' : '#fee2e2', color: db.school?.paymentSettings?.hasCampaySecret ? '#166534' : '#991b1b' }}>
                {db.school?.paymentSettings?.hasCampaySecret ? '🟢 Secret Campay configuré' : '🔴 Secret non configuré'}
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="password"
                value={campaySecretInput}
                placeholder="Entrez pour configurer..."
                onChange={e => setCampaySecretInput(e.target.value)}
                style={{ flex: 1, borderColor: '#ef4444' }}
              />
              <button 
                onClick={handleSaveCampaySecret}
                disabled={!campaySecretInput.trim()}
                style={{ background: '#ef4444' }}
              >
                Sauvegarder
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Le secret n'est jamais affiché ni lisible pour des raisons de sécurité. Écrivez une nouvelle valeur pour l'écraser.
            </p>
          </div>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '2rem' }}>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ color: 'var(--primary-color)', margin: '0 0 1rem 0' }}>Rafraîchir (Nouvelle Année)</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>Réinitialise les données pédagogiques courantes et <strong>conserve les paiements, reçus, élèves et classes</strong>.</p>
            <button onClick={handleNewAcademicYear} style={{ background: 'var(--primary-color)' }}>
              Passer à la Nouvelle Année
            </button>
          </div>

        </div>
      </div>

      <TuitionDeadlineSettings
        academicYearName={activeAcademicYear?.name || ''}
        value={draftTuitionDeadlines}
        disabled={!canEditFees || !activeAcademicYear}
        saving={isSavingTuitionDeadlines}
        onChange={setDraftTuitionDeadlines}
        onSave={handleSaveTuitionDeadlines}
      />

      <SchoolFeeCatalog />
      <section className="card" id="financial-tariff-version"><h2>Finances &amp; tarifs</h2><p>Les tarifs ci-dessous s’appliquent uniquement aux nouvelles obligations. Toute dette déjà établie conserve son tarif, même future et impayée.</p>
        <label>Motif de la modification tarifaire<textarea value={tariffReason} maxLength={500} onChange={e => setTariffReason(e.target.value)} placeholder="Ex. barème validé par la direction pour les nouvelles obligations" /></label>
      </section>
      <div className="card">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
          ⚙️ Comptabilité : Frais par Défaut
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Tarifs de secours pour les nouvelles obligations. Le barème par classe est prioritaire pour la scolarité. Les obligations existantes et les reçus ne sont jamais recalculés.
        </p>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', background: '#f8f9fa', padding: '1rem', borderRadius: '5px' }}>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T1</label>
                <input
                  type="text"
                  disabled={!canEditFees}
                  value={draftFees.feeT1}
                  onChange={e => {
                    setDraftFees(prev => ({ ...prev, feeT1: e.target.value }));
                  }}
                />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T2</label>
                <input
                  type="text"
                  disabled={!canEditFees}
                  value={draftFees.feeT2}
                  onChange={e => {
                    setDraftFees(prev => ({ ...prev, feeT2: e.target.value }));
                  }}
                />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Scolarité T3</label>
                <input
                  type="text"
                  disabled={!canEditFees}
                  value={draftFees.feeT3}
                  onChange={e => {
                    setDraftFees(prev => ({ ...prev, feeT3: e.target.value }));
                  }}
                />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Transport Bus</label>
                <input
                  type="text"
                  disabled={!canEditFees}
                  value={draftFees.feeTransport}
                  onChange={e => {
                    setDraftFees(prev => ({ ...prev, feeTransport: e.target.value }));
                  }}
                />
             </div>
             <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                <label>Tenues Uniformes</label>
                <input
                  type="text"
                  disabled={!canEditFees}
                  value={draftFees.feeUniforms}
                  onChange={e => {
                    setDraftFees(prev => ({ ...prev, feeUniforms: e.target.value }));
                  }}
                />
             </div>
        </div>
      </div>

      <div className="card">
        <h2>Frais scolaires par classe</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Définissez les frais applicables à chaque classe.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '0.75rem' }}>Classe</th>
                <th style={{ padding: '0.75rem' }}>Inscription</th>
                <th style={{ padding: '0.75rem' }}>Scolarité</th>
                <th style={{ padding: '0.75rem' }}>T1</th>
                <th style={{ padding: '0.75rem' }}>T2</th>
                <th style={{ padding: '0.75rem' }}>T3</th>
              </tr>
            </thead>
            <tbody>
              {sortClasses(db.classes).map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 500 }}>{getClassOptionLabel(c, db.classes)}</td>
                  <td style={{ padding: '0.25rem' }}><input disabled={!canEditFees} placeholder="-" style={{ width: '100px', padding: '0.35rem' }} value={draftClassFees[c.name]?.registration || ''} onChange={(e) => setDraftClassFees(prev => ({ ...prev, [c.name]: { ...prev[c.name], registration: e.target.value } }))} /></td>
                  <td style={{ padding: '0.25rem' }}><input disabled={!canEditFees} placeholder="-" style={{ width: '100px', padding: '0.35rem' }} value={draftClassFees[c.name]?.tuition || ''} onChange={(e) => setDraftClassFees(prev => ({ ...prev, [c.name]: { ...prev[c.name], tuition: e.target.value } }))} /></td>
                  <td style={{ padding: '0.25rem' }}><input disabled={!canEditFees} placeholder="-" style={{ width: '100px', padding: '0.35rem' }} value={draftClassFees[c.name]?.t1 || ''} onChange={(e) => setDraftClassFees(prev => ({ ...prev, [c.name]: { ...prev[c.name], t1: e.target.value } }))} /></td>
                  <td style={{ padding: '0.25rem' }}><input disabled={!canEditFees} placeholder="-" style={{ width: '100px', padding: '0.35rem' }} value={draftClassFees[c.name]?.t2 || ''} onChange={(e) => setDraftClassFees(prev => ({ ...prev, [c.name]: { ...prev[c.name], t2: e.target.value } }))} /></td>
                  <td style={{ padding: '0.25rem' }}><input disabled={!canEditFees} placeholder="-" style={{ width: '100px', padding: '0.35rem' }} value={draftClassFees[c.name]?.t3 || ''} onChange={(e) => setDraftClassFees(prev => ({ ...prev, [c.name]: { ...prev[c.name], t3: e.target.value } }))} /></td>
                </tr>
              ))}
              {db.classes.length === 0 && <tr><td colSpan={6} style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>Aucune classe</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 id="school-policies">Politiques d'établissement</h2>
        <h3 id="roles-validations">Rôles &amp; validations</h3>
        <p>La secrétaire consulte les tarifs, encaisse et soumet les demandes d’avantages. La direction et le propriétaire approuvent ou refusent selon leurs droits. Les tarifs officiels ne sont pas modifiables pendant l’encaissement.</p>
        <h3 id="documents-receipts">Documents &amp; reçus</h3>
        <p>Chaque encaissement génère un reçu global ventilé, imprimable et téléchargeable en PDF. Les anciens paiements et reçus restent consultables depuis Encaissement.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <input
            type="checkbox"
            id="secretaryManageAllTransport"
            checked={draftTransportPolicy}
            onChange={e => setDraftTransportPolicy(e.target.checked)}
            disabled={!['superAdmin', 'owner'].includes(currentUser.role)}
          />
          <label htmlFor="secretaryManageAllTransport" style={{ fontWeight: 500, cursor: 'pointer' }}>
            Autoriser la secrétaire à gérer l'intégralité du module Transport
          </label>
        </div>
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.75rem', fontWeight: 600 }}>
            <input
              data-testid="italo-transport-policy-enabled"
              type="checkbox"
              checked={draftItaloTransportEnabled}
              onChange={event => setDraftItaloTransportEnabled(event.target.checked)}
              disabled={!canEditFees}
            />
            Activer la politique ITALO PK14–PK42
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>
            Maternelle et primaire : transport payant selon le point PK. Secondaire : gratuit. Les mensualités déjà établies restent inchangées.
          </p>
          <h3 id="transport-configuration">Transport — tarifs des nouvelles mensualités</h3>
          <div className="school-fee-grid">
            <label>PK14 à PK33 — FCFA / mois<input type="number" min="1" step="1" value={draftPkRates.pk14To33} disabled={!canEditFees} onChange={e => setDraftPkRates(p => ({ ...p, pk14To33: e.target.value }))} /></label>
            <label>PK34 à PK42 — FCFA / mois<input type="number" min="1" step="1" value={draftPkRates.pk34To42} disabled={!canEditFees} onChange={e => setDraftPkRates(p => ({ ...p, pk34To42: e.target.value }))} /></label>
          </div>
          <label style={{ display: 'block', maxWidth: 640 }}>
            Mois facturables explicites
            <textarea
              data-testid="italo-transport-billing-periods"
              rows={2}
              value={draftTransportBillingPeriods}
              onChange={event => setDraftTransportBillingPeriods(event.target.value)}
              disabled={!canEditFees || !draftItaloTransportEnabled}
              placeholder="Exemple de format : 2026-09, 2026-10 (saisir uniquement les mois décidés par ITALO)"
              style={{ width: '100%', marginTop: '.35rem' }}
            />
          </label>
          <p style={{ color: '#92400e', fontSize: '.82rem' }}>
            Aucun mois n’est ajouté automatiquement. Enregistrez uniquement le calendrier officiellement validé.
          </p>
        </div>
        {!['superAdmin', 'owner'].includes(currentUser.role) && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Seul un administrateur principal (Propriétaire/SuperAdmin) peut modifier cette politique.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Gestion des matières</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Le catalogue des matières est désormais géré depuis le module académique centralisé.
        </p>
        <button onClick={() => navigate('/subjects-program')}>
          Ouvrir le catalogue des matières
        </button>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h2>Gestion des classes</h2>
        <form onSubmit={handleAddClass} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <input required value={newClass.name} onChange={e => setNewClass({...newClass, name: e.target.value})} placeholder="Nom de la classe..." style={{ flex: 1 }} />
          <select value={newClass.type} onChange={e => setNewClass({...newClass, type: e.target.value as 'francophone' | 'anglophone'})}>
            <option value="francophone">Francophone</option>
            <option value="anglophone">Anglophone</option>
          </select>
          <button type="submit">Ajouter</button>
        </form>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {sortClasses(db.classes).map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.75rem' }}>{getClassOptionLabel(c, db.classes)} <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>({c.type})</span></td>
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
               <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Cochez les matières enseignées en <strong>{getClassOptionLabel(cls, db.classes)}</strong> :</p>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                 {db.subjects.map(s => {
                    const isChecked = clsSubjects.includes(s.id);
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', background: isChecked ? 'rgba(79, 70, 229, 0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={isChecked} onChange={(e) => {
                           const newSubjects = e.target.checked ? [...clsSubjects, s.id] : clsSubjects.filter(id => id !== s.id);
                           const newDb = { ...db, classes: db.classes.map(c => c.id === currentClassId ? { ...c, subjects: newSubjects } : c) };
                           safeMergeDB(newDb);
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

      {db.school && currentUser && (
        <AcademicCalendarSettings 
          currentSchool={db.school} 
          currentUser={currentUser} 
          academicYears={db.academicYears || []} 
          periods={db.periods || []} 
        />
      )}
    </div>
  );
};

export default Settings;
