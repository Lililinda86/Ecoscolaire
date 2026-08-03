import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { sortClasses } from '../utils/sortClasses';
import { DEFAULT_CLASS_LEVELS } from '../constants/defaultClasses';
import { buildStandardClassDocumentId, buildTechnicalSpecialtyDocumentId, buildTechnicalClassDocumentId, resolveEducationType, getEducationTypeDisplayLabel, getSpecialtyName, getDisplayClassName, normalizeTechnicalSpecialtyName, getTechnicalSpecialtyCanonicalKey, resolveClassActiveStatus } from '../utils/classCatalog';
import type { ClassSection, TechnicalSpecialty } from '../types';
import Modal from '../components/Modal';
import { ClassSearchPicker } from '../components/classes/ClassSearchPicker';

const getCycleLabel = (cls: { cycle?: string; level?: string; name: string }): string => {
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

const Classes: React.FC = () => {
  const { db, updateLocalState, currentUser, currentSchool } = useAppContext();
  const { t } = useI18n();
  
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [educationTypeFilter, setEducationTypeFilter] = useState<string>('all');

  // State pour le modal de configuration de l'enseignement technique (P0-37)
  const [isTechModalOpen, setIsTechModalOpen] = useState<boolean>(false);
  const [techSection, setTechSection] = useState<'francophone' | 'anglophone'>('francophone');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>('');
  const [isCreatingNewSpec, setIsCreatingNewSpec] = useState<boolean>(false);
  const [newSpecName, setNewSpecName] = useState<string>('');
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);
  const [techSubmitting, setTechSubmitting] = useState<boolean>(false);

  // State pour le modal d'activation / désactivation de classe (P0-38)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [targetStatusClass, setTargetStatusClass] = useState<ClassSection | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState<boolean>(false);

  // Message d'état visuel (toast notification)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Utilisation de useMemo pour optimiser la réactivité et la performance
  const schoolClasses = React.useMemo(() => {
    return (db.classes || []).filter(c => currentSchool && String(c.schoolId || '') === currentSchool.id);
  }, [db.classes, currentSchool]);

  const generalClassesCount = React.useMemo(() => {
    return schoolClasses.filter(c => resolveEducationType(c.educationType, c.specialtyId).value === 'general').length;
  }, [schoolClasses]);

  const technicalClassesCount = React.useMemo(() => {
    return schoolClasses.filter(c => resolveEducationType(c.educationType, c.specialtyId).value === 'technical').length;
  }, [schoolClasses]);

  const activeClassesCount = React.useMemo(() => {
    return schoolClasses.filter(c => resolveClassActiveStatus(c)).length;
  }, [schoolClasses]);

  const inactiveClassesCount = React.useMemo(() => {
    return schoolClasses.length - activeClassesCount;
  }, [schoolClasses, activeClassesCount]);

  const filteredClasses = React.useMemo(() => {
    return schoolClasses.filter(c => {
      // Filtre par recherche
      const specName = c.specialtyId ? (getSpecialtyName(c.specialtyId, db.technicalSpecialties as Array<{ id: string; schoolId?: string; name: string }>, currentSchool?.id, c.type || c.section).name || '') : '';
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (c.type && c.type.toLowerCase().includes(searchTerm.toLowerCase())) ||
                            specName.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtre par cycle
      const cycleLabel = getCycleLabel(c);
      const matchesCycle = cycleFilter === 'all' || cycleLabel === cycleFilter;

      // Filtre par statut
      const isActive = resolveClassActiveStatus(c);
      const matchesStatus = statusFilter === 'all' ||
                            (statusFilter === 'active' && isActive) ||
                            (statusFilter === 'inactive' && !isActive);

      // Filtre par type d'enseignement
      const eduTypeRes = resolveEducationType(c.educationType, c.specialtyId);
      const matchesEducationType = educationTypeFilter === 'all' ||
                                   (educationTypeFilter === 'general' && eduTypeRes.value === 'general') ||
                                   (educationTypeFilter === 'technical' && eduTypeRes.value === 'technical');

      return matchesSearch && matchesCycle && matchesStatus && matchesEducationType;
    });
  }, [schoolClasses, searchTerm, cycleFilter, statusFilter, educationTypeFilter, db.technicalSpecialties, currentSchool?.id]);

  // Conservation de la sélection : effacé uniquement si la classe n'existe plus dans schoolClasses
  React.useEffect(() => {
    if (selectedClassId && !schoolClasses.some(c => c.id === selectedClassId)) {
      setSelectedClassId('');
    }
  }, [schoolClasses, selectedClassId]);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary'].includes(currentUser.role)) return null;

  const canManage = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
  const isSecretary = currentUser.role === 'secretary';

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setCycleFilter('all');
    setStatusFilter('all');
    setEducationTypeFilter('all');
  };

  const handleOpenStatusModal = (cls: ClassSection) => {
    setTargetStatusClass(cls);
    setIsStatusModalOpen(true);
  };

  const handleToggleClassStatus = async () => {
    if (!canManage || !currentSchool || !targetStatusClass) return;

    const newIsActive = targetStatusClass.isActive === false ? true : false;
    try {
      setStatusSubmitting(true);
      const { db: firestoreDb } = await import('../db/firebase');
      const { runTransaction, doc } = await import('firebase/firestore');

      await runTransaction(firestoreDb, async (transaction) => {
        const classRef = doc(firestoreDb, 'classes', targetStatusClass.id);
        const snap = await transaction.get(classRef);

        if (!snap.exists()) {
          throw new Error("La classe à modifier n'existe plus dans la base de données.");
        }

        const data = snap.data();
        if (String(data.schoolId || '') !== currentSchool.id) {
          throw new Error("La classe n'appartient pas à votre établissement.");
        }

        transaction.update(classRef, { isActive: newIsActive });
      });

      const updatedClasses = db.classes.map(c =>
        c.id === targetStatusClass.id ? { ...c, isActive: newIsActive } : c
      );

      updateLocalState({ classes: updatedClasses });
      setIsStatusModalOpen(false);
      setTargetStatusClass(null);
      showToast(newIsActive ? 'Classe activée avec succès' : 'Classe désactivée avec succès');
    } catch (err: unknown) {
      console.error("Erreur lors de la modification du statut de la classe :", err);
      const message = err instanceof Error ? err.message : "Une erreur s'est produite lors du changement de statut.";
      showToast(`Erreur : ${message}`);
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Détection des anomalies et classes manquantes pour l'aperçu et le bandeau d'alerte
  const canonicalLevels = DEFAULT_CLASS_LEVELS.filter(l => l.educationType === 'general');
  const missingLevels = canonicalLevels.filter(def => !schoolClasses.some(c => {
    const cType = c.type || c.section || 'francophone';
    const cName = c.name.toLowerCase().trim();
    const defName = def.name.toLowerCase().trim();

    // Equivalences
    if (defName === 'petite section' && (cName === 'maternelle 1' || cName === 'petite section')) return cType === def.section;
    if (defName === 'moyenne section' && (cName === 'maternelle 2' || cName === 'moyenne section')) return cType === def.section;
    if (defName === 'grande section' && (cName === 'maternelle 3' || cName === 'grande section')) return cType === def.section;
    if (defName === '6e' && (cName === '6ème' || cName === '6e')) return cType === def.section;
    if (defName === '5e' && (cName === '5ème' || cName === '5e')) return cType === def.section;

    return cName === defName && cType === def.section;
  }));

  const incoherentCycleClasses = schoolClasses.filter(c => {
    const nameLower = c.name.toLowerCase().trim();
    const cycleLabel = getCycleLabel(c);
    if (['class 3', 'class 4', 'class 5', 'class 6'].includes(nameLower) && (c.cycle === 'secondary' || cycleLabel === 'Secondaire')) {
      return true;
    }
    return false;
  });

  const handleSyncClasses = async () => {
    if (!canManage || !currentSchool) return;

    const toAdd = missingLevels.map(defCls => ({
      id: buildStandardClassDocumentId(currentSchool.id, defCls.catalogLevelId),
      catalogLevelId: defCls.catalogLevelId,
      schoolId: currentSchool.id,
      name: defCls.name,
      type: defCls.section,
      section: defCls.section,
      cycle: defCls.cycle,
      educationType: defCls.educationType,
      levelOrder: defCls.levelOrder,
      isDefault: true,
      isActive: true
    }));

    let msg = `=== APERÇU DE LA SYNCHRONISATION ===\n\n`;
    msg += `Classes déjà enregistrées dans l'école : ${schoolClasses.length}\n`;
    msg += `Niveaux généraux manquants à ajouter : ${toAdd.length}\n`;
    if (toAdd.length > 0) {
      msg += `Niveaux à créer : ${toAdd.map(a => `${a.name} (${a.section})`).join(', ')}\n`;
    }
    if (incoherentCycleClasses.length > 0) {
      msg += `\nAnomalies de cycle détectées (${incoherentCycleClasses.length}) : ${incoherentCycleClasses.map(c => c.name).join(', ')}\n`;
    }
    msg += `\nVoulez-vous procéder à la création des ${toAdd.length} classes manquantes ? (Aucune classe existante ne sera modifiée ou supprimée).`;

    if (toAdd.length === 0) {
      alert("Toutes les classes du catalogue standard sont déjà présentes pour votre établissement !");
      return;
    }

    if (window.confirm(msg)) {
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        const { writeBatch, doc } = await import('firebase/firestore');

        const batch = writeBatch(firestoreDb);
        toAdd.forEach(newCls => {
          const classRef = doc(firestoreDb, 'classes', newCls.id);
          batch.set(classRef, newCls, { merge: true });
        });

        await batch.commit();
        updateLocalState({ classes: [...db.classes, ...toAdd] });
        alert(`${toAdd.length} classes standards ont été complétées avec succès !`);
      } catch (err) {
        console.error("Erreur lors du batch de création des classes :", err);
        alert("Une erreur de permissions ou de réseau s’est produite lors du déploiement des classes.");
      }
    }
  };

  const handleChangeClass = (studentId: string, newClassId: string) => {
    if (!canManage) return;
    const newDb = { ...db };
    const studentIndex = newDb.students.findIndex(s => s.id === studentId);
    if (studentIndex >= 0) {
      const updatedStudents = newDb.students.map((s, idx) => idx === studentIndex ? { ...s, classId: newClassId } : s);
      updateLocalState({ students: updatedStudents });
    }
  };



  // Pré-résolution des noms de spécialités pour le tri
  const resolvedSpecNames: Record<string, string> = {};
  schoolClasses.forEach(c => {
    if (c.specialtyId) {
      const res = getSpecialtyName(
        c.specialtyId,
        db.technicalSpecialties as Array<{ id: string; schoolId?: string; name: string }>,
        currentSchool?.id,
        c.type || c.section
      );
      if (res.name) resolvedSpecNames[c.specialtyId] = res.name;
    }
  });

  const sortedFilteredClasses = sortClasses(filteredClasses, resolvedSpecNames);

  const currentClass = schoolClasses.find(c => c.id === selectedClassId);
  const teachers = currentClass ? db.staff.filter(s => s.role === 'teacher' && s.assignedClassId === currentClass.id) : [];
  const students = currentClass ? db.students.filter(s => s.classId === currentClass.id && String(s.schoolId || '') === currentSchool?.id) : [];

  // Spécialités techniques de l'école courante
  const schoolSpecialties = (db.technicalSpecialties || []).filter(
    s => currentSchool && String(s.schoolId || '') === currentSchool.id
  ) as TechnicalSpecialty[];

  // Niveaux techniques disponibles par section
  const availableTechLevels = DEFAULT_CLASS_LEVELS.filter(
    l => l.educationType === 'technical' && l.section === techSection
  );

  const handleOpenTechModal = () => {
    setIsTechModalOpen(true);
    setTechSection('francophone');
    setSelectedSpecialtyId('');
    setIsCreatingNewSpec(false);
    setNewSpecName('');
    setSelectedLevelIds([]);
  };

  const handleToggleLevel = (catalogLevelId: string) => {
    setSelectedLevelIds(prev =>
      prev.includes(catalogLevelId)
        ? prev.filter(id => id !== catalogLevelId)
        : [...prev, catalogLevelId]
    );
  };

  const handleCreateTechnicalClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !currentSchool) return;

    let targetSpecId = selectedSpecialtyId;
    let targetSpecName = '';
    let isNewSpecCreated = false;

    if (isCreatingNewSpec) {
      const normalizedInput = normalizeTechnicalSpecialtyName(newSpecName);
      if (!normalizedInput) {
        alert("Veuillez saisir un nom de filière valide.");
        return;
      }

      // Validation doublon dans la même école
      const canonicalInput = getTechnicalSpecialtyCanonicalKey(newSpecName);
      const duplicate = schoolSpecialties.find(
        s => getTechnicalSpecialtyCanonicalKey(s.name) === canonicalInput
      );
      if (duplicate) {
        alert(`La filière "${normalizedInput}" existe déjà dans votre établissement.`);
        return;
      }

      targetSpecId = buildTechnicalSpecialtyDocumentId(currentSchool.id, normalizedInput);
      targetSpecName = normalizedInput;
      isNewSpecCreated = true;
    } else {
      const foundSpec = schoolSpecialties.find(s => s.id === selectedSpecialtyId);
      if (!foundSpec) {
        alert("Veuillez sélectionner une filière existante ou en créer une nouvelle.");
        return;
      }
      targetSpecName = foundSpec.name;
    }

    if (selectedLevelIds.length === 0) {
      alert("Veuillez sélectionner au moins un niveau pour cette filière.");
      return;
    }

    // Préparation des classes à créer
    const candidateLevels = availableTechLevels.filter(l => selectedLevelIds.includes(l.catalogLevelId));

    const toAddTechClasses: ClassSection[] = [];
    candidateLevels.forEach(level => {
      // Vérification anti-doublon métier : même schoolId, même section, même catalogLevelId, même specialtyId, educationType technical
      const alreadyExists = schoolClasses.some(c =>
        c.educationType === 'technical' &&
        c.specialtyId === targetSpecId &&
        (c.catalogLevelId === level.catalogLevelId || c.name.toLowerCase().trim() === level.name.toLowerCase().trim())
      );

      if (!alreadyExists) {
        const classId = buildTechnicalClassDocumentId(currentSchool.id, level.catalogLevelId, targetSpecId);
        toAddTechClasses.push({
          id: classId,
          catalogLevelId: level.catalogLevelId,
          schoolId: currentSchool.id,
          name: level.name,
          type: techSection,
          section: techSection,
          cycle: 'secondary',
          educationType: 'technical',
          specialtyId: targetSpecId,
          levelOrder: level.levelOrder,
          isDefault: false,
          isActive: true
        });
      }
    });

    if (toAddTechClasses.length === 0 && !isNewSpecCreated) {
      alert("Toutes les classes sélectionnées pour cette filière existent déjà.");
      return;
    }

    // Aperçu avant écriture (Étape 4)
    let msg = `=== APERÇU DE LA CONFIGURATION TECHNIQUE ===\n\n`;
    msg += `Section linguistique : ${techSection === 'francophone' ? 'Francophone' : 'Anglophone'}\n`;
    msg += `Filière : ${targetSpecName}${isNewSpecCreated ? ' (Nouvelle)' : ''}\n`;
    msg += `Niveaux demandés : ${candidateLevels.map(l => l.name).join(', ')}\n`;
    msg += `Classes réellement à créer : ${toAddTechClasses.length}\n`;
    if (toAddTechClasses.length > 0) {
      msg += `Détail des créations : ${toAddTechClasses.map(c => `${c.name} (${targetSpecName})`).join(', ')}\n`;
    }
    if (window.confirm(msg)) {
      try {
        setTechSubmitting(true);
        const { db: firestoreDb } = await import('../db/firebase');
        const { runTransaction, doc } = await import('firebase/firestore');

        const txResult = await runTransaction(firestoreDb, async (transaction) => {
          // LECTURES D'ABORD (Mandat SDK Firestore)
          const specRef = doc(firestoreDb, 'technicalSpecialties', targetSpecId);
          const specSnap = await transaction.get(specRef);

          let createdSpec: TechnicalSpecialty | null = null;

          if (specSnap.exists()) {
            const specData = specSnap.data();
            if (String(specData.schoolId || '') !== currentSchool.id) {
              throw new Error("La filière ciblée n'appartient pas à votre établissement.");
            }
            if (specData.isActive === false) {
              throw new Error("La filière ciblée est actuellement inactive.");
            }
            const existingCanon = getTechnicalSpecialtyCanonicalKey(specData.name || '');
            const targetCanon = getTechnicalSpecialtyCanonicalKey(targetSpecName);
            if (existingCanon !== targetCanon) {
              throw new Error("Conflit de filière : un document d'identifiant identique existe avec un nom incompatible.");
            }
            if (specData.id && specData.id !== targetSpecId) {
              throw new Error("Conflit de filière : identifiant incohérent.");
            }
          }

          const existingClassSnaps = await Promise.all(
            toAddTechClasses.map(cls => transaction.get(doc(firestoreDb, 'classes', cls.id)))
          );

          const createdClss: ClassSection[] = [];
          const existingCompats: string[] = [];

          // Validation stricte des documents de classes existants
          existingClassSnaps.forEach((snap, idx) => {
            const expectedClass = toAddTechClasses[idx];
            if (snap.exists()) {
              const data = snap.data();
              const isSchoolCompat = String(data.schoolId || '') === currentSchool.id;
              const isEduCompat = data.educationType === 'technical';
              const isSpecCompat = data.specialtyId === targetSpecId;
              const isCatalogCompat = data.catalogLevelId === expectedClass.catalogLevelId;
              const isSectionCompat = (data.type || data.section) === techSection;
              const isIdCompat = !data.id || data.id === expectedClass.id;

              if (!isSchoolCompat || !isEduCompat || !isSpecCompat || !isCatalogCompat || !isSectionCompat || !isIdCompat) {
                throw new Error("Conflit de classe technique : un document incompatible utilise déjà cet identifiant.");
              }
              existingCompats.push(expectedClass.id);
            } else {
              createdClss.push(expectedClass);
            }
          });

          // ÉCRITURES ENSUITE
          if (isNewSpecCreated && !specSnap.exists()) {
            createdSpec = {
              id: targetSpecId,
              schoolId: currentSchool.id,
              name: targetSpecName,
              isActive: true
            };
            transaction.set(specRef, createdSpec);
          }

          createdClss.forEach(cls => {
            const classRef = doc(firestoreDb, 'classes', cls.id);
            transaction.set(classRef, cls);
          });

          return {
            createdSpecialty: createdSpec,
            createdClasses: createdClss,
            existingCompatibleClasses: existingCompats
          };
        });

        if (txResult.createdClasses.length === 0 && !txResult.createdSpecialty) {
          setIsTechModalOpen(false);
          alert("Toutes les classes techniques sélectionnées existent déjà.");
          return;
        }

        const updatedSpecialties = txResult.createdSpecialty
          ? [...(db.technicalSpecialties || []).filter(s => s.id !== txResult.createdSpecialty!.id), txResult.createdSpecialty]
          : db.technicalSpecialties;

        const newClassIds = new Set(txResult.createdClasses.map(c => c.id));
        const updatedClasses = [
          ...db.classes.filter(c => !newClassIds.has(c.id)),
          ...txResult.createdClasses
        ];

        updateLocalState({
          technicalSpecialties: updatedSpecialties,
          classes: updatedClasses
        });

        setIsTechModalOpen(false);
        alert(`Configuration technique enregistrée avec succès ! (${txResult.createdClasses.length} classe(s) créée(s))`);
      } catch (err: unknown) {
        console.error("Erreur lors de la création de la filière technique :", err);
        const message = err instanceof Error ? err.message : "Une erreur s'est produite lors de l'enregistrement de la filière.";
        alert(message);
      } finally {
        setTechSubmitting(false);
      }
    }
  };

  const isCatalogueComplete = missingLevels.length === 0;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>{t('classes', 'Classes & Vue d\'ensemble')}</h1>
        {canManage && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleOpenTechModal}
              style={{ background: '#4f46e5', color: '#fff', fontSize: '0.85rem', padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer' }}
            >
              ⚙️ Configurer l’enseignement technique
            </button>
            {isCatalogueComplete ? (
              <span style={{ backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.85rem', padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                ✓ Catalogue général complet — 34 classes
              </span>
            ) : (
              <button
                onClick={handleSyncClasses}
                style={{ background: 'var(--success)', fontSize: '0.85rem', padding: '0.6rem 1.2rem', fontWeight: 600, borderRadius: '8px' }}
              >
                Compléter les classes standard
              </button>
            )}
          </div>
        )}
      </div>

      {/* Résumé / Alertes d'état */}
      {isSecretary ? (
        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          ℹ️ <strong>Information Secrétariat :</strong> Consultez et sélectionnez les classes de l'établissement. Certaines classes doivent être configurées par le directeur ou le fondateur.
        </div>
      ) : (
        (!isCatalogueComplete || incoherentCycleClasses.length > 0) && (
          <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', color: '#873800', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {!isCatalogueComplete && (
              <div>⚠️ <strong>Catalogue incomplet :</strong> {missingLevels.length === 1 ? '1 classe standard manquante' : `${missingLevels.length} classes standards manquantes`} dans votre école. Cliquez sur « Compléter les classes standard » pour les ajouter.</div>
            )}
            {incoherentCycleClasses.length > 0 && (
              <div>⚠️ <strong>Anomalie de cycle :</strong> {incoherentCycleClasses.length === 1 ? '1 classe possède' : `${incoherentCycleClasses.length} classes possèdent`} un cycle incohérent (ex: Class 3-6 classées en secondaire).</div>
            )}
          </div>
        )
      )}

      {/* Barre de recherche et filtres */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Rechercher :</label>
          <input 
            type="text"
            placeholder="Nom de classe ou section..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
          />
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Cycle :</label>
          <select value={cycleFilter} onChange={e => setCycleFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <option value="all">Tous les cycles</option>
            <option value="Maternelle">Maternelle / Nursery</option>
            <option value="Primaire">Primaire / Primary</option>
            <option value="Secondaire">Secondaire / Secondary</option>
          </select>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Type d’enseignement :</label>
          <select value={educationTypeFilter} onChange={e => setEducationTypeFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <option value="all">Tous</option>
            <option value="general">Général</option>
            <option value="technical">Technique</option>
          </select>
        </div>
        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 500 }}>Statut :</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <option value="all">Toutes</option>
            <option value="active">Actives uniquement</option>
            <option value="inactive">Inactives uniquement</option>
          </select>
        </div>
        {(searchTerm || cycleFilter !== 'all' || statusFilter !== 'all' || educationTypeFilter !== 'all') && (
          <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="secondary"
              onClick={handleResetFilters}
              style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem' }}
            >
              🔄 Réinitialiser les filtres
            </button>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role={toastMessage.startsWith('Erreur') ? 'alert' : 'status'}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            backgroundColor: toastMessage.startsWith('Erreur') ? '#991b1b' : '#1e293b',
            color: '#ffffff',
            padding: '0.75rem 1.25rem',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: '0.9rem',
            fontWeight: 500
          }}
        >
          {toastMessage.startsWith('Erreur') ? '⚠️ ' : '✅ '}
          {toastMessage}
        </div>
      )}

      {/* Sélecteur de classe recherchable */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe à détailler :</label>
        <ClassSearchPicker
          classes={sortedFilteredClasses}
          selectedClassId={selectedClassId}
          onSelectClass={setSelectedClassId}
          technicalSpecialties={db.technicalSpecialties as TechnicalSpecialty[]}
          currentSchoolId={currentSchool?.id}
          students={db.students}
        />
        {canManage && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            💡 <em>L’enseignement technique se configure séparément pour ajouter des classes spécialisées.</em>
          </div>
        )}
      </div>

      {/* Résumé du catalogue (Section 7 P0-39B) */}
      <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <span>📊 <strong>Résumé du catalogue :</strong> {schoolClasses.length === 1 ? '1 classe' : `${schoolClasses.length} classes`}</span>
        <span>• {activeClassesCount === 1 ? '1 active' : `${activeClassesCount} actives`}</span>
        <span>• {inactiveClassesCount === 1 ? '1 inactive' : `${inactiveClassesCount} inactives`}</span>
        <span>• {generalClassesCount === 1 ? '1 générale' : `${generalClassesCount} générales`}</span>
        <span>• {technicalClassesCount === 1 ? '1 technique' : `${technicalClassesCount} techniques`}</span>
      </div>

      {schoolClasses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Aucune classe n’est encore configurée pour cet établissement.
        </div>
      ) : sortedFilteredClasses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          {educationTypeFilter === 'technical' ? (
            <div>
              <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-color)', marginBottom: '0.5rem' }}>
                Aucune classe technique configurée.
              </p>
              {canManage && (
                <button
                  onClick={handleOpenTechModal}
                  style={{ marginTop: '0.75rem', background: '#4f46e5', color: '#fff', fontSize: '0.85rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                >
                  ⚙️ Configurer l’enseignement technique
                </button>
              )}
            </div>
          ) : searchTerm ? (
            <div>
              <p style={{ marginBottom: '0.75rem' }}>Aucune classe trouvée pour cette recherche.</p>
              <button type="button" className="secondary" onClick={handleResetFilters} style={{ fontSize: '0.85rem' }}>
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: '0.75rem' }}>Aucune classe ne correspond aux filtres sélectionnés.</p>
              <button type="button" className="secondary" onClick={handleResetFilters} style={{ fontSize: '0.85rem' }}>
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>
      ) : currentClass ? (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>{getDisplayClassName(currentClass.name)}</h2>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: '#e0e7ff', color: '#3730a3' }}>
                  {(currentClass.type || currentClass.section || 'francophone') === 'francophone' ? 'Francophone' : 'Anglophone'}
                </span>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: '#f3e8ff', color: '#6b21a8' }}>
                  {getCycleLabel(currentClass)}
                </span>
                {(() => {
                  const eduRes = resolveEducationType(currentClass.educationType, currentClass.specialtyId);
                  const eduText = getEducationTypeDisplayLabel(eduRes.value, currentClass.type || currentClass.section);
                  const isAnomaly = eduRes.isAnomaly;
                  const bg = isAnomaly ? '#fef2f2' : eduRes.value === 'technical' ? '#ffedd5' : '#e0f2fe';
                  const fg = isAnomaly ? '#991b1b' : eduRes.value === 'technical' ? '#9a3412' : '#075985';
                  return (
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: bg, color: fg }}>
                      {eduText}
                    </span>
                  );
                })()}
                {(() => {
                  if (!currentClass.specialtyId) return null;
                  const specRes = getSpecialtyName(
                    currentClass.specialtyId,
                    db.technicalSpecialties as Array<{ id: string; schoolId?: string; name: string }>,
                    currentSchool?.id,
                    currentClass.type || currentClass.section
                  );
                  if (!specRes.name) return null;
                  const bg = specRes.isUnavailable ? '#fee2e2' : '#fef3c7';
                  const fg = specRes.isUnavailable ? '#991b1b' : '#92400e';
                  return (
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, background: bg, color: fg }}>
                      {specRes.name}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: resolveClassActiveStatus(currentClass) ? '#d1fae5' : '#fee2e2',
                color: resolveClassActiveStatus(currentClass) ? '#065f46' : '#991b1b'
              }}>
                {resolveClassActiveStatus(currentClass) ? 'Active' : 'Inactive'}
              </span>
              {canManage && (
                <button
                  type="button"
                  className={resolveClassActiveStatus(currentClass) ? "secondary" : "primary"}
                  onClick={() => handleOpenStatusModal(currentClass)}
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    borderColor: resolveClassActiveStatus(currentClass) ? '#dc2626' : undefined,
                    color: resolveClassActiveStatus(currentClass) ? '#dc2626' : undefined
                  }}
                >
                  {resolveClassActiveStatus(currentClass) ? 'Désactiver la classe' : 'Activer la classe'}
                </button>
              )}
            </div>
          </div>
          {resolveEducationType(currentClass.educationType, currentClass.specialtyId).isAnomaly && canManage && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '6px', fontSize: '0.85rem' }}>
              ⚠️ <strong>Certaines informations de cette classe doivent être vérifiées.</strong> (Cette classe possède une spécialité mais son type d'enseignement est indéterminé).
            </div>
          )}
          {(() => {
            if (!currentClass.specialtyId) return null;
            const specRes = getSpecialtyName(
              currentClass.specialtyId,
              db.technicalSpecialties as Array<{ id: string; schoolId?: string; name: string }>,
              currentSchool?.id,
              currentClass.type || currentClass.section
            );
            if (specRes.isUnavailable && canManage) {
              return (
                <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: '#fff7ed', border: '1px solid #ffedd5', color: '#c2410c', borderRadius: '6px', fontSize: '0.85rem' }}>
                  ⚠️ <strong>Certaines informations de cette classe doivent être vérifiées.</strong> (La filière liée à cette classe est inactive ou non disponible).
                </div>
              );
            }
            return null;
          })()}
          
          <h3 style={{ marginTop: '1.5rem', color: 'var(--primary-color)' }}>
            {teachers.length === 1 ? 'Enseignant titulaire' : 'Enseignants titulaires'}
          </h3>
          <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '2rem' }}>
            {teachers.length > 0 ? (
              teachers.map(t => <li key={t.id} style={{ padding: '0.25rem 0' }}>{t.name}</li>)
            ) : (
              <li style={{ color: 'var(--text-muted)' }}>Aucun enseignant titulaire assigné.</li>
            )}
          </ul>
          
          <h3 style={{ marginTop: '1.5rem', color: 'var(--primary-color)' }}>
            Élèves inscrits ({students.length === 0 ? '0 élève' : students.length === 1 ? '1 élève' : `${students.length} élèves`})
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Nom</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Sexe</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Parent</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '120px' }}>Contact</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', minWidth: '150px' }}>Adresse</th>
                  {canManage && <th style={{ padding: '0.75rem', textAlign: 'left' }}>Action (Reclasser)</th>}
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Aucun élève inscrit dans cette classe.
                    </td>
                  </tr>
                ) : (
                  students.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem' }}>{s.name}</td>
                      <td style={{ padding: '0.75rem' }}>{s.gender}</td>
                      <td style={{ padding: '0.75rem' }}>{s.parentName}</td>
                      <td style={{ padding: '0.75rem' }}>{s.parentPhone || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>{s.address || '-'}</td>
                      {canManage && (
                        <td style={{ padding: '0.75rem' }}>
                          <select 
                            value={s.classId || ''} 
                            onChange={e => handleChangeClass(s.id, e.target.value)}
                            style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                          >
                            {sortClasses(schoolClasses.filter(c => c.isActive !== false)).filter(c => (c.type || c.section) === s.section).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Modal de Configuration de l'Enseignement Technique (P0-37) */}
      {canManage && (
        <Modal
          isOpen={isTechModalOpen}
          onClose={() => setIsTechModalOpen(false)}
          title="⚙️ Configurer l’enseignement technique"
        >
          <form onSubmit={handleCreateTechnicalClasses} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* ÉTAPE 1 : Section Linguistique */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                1. Section linguistique :
              </label>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="techSection"
                    value="francophone"
                    checked={techSection === 'francophone'}
                    onChange={() => {
                      setTechSection('francophone');
                      setSelectedLevelIds([]);
                    }}
                  />
                  Francophone
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="techSection"
                    value="anglophone"
                    checked={techSection === 'anglophone'}
                    onChange={() => {
                      setTechSection('anglophone');
                      setSelectedLevelIds([]);
                    }}
                  />
                  Anglophone
                </label>
              </div>
            </div>

            {/* ÉTAPE 2 : Filière technique */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                2. Filière technique :
              </label>

              {!isCreatingNewSpec ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <select
                    value={selectedSpecialtyId}
                    onChange={e => setSelectedSpecialtyId(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  >
                    <option value="">-- Choisir une filière existante ({schoolSpecialties.length}) --</option>
                    {schoolSpecialties.map(spec => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setIsCreatingNewSpec(true)}
                    style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                  >
                    + Ajouter une nouvelle filière
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Nom de la nouvelle filière :</label>
                  <input
                    type="text"
                    placeholder="Ex: Électricité, Froid et climatisation, Comptabilité..."
                    value={newSpecName}
                    onChange={e => setNewSpecName(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setIsCreatingNewSpec(false);
                      setNewSpecName('');
                    }}
                    style={{ alignSelf: 'flex-start', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                  >
                    ← Sélectionner une filière existante
                  </button>
                </div>
              )}
            </div>

            {/* ÉTAPE 3 : Niveaux concernés */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
                3. Niveaux concernés par cette filière :
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                {availableTechLevels.map(level => {
                  const isChecked = selectedLevelIds.includes(level.catalogLevelId);
                  return (
                    <label key={level.catalogLevelId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleLevel(level.catalogLevelId)}
                      />
                      {level.name}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Boutons d'action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setIsTechModalOpen(false)}
                disabled={techSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                disabled={techSubmitting}
              >
                {techSubmitting ? 'Enregistrement...' : 'Aperçu & Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de Confirmation d'Activation / Désactivation de Classe (P0-38) */}
      {canManage && targetStatusClass && (
        <Modal
          isOpen={isStatusModalOpen}
          onClose={() => {
            if (!statusSubmitting) {
              setIsStatusModalOpen(false);
              setTargetStatusClass(null);
            }
          }}
          title={targetStatusClass.isActive === false ? "Réactiver cette classe ?" : "Désactiver cette classe ?"}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>
              {targetStatusClass.isActive === false ? (
                <>
                  Voulez-vous réactiver la classe <strong>{getDisplayClassName(targetStatusClass.name)}</strong> ({resolveEducationType(targetStatusClass.educationType, targetStatusClass.specialtyId).value === 'technical' ? 'Enseignement technique' : 'Enseignement général'}) ?
                  <br /><br />
                  Cette classe redeviendra disponible pour les nouvelles inscriptions et les reclassements d’élèves.
                </>
              ) : (
                <>
                  Voulez-vous désactiver la classe <strong>{getDisplayClassName(targetStatusClass.name)}</strong> ({resolveEducationType(targetStatusClass.educationType, targetStatusClass.specialtyId).value === 'technical' ? 'Enseignement technique' : 'Enseignement général'}) ?
                  <br /><br />
                  {(() => {
                    const studentCount = db.students.filter(s => s.classId === targetStatusClass.id && String(s.schoolId || '') === currentSchool?.id).length;
                    if (studentCount > 0) {
                      return `Cette classe contient ${studentCount === 1 ? '1 élève' : `${studentCount} élèves`}. Ils resteront inscrits dans cette classe, mais aucune nouvelle inscription ne sera autorisée tant qu’elle restera inactive.`;
                    }
                    return "Aucune nouvelle inscription ni reclassement vers cette classe ne sera autorisé tant qu’elle restera inactive.";
                  })()}
                </>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setIsStatusModalOpen(false);
                  setTargetStatusClass(null);
                }}
                disabled={statusSubmitting}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleToggleClassStatus}
                disabled={statusSubmitting}
                style={{
                  background: targetStatusClass.isActive === false ? '#10b981' : '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {statusSubmitting
                  ? 'Mise à jour...'
                  : targetStatusClass.isActive === false
                    ? 'Activer la classe'
                    : 'Désactiver la classe'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Classes;
