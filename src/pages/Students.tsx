import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { Plus, Edit2, Trash2, HeartPulse, FileSpreadsheet, Printer } from 'lucide-react';
import type { Student, SectionType } from '../types';
import Modal from '../components/Modal';
import { sortClasses } from '../utils/sortClasses';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';
import * as XLSX from 'xlsx';
import { getStudentLimit, isStudentLimitReached, getStudentLimitLabel } from '../utils/saas';

const Students: React.FC = () => {
  const { t } = useI18n();
  const [isModalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { db, saveDB, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();
  const limitReached = isStudentLimitReached(currentSchool, db.students.length);
  const limitLabel = getStudentLimitLabel(currentSchool, db.students.length);
  const [currentStudent, setCurrentStudent] = useState<Partial<Student>>({ gender: 'M', section: 'francophone', classId: '' });
  
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
    } else {
      setCurrentStudent({ id: crypto.randomUUID(), name: '', gender: 'M', dob: '', section: 'francophone', parentName: '' });
      setIsEditing(false);
    }
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent.classId) {
      alert("Veuillez choisir une classe !");
      return;
    }
    
    // SaaS Limit Check for creation
    if (!isEditing && limitReached) {
      alert("La limite du nombre d'élèves pour votre abonnement SaaS a été atteinte. Veuillez passer au plan supérieur.");
      return;
    }

    const newDb = { ...db };
    if (isEditing && currentStudent.id) {
      newDb.students = newDb.students.map(s => s.id === currentStudent.id ? currentStudent as Student : s);
    } else {
      newDb.students.push({ ...currentStudent, id: crypto.randomUUID() } as Student);
    }
    saveDB(newDb);
    setModalOpen(false);

    logAuditAction({
      action: isEditing ? 'UPDATE_STUDENT' : 'CREATE_STUDENT',
      targetType: 'STUDENT',
      targetId: currentStudent.id as string,
      targetName: currentStudent.name as string
    });
  };

  const handleDelete = (student: Student) => {
    if (!currentUser || !currentSchool) return;
    
    if (confirm(t('delete') + ' cet élève ?')) {
      const canDeleteDirectly = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
      
      const newDb = { ...db };
      
      if (canDeleteDirectly) {
        newDb.students = db.students.filter(s => s.id !== student.id);
        saveDB(newDb);
        alert("Élève supprimé avec succès.");
        logAuditAction({
          action: 'DELETE_STUDENT',
          targetType: 'STUDENT',
          targetId: student.id,
          targetName: student.name
        });
      } else {
        // Créer une requête de validation
        if (!newDb.validation_requests) newDb.validation_requests = [];
        newDb.validation_requests.push({
          id: crypto.randomUUID(),
          schoolId: currentSchool.id,
          requesterId: currentUser.id,
          requesterRole: currentUser.role,
          actionType: 'DELETE_STUDENT',
          targetCollection: 'students',
          targetDocumentId: student.id,
          proposedData: student,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
        saveDB(newDb);
        alert("Demande de suppression envoyée pour validation (Directeur / Super Admin).");
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
            detectedClassName: detectedClassName
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
            Capacité SaaS : {limitLabel}
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
          <button onClick={() => handleOpenModal()} disabled={isSchoolSuspended || limitReached} title={limitReached ? "Limite SaaS atteinte" : ""}>
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
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>{t('cancel', 'Annuler')}</button>
            <button type="submit">{t('save', 'Enregistrer')}</button>
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
    </div>
  );
};

export default Students;
