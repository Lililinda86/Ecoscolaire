import type { ClassSection, ClassSubject, ClassProgram } from '../../../types';
import type { CurriculumProgram, SchoolCurriculumAdoption } from '../types';
import { minedubDocuments } from '../resources/minedubVerified';
export interface CoverageRow {
  classId: string; className: string; section: string; subsystem: string; level: string;
  subject: string; sourceFound: boolean; sourceAuthenticated: boolean; rightsKnown: boolean;
  contentExtracted: boolean; contentStructured: boolean; humanReviewRequired: boolean; publishedInStaging: boolean;
  adoptedByITALO: boolean; missingReason: string; candidateDocumentIds: string[];
}
/** Never silently drop an active class without a level or a subject assignment.
 * Catalogues/links cannot establish source coverage. Current corpus has no
 * authenticated per-subject mappings; do not infer them from a published program.
 */
export function configuredCurriculumCoverage(schoolId: string, yearId: string, classes: ClassSection[], subjects: ClassSubject[], classPrograms: ClassProgram[], programs: CurriculumProgram[], adoptions: SchoolCurriculumAdoption[]): CoverageRow[] {
  return classes.filter(row => row.schoolId === schoolId && row.isActive !== false).flatMap(classroom => {
    const scopedPrograms = classPrograms.filter(row => row.schoolId === schoolId && row.academicYearId === yearId && row.classId === classroom.id && row.status !== 'archived');
    const revisions = new Set(scopedPrograms.flatMap(row => [row.draftRevisionId, row.publishedRevisionId].filter((id): id is string => Boolean(id))));
    const mapped = subjects.filter(row => row.schoolId === schoolId && row.academicYearId === yearId && row.classId === classroom.id && row.isActive !== false && revisions.has(row.revisionId));
    const names = new Map(mapped.map(row => [row.subjectId, row.subjectNameSnapshot || row.subjectId]));
    for (const id of classroom.subjects || []) if (!names.has(id)) names.set(id, id);
    const adoption = adoptions.find(row => row.schoolId === schoolId && row.academicYearId === yearId && row.catalogLevelId === classroom.catalogLevelId && row.status === 'active');
    const program = programs.find(row => row.id === adoption?.curriculumProgramId);
    // Exact display-name candidates are explicitly NOT verified class/subject mappings.
    const candidateDocumentIds = minedubDocuments.filter(document => !document.id.endsWith('-variant') && document.levels.some(level => level.toLowerCase() === (classroom.name || '').trim().toLowerCase())).map(document => document.id);
    return (names.size ? [...names.values()] : ['MATIÈRES / DOMAINES À CONFIGURER']).map(subject => ({
      classId: classroom.id, className: classroom.name, section: classroom.section || classroom.type || 'UNKNOWN',
      subsystem: classroom.educationType || 'NOT_CONFIRMED', level: classroom.catalogLevelId || 'LEVEL_NOT_MAPPED', subject,
      sourceFound: false, sourceAuthenticated: false, rightsKnown: false, contentExtracted: false, contentStructured: false,
      humanReviewRequired: true, publishedInStaging: false, adoptedByITALO: Boolean(adoption?.decision && program?.version === adoption.programVersion),
      candidateDocumentIds,
      missingReason: [
        !classroom.catalogLevelId ? 'Niveau non rattaché.' : '',
        !names.size ? 'Aucune matière active configurée : ligne conservée au dénominateur.' : '',
        program?.sourceType === 'mock' ? 'Programme de démonstration, pas un curriculum officiel.' : '',
        'Source authentifiée et correspondance matière/document non disponibles.',
        'Adoption reçue éventuelle distincte de la couverture officielle.',
      ].filter(Boolean).join(' '),
    }));
  });
}
