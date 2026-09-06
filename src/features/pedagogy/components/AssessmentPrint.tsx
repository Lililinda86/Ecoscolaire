import type { School } from '../../../types';
import type { AssessmentItem, WeeklyAssessment } from '../types';
import '../pedagogy-print.css';

export function AssessmentPrint({ school, assessment, items, mode, sourceChanged, language, academicYearLabel }: {
  school: School | null; assessment: WeeklyAssessment; items: AssessmentItem[]; mode: 'student' | 'correction'; sourceChanged: boolean; language: 'fr' | 'en'; academicYearLabel: string;
}) {
  const en = language === 'en', correction = mode === 'correction';
  const title = correction ? en ? 'ANSWER KEY / MARKING GUIDE' : 'CORRIGÉ / GUIDE DE CORRECTION' : en ? 'WEEKLY ASSESSMENT' : 'ÉVALUATION HEBDOMADAIRE';
  const draft = assessment.status !== 'ready_to_print' || sourceChanged;
  const total = items.reduce((sum, item) => sum + Number(item.points), 0);
  return <section id="weekly-assessment-print" className="pedagogy-a4 assessment-paper" lang={language}>
    <header className="assessment-paper-header">
      {school?.logoUrl && <img src={school.logoUrl} alt={en ? 'School logo' : 'Logo de l’établissement'} />}
      <div><h1>{school?.name || (en ? 'School' : 'Établissement')}</h1><p>{[school?.address, school?.phone, school?.email].filter(Boolean).join(' · ')}</p><p>{en ? 'Academic year' : 'Année scolaire'} : {academicYearLabel}</p></div>
    </header>
    {draft && <div className="assessment-watermark">{en ? 'DRAFT - TEACHER APPROVAL REQUIRED' : 'BROUILLON — À VALIDER PAR L’ENSEIGNANT'}</div>}
    <h2>{title}</h2>
    <div className="assessment-meta"><span>{en ? 'Class' : 'Classe'}<br /><strong>{assessment.className}</strong></span><span>Date<br /><strong>{assessment.fridayDate}</strong></span><span>{en ? 'Duration' : 'Durée'}<br /><strong>{assessment.durationMinutes} min</strong></span><span>{en ? 'Scale' : 'Barème'}<br /><strong>/{assessment.totalPoints}</strong></span></div>
    {!correction && <p>{en ? 'Pupil’s full name' : 'Nom et prénom de l’élève'} : _____________________________________</p>}
    {correction && <p className="assessment-copy-label">{en ? 'Teacher copy - do not distribute to pupils' : 'Exemplaire enseignant - ne pas distribuer aux élèves'}</p>}
    <p>{assessment.instructions}</p>
    {items.map(item => <article className="assessment-question" key={item.id}><h3>{item.order}. {item.questionText} <small>({item.points} pt{item.points > 1 ? 's' : ''})</small></h3><p>{item.instructions}</p>{correction ? <><strong>{en ? 'Expected answer' : 'Réponse attendue'}</strong><p>{item.expectedAnswer}</p><strong>{en ? 'Marking guidance' : 'Consignes de correction'}</strong><p>{item.correctionGuide}</p></> : <div className="assessment-answer-lines" />}</article>)}
    <p className="assessment-total">Total : {total}/{assessment.totalPoints}</p>
    <footer className="assessment-footer"><span>{en ? 'Week starting' : 'Semaine du'} {assessment.weekStartDate}</span><span>Version {assessment.generationVersion}.{assessment.contentRevision || 0}</span></footer>
  </section>;
}
