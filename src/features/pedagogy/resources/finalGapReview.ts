import type { DelegatedDecision } from '../components/DelegatedValidationPanel';
import register from './finalGapReviews.json';
/** Overlay only an unchanged baseline decision in its original tenant/year. */
export function finalGapReview(decision:DelegatedDecision) {
 return register.records.find(r=>r.id===decision.id&&r.schoolId===decision.schoolId&&r.academicYearId===decision.academicYearId&&r.sourceVersion===decision.sourceVersion&&r.mappingVersion===decision.mappingVersion);
}
