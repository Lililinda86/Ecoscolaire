import { createContext, useContext } from 'react';
import type { SubjectReviewRow, SubjectDecision, SecondaryRow } from '../components/SubjectMappingReview';
interface State { rows: SubjectReviewRow[]; secondaryRows: SecondaryRow[]; decisions?: SubjectDecision[]; loading: boolean; error: string | null; refresh: () => Promise<void>; schoolId?: string; yearId?: string; owner: boolean }
export const SubjectReviewContext = createContext<State | null>(null);
export const useSubjectReview = () => useContext(SubjectReviewContext);
