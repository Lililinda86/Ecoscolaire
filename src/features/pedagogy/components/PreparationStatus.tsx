import type { LessonPreparationStatus, PreparationAnalysisStatus } from '../types';
const labels: Record<LessonPreparationStatus, string> = { expected: 'Attendue', uploaded: 'Déposée', needs_review: 'À relire', validated: 'Validée' };
const analysisLabels: Record<PreparationAnalysisStatus, string> = {
  not_started: 'Sans analyse', pending: 'Analyse en attente', processing: 'Analyse en cours', succeeded: 'Analyse terminée', failed: 'Analyse échouée'
};
export const PreparationStatus = ({ status, analysisStatus }: { status: LessonPreparationStatus; analysisStatus?: PreparationAnalysisStatus }) => (
  <span className={`pedagogy-status pedagogy-status--prep-${status}`} title={analysisStatus ? analysisLabels[analysisStatus] : undefined}>
    {labels[status]}{analysisStatus === 'failed' ? ' · relecture manuelle' : ''}
  </span>
);
