import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Grade } from '../types';
import Modal from '../components/Modal';
import { Plus, Printer, Trophy } from 'lucide-react';
import { sortClasses } from '../utils/sortClasses';
import SchoolDocumentHeader from '../components/SchoolDocumentHeader';

export const getAppreciation = (score: number, max: number = 20) => {
  const normalized = (score / max) * 20;
  if (normalized >= 18) return 'Excellent';
  if (normalized >= 16) return 'Très Bien';
  if (normalized >= 14) return 'Bien';
  if (normalized >= 12) return 'Assez Bien';
  if (normalized >= 10) return 'Passable';
  if (normalized >= 8) return 'Insuffisant';
  return 'Faible';
};

const Grades: React.FC = () => {
  const { db, saveDB, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'individual'|'ranking'|'school'>('individual');

  // Logic for Individual Tab
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [bulkStudentId, setBulkStudentId] = useState<string>('');
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bulkGrades, setBulkGrades] = useState<Record<string, {score: string, maxScore: string}>>({});

  // Logic for Ranking Tab
  const [selectedClassRank, setSelectedClassRank] = useState<string>('');

  const handleOpenModal = () => {
    setBulkStudentId(selectedStudent || '');
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkGrades({});
    setModalOpen(true);
  };

  const handleUpdateBulkGrade = (subjectId: string, field: 'score'|'maxScore', value: string) => {
    setBulkGrades({
      ...bulkGrades,
      [subjectId]: {
        ...(bulkGrades[subjectId] || { score: '', maxScore: '20' }),
        [field]: value
      }
    });
  };

  const handleSaveBulk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkStudentId || !currentUser || !currentSchool) return;
    
    const canSaveDirectly = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
    const newDb = { ...db };
    let hasValidations = false;

    Object.keys(bulkGrades).forEach(subjectId => {
      const g = bulkGrades[subjectId];
      if (g.score !== '') {
        const gradeObj: Grade = {
          id: crypto.randomUUID(),
          studentId: bulkStudentId,
          subjectId,
          score: parseFloat(g.score),
          maxScore: parseFloat(g.maxScore) || 20,
          date: bulkDate
        };

        if (canSaveDirectly) {
          newDb.grades.push(gradeObj);
          logAuditAction({
            action: 'CREATE_GRADE',
            targetType: 'GRADE',
            targetId: gradeObj.id,
            targetName: `Note de ${g.score} en ${subjectId}`
          });
        } else {
          hasValidations = true;
          newDb.validation_requests = [...(newDb.validation_requests || []), {
            id: crypto.randomUUID(),
            schoolId: currentSchool.id,
            requesterId: currentUser.id,
            requesterRole: currentUser.role,
            actionType: 'UPDATE_GRADE',
            targetCollection: 'grades',
            targetDocumentId: gradeObj.id,
            proposedData: gradeObj,
            status: 'pending',
            createdAt: new Date().toISOString()
          }];
        }
      }
    });
    
    saveDB(newDb);
    setModalOpen(false);
    if (hasValidations) {
      alert("Les notes ont été soumises pour validation par le Directeur.");
    } else {
      alert("Notes enregistrées avec succès.");
    }
  };

  const handlePrint = (selector: string, filename: string) => {
    import('html2canvas').then(({ default: html2canvas }) => {
      import('jspdf').then(({ jsPDF }) => {
        const el = document.querySelector(selector) as HTMLElement;
        if (!el) return;
        html2canvas(el, { scale: 2 }).then((canvas: any) => {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`${filename}.pdf`);
          logAuditAction({
            action: 'EXPORT_PDF',
            targetType: 'DOCUMENT',
            targetId: filename,
            targetName: `Export PDF: ${filename}`
          });
        });
      });
    });
  };

  const studentGrades = db.grades.filter(g => g.studentId === selectedStudent);
  const student = db.students.find(s => s.id === selectedStudent);
  const studentClass = db.classes.find(c => c.id === student?.classId);
  const totalNormalized = studentGrades.reduce((sum, g) => sum + ((g.score / (g.maxScore || 20)) * 20), 0);
  const average = studentGrades.length > 0 ? totalNormalized / studentGrades.length : 0;

  // Ranking Calculation
  const classStudents = db.students.filter(s => s.classId === selectedClassRank);
  const rankingData = classStudents.map(s => {
    const sGrades = db.grades.filter(g => g.studentId === s.id);
    const sum = sGrades.reduce((acc, g) => acc + ((g.score / (g.maxScore || 20)) * 20), 0);
    const avg = sGrades.length > 0 ? sum / sGrades.length : 0;
    return { student: s, avg, hasGrades: sGrades.length > 0 };
  }).filter(d => d.hasGrades).sort((a, b) => b.avg - a.avg);

  const classAvg = rankingData.length > 0 ? rankingData.reduce((sum, d) => sum + d.avg, 0) / rankingData.length : 0;
  const currentRankClass = db.classes.find(c => c.id === selectedClassRank);

  // School Ranking Calculation
  const schoolRankingData = db.classes.map(c => {
    const cStudents = db.students.filter(s => s.classId === c.id);
    const validStudentAvgs = cStudents.map(s => {
      const sGrades = db.grades.filter(g => g.studentId === s.id);
      const sum = sGrades.reduce((acc, g) => acc + ((g.score / (g.maxScore || 20)) * 20), 0);
      return sGrades.length > 0 ? sum / sGrades.length : null;
    }).filter(a => a !== null) as number[];
    
    const cAvg = validStudentAvgs.length > 0 ? validStudentAvgs.reduce((sum, a) => sum + a, 0) / validStudentAvgs.length : 0;
    return { class: c, avg: cAvg, studentCount: cStudents.length, evaluatedCount: validStudentAvgs.length };
  }).filter(d => d.evaluatedCount > 0).sort((a, b) => b.avg - a.avg);

  return (
    <div className="page-container" id="grades-page">
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; width: 100%; border: none !important; box-shadow: none !important; }
            .no-print { display: none !important; }
            .sidebar { display: none !important; }
          }
        `}
      </style>
      <div className="page-header no-print">
        <h1>{t('grades', 'Notes & Bulletins')}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleOpenModal} disabled={isSchoolSuspended}>
            <Plus size={18} /> Saisir des Notes
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', overflowX: 'auto' }} className="no-print">
        <button className={activeTab === 'individual' ? '' : 'secondary'} style={{ border: activeTab === 'individual' ? '' : 'none', whiteSpace: 'nowrap' }} onClick={() => setActiveTab('individual')}>Bulletin Individuel</button>
        <button className={activeTab === 'ranking' ? '' : 'secondary'} style={{ border: activeTab === 'ranking' ? '' : 'none', whiteSpace: 'nowrap' }} onClick={() => setActiveTab('ranking')}><Trophy size={18} style={{marginRight:'0.5rem', verticalAlign:'middle'}}/> Palmarès (Classement par Classe)</button>
        <button className={activeTab === 'school' ? '' : 'secondary'} style={{ border: activeTab === 'school' ? '' : 'none', whiteSpace: 'nowrap' }} onClick={() => setActiveTab('school')}><Trophy size={18} style={{marginRight:'0.5rem', verticalAlign:'middle', color: 'var(--warning)'}}/> Classement Global (Toute l'École)</button>
      </div>

      {activeTab === 'individual' && (
        <>
          <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner un élève :</label>
              <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
                <option value="">-- Choisir --</option>
                {db.students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.section})</option>)}
              </select>
            </div>
            {selectedStudent && (
              <button className="secondary" onClick={() => handlePrint('.print-bulletin', `bulletin_${student?.name}`)}>
                <Printer size={18} /> Imprimer Bulletin
              </button>
            )}
          </div>

          {selectedStudent && student && (
             <div className="card print-area print-bulletin" style={{ padding: '2rem', background: '#fff' }}>
               <SchoolDocumentHeader school={currentSchool} documentTitle="Bulletin Trimestriel" />
               <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem' }}>
                 <h3>{student.name}</h3>
                 <p>Classe : {studentClass?.name || student.section} | Date : {new Date().toLocaleDateString('fr-FR')}</p>
               </div>
               
               <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: '1.5rem' }}>
                 <thead style={{ background: '#f8f9fa' }}>
                   <tr>
                     <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Matière</th>
                     <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Date</th>
                     <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Note</th>
                     <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Appréciation</th>
                   </tr>
                 </thead>
                 <tbody>
                   {studentGrades.length === 0 ? (
                     <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }}>Aucune note</td></tr>
                   ) : (
                     studentGrades.map(g => {
                       const subject = db.subjects.find(s => s.id === g.subjectId);
                       return (
                         <tr key={g.id}>
                           <td style={{ border: '1px solid #000', padding: '0.75rem' }}>{subject?.name || 'Inconnue'}</td>
                           <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>{new Date(g.date).toLocaleDateString('fr-FR')}</td>
                           <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>{g.score} / {g.maxScore || 20}</td>
                           <td style={{ border: '1px solid #000', padding: '0.75rem', fontStyle: 'italic' }}>{getAppreciation(g.score, g.maxScore || 20)}</td>
                         </tr>
                       )
                     })
                   )}
                 </tbody>
               </table>
               
               {studentGrades.length > 0 && (
                 <div style={{ padding: '1.5rem', border: '2px solid #000', borderRadius: '4px', background: '#f8f9fa' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                     <p style={{ fontSize: '1.2rem', margin: 0 }}><strong>Moyenne Trimestrielle : </strong> {average.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / 20</p>
                     <p style={{ fontSize: '1.1rem', margin: 0 }}><strong>Mention : </strong> {getAppreciation(average, 20)}</p>
                   </div>
                   <p style={{ margin: 0 }}><strong>Décision du Conseil des Professeurs :</strong> Élève {average >= 10 ? 'admis(e)' : 'ajourné(e)'}</p>
                 </div>
               )}

               <div style={{ marginTop: '3rem', display: 'flex', justifyContent: 'space-between' }}>
                 <div style={{ textAlign: 'left' }}>
                    <p>Signature du Titulaire</p>
                    <div style={{ marginTop: '3rem', borderBottom: '1px dotted #000', width: '200px' }}></div>
                 </div>
                 <div style={{ textAlign: 'right' }}>
                    <p>Signature du Directeur</p>
                    <div style={{ marginTop: '3rem', borderBottom: '1px dotted #000', width: '200px', display: 'inline-block' }}></div>
                 </div>
               </div>
             </div>
          )}
        </>
      )}

      {activeTab === 'ranking' && (
        <>
          <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Sélectionner une classe complète :</label>
              <select value={selectedClassRank} onChange={e => setSelectedClassRank(e.target.value)}>
                <option value="">-- Choisir une classe --</option>
                {sortClasses(db.classes).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
            {selectedClassRank && rankingData.length > 0 && (
              <button className="secondary" onClick={() => handlePrint('.print-ranking', `palmares_${currentRankClass?.name}`)}>
                <Printer size={18} /> Imprimer Palmarès
              </button>
            )}
          </div>

          {selectedClassRank && currentRankClass && (
            <div className="card print-area print-ranking" style={{ padding: '2rem', background: '#fff' }}>
              <SchoolDocumentHeader school={currentSchool} documentTitle="Palmarès Trimestriel" />
              <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem' }}>
                <h3>Classement et Palmarès</h3>
                <p>Classe : {currentRankClass.name} | Effectif classé : {rankingData.length}</p>
              </div>

              {rankingData.length > 0 ? (
                <>
                  <div style={{ background: '#eef2ff', padding: '1.5rem', borderRadius: '4px', marginBottom: '2rem', border: '1px solid var(--primary-color)' }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-color)' }}>Statistiques de la Classe</h3>
                    <p style={{ margin: 0, fontSize: '1.2rem' }}>
                      <strong>Moyenne Générale :</strong> {classAvg.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / 20
                      <span style={{ fontSize: '0.9rem', marginLeft: '1rem', color: 'var(--text-muted)' }}>({getAppreciation(classAvg, 20)})</span>
                    </p>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                    <thead style={{ background: 'var(--bg-color)' }}>
                      <tr>
                        <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', width: '80px' }}>Rang</th>
                        <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Nom de l'élève</th>
                        <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Moyenne (/20)</th>
                        <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Appréciation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingData.map((d, index) => (
                        <tr key={d.student.id} style={{ background: index === 0 ? '#fffbeb' : 'transparent' }}>
                          <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                            {index + 1}{index === 0 ? 'er' : 'e'}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '0.75rem', fontWeight: 500 }}>
                            {index === 0 && <Trophy size={16} color="var(--warning)" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />}
                            {d.student.name}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                            {d.avg.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '0.75rem', fontStyle: 'italic' }}>
                            {getAppreciation(d.avg, 20)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun élève de cette classe n'a de notes enregistrées.</p>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'school' && (
        <>
          <div className="card no-print" style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            {schoolRankingData.length > 0 && (
              <button className="secondary" onClick={() => handlePrint('.print-school', `classement_ecole`)}>
                <Printer size={18} /> Imprimer le Classement Global
              </button>
            )}
          </div>

          <div className="card print-area print-school" style={{ padding: '2rem', background: '#fff' }}>
            <SchoolDocumentHeader school={currentSchool} documentTitle="Classement Global" />
            <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem' }}>
              <h3>Classement de l'École par Classe</h3>
              <p>Basé sur la moyenne générale de chaque classe | Date : {new Date().toLocaleDateString('fr-FR')}</p>
            </div>

            {schoolRankingData.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                <thead style={{ background: 'var(--bg-color)' }}>
                  <tr>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', width: '80px' }}>Rang</th>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Classe</th>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Section</th>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Élèves Évalués</th>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Moyenne Globale</th>
                    <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Appréciation Groupée</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolRankingData.map((d, index) => (
                    <tr key={d.class.id} style={{ background: index === 0 ? '#fffbeb' : 'transparent' }}>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                        {index + 1}{index === 0 ? 'er' : 'e'}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', fontWeight: 500 }}>
                        {index === 0 && <Trophy size={16} color="var(--warning)" style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />}
                        {d.class.name}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>
                        {d.class.type}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>
                        {d.evaluatedCount} / {d.studentCount}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                        {d.avg.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                      <td style={{ border: '1px solid #000', padding: '0.75rem', fontStyle: 'italic' }}>
                        {getAppreciation(d.avg, 20)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucune note n'a encore été enregistrée dans l'établissement.</p>
            )}
          </div>
        </>
      )}

      {/* Bulk Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Saisie Rapide des Notes">
        <form onSubmit={handleSaveBulk}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Élève</label>
              <select required value={bulkStudentId} onChange={e => setBulkStudentId(e.target.value)}>
                <option value="">-- Choisir un élève --</option>
                {db.students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.section})</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Date Enregistrement</label>
              <input type="date" required value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
            </div>
          </div>
          
          <div style={{ maxHeight: '400px', overflowY: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            {(() => {
              const student = db.students.find(s => s.id === bulkStudentId);
              const stClass = db.classes.find(c => c.id === student?.classId);
              const mappedSubIds = stClass?.subjects;
              let applicableSubjects = db.subjects;
              if (mappedSubIds && mappedSubIds.length > 0) {
                 applicableSubjects = db.subjects.filter(s => mappedSubIds.includes(s.id));
              }

              if (applicableSubjects.length === 0) {
                return <p style={{ color: 'var(--danger)' }}>Aucune matière disponible pour cette classe ou aucune matière configurée.</p>;
              }

              return (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Matière</th>
                      <th style={{ textAlign: 'center', paddingBottom: '0.5rem', width: '100px' }}>Note</th>
                      <th style={{ textAlign: 'center', paddingBottom: '0.5rem', width: '100px' }}>Sur (Max)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicableSubjects.map(sub => {
                      const currentObj = bulkGrades[sub.id] || { score: '', maxScore: '20' };
                      return (
                        <tr key={sub.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem 0' }}>{sub.name}</td>
                          <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                            <input 
                              type="number" step="0.25" min="0" placeholder="ex: 15"
                              style={{ width: '80px', textAlign: 'center' }} 
                              value={currentObj.score} 
                              onChange={e => handleUpdateBulkGrade(sub.id, 'score', e.target.value)} 
                            />
                          </td>
                          <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                            <input 
                              type="number" step="1" min="1" 
                              style={{ width: '80px', textAlign: 'center' }} 
                              value={currentObj.maxScore} 
                              onChange={e => handleUpdateBulkGrade(sub.id, 'maxScore', e.target.value)} 
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Annuler</button>
            <button type="submit">Enregistrer les notes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Grades;
