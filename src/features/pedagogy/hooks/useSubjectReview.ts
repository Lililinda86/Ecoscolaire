import type { DelegatedDecision } from '../components/DelegatedValidationPanel';
import { createContext, useContext } from 'react';
import type { SubjectReviewRow, SubjectDecision, SecondaryRow, DocumentaryDecision } from '../components/SubjectMappingReview';
interface State { rows: SubjectReviewRow[]; secondaryRows: SecondaryRow[]; decisions?: SubjectDecision[]; documentaryDecisions?: DocumentaryDecision[]; delegatedDecisions?: DelegatedDecision[]; loading: boolean; error: string | null; refresh: () => Promise<void>; schoolId?: string; yearId?: string; owner: boolean }
export const SubjectReviewContext = createContext<State | null>(null);
export const useSubjectReview = () => useContext(SubjectReviewContext);
