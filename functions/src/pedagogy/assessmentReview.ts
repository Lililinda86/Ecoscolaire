export interface AssessmentReviewVersion { generationVersion: number; contentRevision?: number; sourceChecksum?: string }
export interface SubjectTeacherValidation extends AssessmentReviewVersion {
  subjectId: string; teacherStaffId: string; recordedBy: string; note: string; recordedAt?: unknown;
}
export function sameAssessmentReviewVersion(left: AssessmentReviewVersion, right: AssessmentReviewVersion) {
  return Number.isInteger(left.generationVersion) && left.generationVersion > 0 &&
    left.generationVersion === right.generationVersion && (left.contentRevision ?? 0) === (right.contentRevision ?? 0) &&
    left.sourceChecksum === right.sourceChecksum;
}
export function allSubjectsValidated(subjectIds: string[], validations: SubjectTeacherValidation[], version: AssessmentReviewVersion) {
  return subjectIds.length > 0 && new Set(subjectIds).size === subjectIds.length &&
    subjectIds.every(subjectId => validations.filter(item => item.subjectId === subjectId && item.teacherStaffId && item.recordedBy && item.note && sameAssessmentReviewVersion(item, version)).length === 1);
}
