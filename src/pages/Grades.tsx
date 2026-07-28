import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import type { Grade, Evaluation } from '../types';
import { getLegacyGradeNormalizedValue } from '../utils/legacyGrades';
import { getEffectiveClassSubjects } from '../services/effectiveClassSubjects';
import { upsertGradeInCache } from '../services/gradeUpsert';
import { upsertEvaluationInCache } from '../services/evaluationUpsert';
import { groupGradesByClassSubject, calculateSubjectAverage, calculateWeightedGeneralAverage } from '../services/gradeCalculations';
import { buildEvaluationId, buildGradeId } from '../utils/gradeIds';
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
  const { db, safeMergeDB, currentUser, currentSchool, logAuditAction, isSchoolSuspended } = useAppContext();
  const { t } = useI18n();
  
  const [activeTab, setActiveTab] = useState<'individual'|'ranking'|'school'>('individual');

  // Logic for Individual Tab
  const [selectedStudent, setSelectedStudent] = useState<string>('');

  // New Workflow States for Modal
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<string>('');
  const [evaluationMode, setEvaluationMode] = useState<'existing'|'new'|''>('');
  const [selectedEvaluationId, setSelectedEvaluationId] = useState<string>('');
  const [newEvaluationKey, setNewEvaluationKey] = useState<string>('');
  const [evaluationTitle, setEvaluationTitle] = useState<string>('');
  const [evaluationType, setEvaluationType] = useState<string>('exam');
  const [evaluationDate, setEvaluationDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [evaluationMaxScore, setEvaluationMaxScore] = useState<string>('20');
  const [evaluationWeight, setEvaluationWeight] = useState<string>('1');
  const [gradeEntryRows, setGradeEntryRows] = useState<Record<string, {score: string}>>({});

  // Logic for Ranking Tab
  const [selectedClassRank, setSelectedClassRank] = useState<string>('');

  if (!currentUser || !['superAdmin', 'owner', 'director', 'secretary', 'teacher'].includes(currentUser.role)) return null;

  const activeYear = db.academicYears?.find(y => y.schoolId === currentSchool?.id && y.status === 'active');
  const periods = db.periods?.filter(p => p.schoolId === currentSchool?.id && p.academicYearId === activeYear?.id) || [];

  const handleOpenModal = () => {
    setSelectedAcademicYearId(activeYear?.id || '');
    setSelectedPeriodId('');
    setSelectedClassId('');
    setSelectedClassSubjectId('');
    setEvaluationMode('');
    setSelectedEvaluationId('');
    setNewEvaluationKey('');
    setEvaluationTitle('');
    setEvaluationType('exam');
    setEvaluationDate(new Date().toISOString().split('T')[0]);
    setEvaluationMaxScore('20');
    setEvaluationWeight('1');
    setGradeEntryRows({});
    setModalOpen(true);
  };

  const handleModeChange = (mode: 'existing'|'new') => {
    setEvaluationMode(mode);
    if (mode === 'new' && !newEvaluationKey) {
      setNewEvaluationKey(crypto.randomUUID());
    }
  };

  const handleExistingEvalChange = (evalId: string) => {
    setSelectedEvaluationId(evalId);
    const existing = db.evaluations?.find(e => e.id === evalId);
    if (existing) {
      setEvaluationMaxScore(existing.maxScore.toString());
      setEvaluationWeight(existing.weight.toString());
    }
  };

  const handleUpdateGradeEntry = (studentId: string, value: string) => {
    setGradeEntryRows({
      ...gradeEntryRows,
      [studentId]: { score: value }
    });
  };

  const handleSaveBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentSchool) return;

    if (!selectedAcademicYearId || !selectedPeriodId || !selectedClassId || !selectedClassSubjectId) {
      alert("Veuillez remplir tous les champs obligatoires du contexte.");
      return;
    }
    
    const activePeriod = periods.find(p => p.id === selectedPeriodId);
    if (!activePeriod) {
      alert("Aucune période de saisie ouverte n'est disponible pour cette année scolaire.");
      return;
    }

    // effectiveSubjects logic inlined
    const effSub = getEffectiveClassSubjects({ classId: selectedClassId, classes: db.classes, classPrograms: db.classPrograms || [], classSubjects: db.classSubjects || [], subjects: db.subjects, activeAcademicYearId: selectedAcademicYearId }).find(s => s.classSubjectId === selectedClassSubjectId);
    if (!effSub) return;
    
    const activeAssignment = (db.teacherAssignments || []).find(a => 
      a.schoolId === currentSchool.id && 
      a.academicYearId === selectedAcademicYearId && 
      a.classId === selectedClassId && 
      a.sourceClassSubjectId === selectedClassSubjectId && 
      a.isActive === true
    );
    
    if (!activeAssignment) {
      alert("Aucun enseignant actif n'est affecté à cette matière pour cette classe et cette année scolaire. Veuillez configurer l'affectation avant la saisie des notes.");
      return;
    }

    if (evaluationMode === 'new' && (!evaluationMaxScore || parseFloat(evaluationMaxScore) <= 0)) {
      alert("Le barème doit être strictement positif.");
      return;
    }
    if (evaluationMode === 'new' && (!evaluationWeight || parseFloat(evaluationWeight) <= 0)) {
      alert("Le coefficient doit être strictement positif.");
      return;
    }

    const newDb = { ...db };
    if (!newDb.evaluations) newDb.evaluations = [];
    if (!newDb.gradesStrict) newDb.gradesStrict = [];
    
    let finalEvalId = '';
    
    if (evaluationMode === 'new') {
      if (!newEvaluationKey) return;
      finalEvalId = buildEvaluationId(currentSchool.id, selectedAcademicYearId, selectedPeriodId, selectedClassId, selectedClassSubjectId, newEvaluationKey);
      const newEval: Evaluation = {
        id: finalEvalId,
        schoolId: currentSchool.id,
        academicYearId: selectedAcademicYearId,
        periodId: selectedPeriodId,
        classId: selectedClassId,
        classSubjectId: selectedClassSubjectId,
        subjectId: effSub.subjectId,
        teacherId: activeAssignment.teacherStaffId,
        title: evaluationTitle,
        type: evaluationType as 'exam'|'homework'|'oral'|'participation',
        date: evaluationDate,
        maxScore: parseFloat(evaluationMaxScore),
        weight: parseFloat(evaluationWeight),
        status: 'draft',
        createdAt: new Date().toISOString(),
        createdBy: currentUser.id,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.id,
        version: 1
      };
      if (!newDb.evaluations) newDb.evaluations = []; upsertEvaluationInCache(newDb.evaluations, newEval);
    } else {
      if (!selectedEvaluationId) {
        alert("Veuillez sélectionner une évaluation existante.");
        return;
      }
      finalEvalId = selectedEvaluationId;
    }
    
    const theEval = newDb.evaluations.find(e => e.id === finalEvalId);
    if (!theEval) return;

    Object.keys(gradeEntryRows).forEach(studentId => {
      const entry = gradeEntryRows[studentId];
      if (entry.score !== '') {
        const scoreVal = parseFloat(entry.score);
        const gId = buildGradeId(finalEvalId, studentId);
        const newGrade: Grade = {
          id: gId,
          schoolId: currentSchool.id,
          academicYearId: selectedAcademicYearId,
          periodId: selectedPeriodId,
          evaluationId: finalEvalId,
          classId: selectedClassId,
          classSubjectId: selectedClassSubjectId,
          subjectId: effSub.subjectId,
          studentId: studentId,
          teacherId: activeAssignment.teacherStaffId,
          status: 'draft',
          resultStatus: 'scored',
          score: scoreVal,
          maxScore: theEval.maxScore,
          createdAt: new Date().toISOString(),
          createdBy: currentUser.id,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.id,
          version: 1
        };
        if (!newDb.gradesStrict) newDb.gradesStrict = []; upsertGradeInCache(newDb.gradesStrict, newGrade);
      }
    });

    try {
      await safeMergeDB(newDb);
      alert("Notes enregistrées avec succès.");
      setModalOpen(false);
    } catch (err) {
      console.error("Erreur safeMergeDB:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`Erreur lors de l'enregistrement des notes: ${errorMessage}`);
    }
  };

  const handlePrint = (selector: string, filename: string) => {
    import('html2canvas').then(({ default: html2canvas }) => {
      import('jspdf').then(({ jsPDF }) => {
        const el = document.querySelector(selector) as HTMLElement;
        if (!el) return;
        html2canvas(el, { scale: 2 }).then((canvas: HTMLCanvasElement) => {
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

  // Ranking Calculation (unchanged legacy behavior for other tabs)
  const classStudents = db.students.filter(s => s.classId === selectedClassRank);
  const rankingData = classStudents.map(s => {
    const sGrades = db.grades.filter(g => g.studentId === s.id);
    const validSGrades = sGrades.map(g => getLegacyGradeNormalizedValue(g)).filter(v => v.calculable) as { calculable: true, value: number }[];
    const sum = validSGrades.reduce((acc, v) => acc + v.value, 0);
    const avg = validSGrades.length > 0 ? sum / validSGrades.length : 0;
    return { student: s, avg, hasGrades: validSGrades.length > 0 };
  }).filter(d => d.hasGrades).sort((a, b) => b.avg - a.avg);
  const classAvg = rankingData.length > 0 ? rankingData.reduce((sum, d) => sum + d.avg, 0) / rankingData.length : 0;
  const currentRankClass = db.classes.find(c => c.id === selectedClassRank);

  // School Ranking Calculation
  const schoolRankingData = db.classes.map(c => {
    const cStudents = db.students.filter(s => s.classId === c.id);
      const validStudentAvgs = cStudents.map(s => {
        const sGrades = db.grades.filter(g => g.studentId === s.id);
        const validSGrades = sGrades.map(g => getLegacyGradeNormalizedValue(g)).filter(v => v.calculable) as { calculable: true, value: number }[];
        const sum = validSGrades.reduce((acc, v) => acc + v.value, 0);
        return validSGrades.length > 0 ? sum / validSGrades.length : null;
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
              <button className="secondary" onClick={() => handlePrint('.print-bulletin', `bulletin_${selectedStudent}`)}>
                <Printer size={18} /> Imprimer Bulletin
              </button>
            )}
          </div>

          {selectedStudent && (
            <div className="card print-area print-bulletin" style={{ padding: '2rem', background: '#fff' }}>
              <SchoolDocumentHeader school={currentSchool} documentTitle="Bulletin de Notes" />
              {(() => {
                const student = db.students.find(s => s.id === selectedStudent);
                const studentClass = db.classes.find(c => c.id === student?.classId);
                if (!student || !studentClass) return null;
                
                // Structured Bulletin logic
                let generalAvg = 0;
                let subjectsRender = null;
                
                if (activeYear) {
                  // Get active period or first period
                  const activePer = periods[0];
                  if (activePer) {
                    const effSubjects = getEffectiveClassSubjects({ classId: studentClass.id, classes: db.classes, classPrograms: db.classPrograms || [], classSubjects: db.classSubjects || [], subjects: db.subjects, activeAcademicYearId: activeYear.id });
                    const stGrades = (db.gradesStrict || []).filter(g => 
                      g.studentId === student.id && g.academicYearId === activeYear.id && g.periodId === activePer.id
                    );
                    
                    const summaries = groupGradesByClassSubject(stGrades, effSubjects); summaries.forEach(s => calculateSubjectAverage(s)); const genAvgObj = calculateWeightedGeneralAverage(summaries); const weightedSum = genAvgObj.generalAverage;
                    generalAvg = weightedSum || 0;
                    
                    subjectsRender = (
                      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                        <thead style={{ background: 'var(--bg-color)' }}>
                          <tr>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Code</th>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Matière</th>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Coefficient</th>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Moyenne / 20</th>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Pts Pondérés</th>
                            <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Appréciation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaries.map(sub => {
                            
                            
                            const coeff = sub.coefficient || 1;
                            const pts = (sub.calculable && sub.rawAverage !== null) ? (sub.rawAverage * coeff) : null;
                            
                            return (
                              <tr key={sub.classSubjectId}>
                                <td style={{ border: '1px solid #000', padding: '0.75rem' }}>{sub.subjectCode}</td>
                                <td style={{ border: '1px solid #000', padding: '0.75rem' }}>{sub.subjectName}</td>
                                <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>{coeff}</td>
                                <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', fontWeight: 'bold' }}>
                                  {(sub.calculable && sub.rawAverage !== null) ? sub.rawAverage.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>
                                  {pts !== null ? pts.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}
                                </td>
                                <td style={{ border: '1px solid #000', padding: '0.75rem', fontStyle: 'italic' }}>
                                  {(sub.calculable && sub.rawAverage !== null) ? getAppreciation(sub.rawAverage, 20) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  }
                }
                
                // Legacy Historical Section
                const legacyGrades = db.grades.filter(g => g.studentId === student.id);
                
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                      <div>
                        <h3>{student.name}</h3>
                        <p><strong>Classe :</strong> {studentClass.name} ({studentClass.type})</p>
                        <p><strong>Section :</strong> {student.section}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p><strong>Année Scolaire :</strong> {activeYear?.name || 'N/A'}</p>
                        <p><strong>Décision du conseil :</strong> Non renseignée</p>
                      </div>
                    </div>
                    
                    <h4 style={{marginBottom: '1rem'}}>Notes de la période (Structurées)</h4>
                    {subjectsRender || <p style={{ color: 'var(--text-muted)' }}>Aucune note structurée disponible.</p>}
                    
                    {subjectsRender && (
                      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ border: '2px solid #000', padding: '1rem', minWidth: '300px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '1.2rem' }}>
                            <span>Moyenne Générale :</span>
                            <span>{generalAvg.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / 20</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontStyle: 'italic' }}>
                            <span>Mention :</span>
                            <span>{getAppreciation(generalAvg, 20)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {legacyGrades.length > 0 && (
                      <div style={{marginTop: '3rem'}}>
                        <h4 style={{marginBottom: '1rem', color: 'var(--text-muted)'}}>Notes historiques non classées (Ancien système)</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ccc', color: 'var(--text-muted)' }}>
                          <thead style={{ background: '#f9f9f9' }}>
                            <tr>
                              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Date</th>
                              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'left' }}>Matière ID</th>
                              <th style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>Note / Max</th>
                            </tr>
                          </thead>
                          <tbody>
                            {legacyGrades.map(g => (
                              <tr key={g.id}>
                                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{g.date || '-'}</td>
                                <td style={{ border: '1px solid #ccc', padding: '0.5rem' }}>{g.subjectId}</td>
                                <td style={{ border: '1px solid #ccc', padding: '0.5rem', textAlign: 'center' }}>{g.score} / {g.maxScore || 20}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
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
                <option value="">-- Choisir --</option>
                {sortClasses(db.classes).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
              </select>
            </div>
            {selectedClassRank && rankingData.length > 0 && (
              <button className="secondary" onClick={() => handlePrint('.print-ranking', `palmares_${currentRankClass?.name}`)}>
                <Printer size={18} /> Imprimer le Palmarès
              </button>
            )}
          </div>

          {selectedClassRank && (
            <div className="card print-area print-ranking" style={{ padding: '2rem', background: '#fff' }}>
              <SchoolDocumentHeader school={currentSchool} documentTitle="Palmarès (Classement)" />
              <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem' }}>
                <h3>Classement de la classe : {currentRankClass?.name}</h3>
                <p>Moyenne de la classe : {classAvg.toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / 20</p>
              </div>

              {rankingData.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000' }}>
                  <thead style={{ background: 'var(--bg-color)' }}>
                    <tr>
                      <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center', width: '80px' }}>Rang</th>
                      <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'left' }}>Élève</th>
                      <th style={{ border: '1px solid #000', padding: '0.75rem', textAlign: 'center' }}>Moyenne / 20</th>
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
              ) : (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun élève évalué dans cette classe.</p>
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

      {/* Structured Grade Entry Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Saisie des Notes">
        <form onSubmit={handleSaveBulk}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Année Scolaire</label>
              <select required value={selectedAcademicYearId} onChange={e => setSelectedAcademicYearId(e.target.value)}>
                <option value="">-- Choisir --</option>
                {db.academicYears?.filter(y => y.schoolId === currentSchool?.id).map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Période</label>
              <select required value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}>
                <option value="">-- Choisir --</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {selectedAcademicYearId && selectedPeriodId && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Classe</label>
                <select required value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                  <option value="">-- Choisir --</option>
                  {sortClasses(db.classes.filter(c => c.schoolId === currentSchool?.id)).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>
              
              {selectedClassId && (
                <div className="form-group">
                  <label>Matière</label>
                  <select required value={selectedClassSubjectId} onChange={e => setSelectedClassSubjectId(e.target.value)}>
                    <option value="">-- Choisir --</option>
                    {getEffectiveClassSubjects({ classId: selectedClassId, classes: db.classes, classPrograms: db.classPrograms || [], classSubjects: db.classSubjects || [], subjects: db.subjects, activeAcademicYearId: selectedAcademicYearId }).map(s => (
                      <option key={s.classSubjectId} value={s.classSubjectId}>{s.name} (Coeff {s.coefficient})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {selectedClassSubjectId && (
            <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Évaluation</label>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <label>
                  <input type="radio" name="evalMode" checked={evaluationMode === 'existing'} onChange={() => handleModeChange('existing')} />
                  Existante
                </label>
                <label>
                  <input type="radio" name="evalMode" checked={evaluationMode === 'new'} onChange={() => handleModeChange('new')} />
                  Nouvelle
                </label>
              </div>
              
              {evaluationMode === 'existing' && (
                <div className="form-group">
                  <select required value={selectedEvaluationId} onChange={e => handleExistingEvalChange(e.target.value)}>
                    <option value="">-- Choisir --</option>
                    {(db.evaluations || []).filter(e => 
                      e.schoolId === currentSchool?.id && 
                      e.academicYearId === selectedAcademicYearId && 
                      e.periodId === selectedPeriodId && 
                      e.classSubjectId === selectedClassSubjectId
                    ).map(e => (
                      <option key={e.id} value={e.id}>{e.title} (Max: {e.maxScore}, Coeff: {e.weight})</option>
                    ))}
                  </select>
                </div>
              )}
              
              {evaluationMode === 'new' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  <div className="form-group">
                    <label>Titre</label>
                    <input type="text" required value={evaluationTitle} onChange={e => setEvaluationTitle(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Type</label>
                    <select required value={evaluationType} onChange={e => setEvaluationType(e.target.value)}>
                      <option value="exam">Examen</option>
                      <option value="homework">Devoir</option>
                      <option value="oral">Oral</option>
                      <option value="participation">Participation</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" required value={evaluationDate} onChange={e => setEvaluationDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Note sur (Max)</label>
                    <input type="number" required min="1" value={evaluationMaxScore} onChange={e => setEvaluationMaxScore(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Coefficient</label>
                    <input type="number" required min="0.1" step="0.1" value={evaluationWeight} onChange={e => setEvaluationWeight(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {(evaluationMode === 'new' || (evaluationMode === 'existing' && selectedEvaluationId)) && (
            <div style={{ maxHeight: '400px', overflowY: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Élève</th>
                    <th style={{ textAlign: 'center', paddingBottom: '0.5rem', width: '100px' }}>Statut</th>
                    <th style={{ textAlign: 'center', paddingBottom: '0.5rem', width: '120px' }}>Note / {evaluationMaxScore}</th>
                  </tr>
                </thead>
                <tbody>
                  {db.students.filter(s => s.classId === selectedClassId).map(stu => {
                    const currentVal = gradeEntryRows[stu.id]?.score || '';
                    return (
                      <tr key={stu.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0' }}>{stu.name}</td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>Scored</td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'center' }}>
                          <input 
                            type="number" step="0.25" min="0" max={evaluationMaxScore} placeholder="Note"
                            style={{ width: '80px', textAlign: 'center' }} 
                            value={currentVal} 
                            onChange={e => handleUpdateGradeEntry(stu.id, e.target.value)} 
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

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


