/** @vitest-environment jsdom */
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
const state=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../../src/db/firebase',()=>({functions:{}}));
vi.mock('firebase/functions',()=>({httpsCallable:()=>state.call}));
import {DelegatedValidationPanel} from '../../src/features/pedagogy/components/DelegatedValidationPanel';
afterEach(()=>{cleanup();state.call.mockReset();});
const record={id:'r',schoolId:'a',academicYearId:'y',scope:'ITALO_PEDAGOGICAL_CHOICE',classification:'C',decision:'KEEP_LOCAL_SUBJECTS_DISTINCT',reason:'Preserve history and geography',officialSubject:'History',decisionOrigin:'OWNER_DELEGATED_VALIDATION',decisionAuthorizedBy:'owner',decisionRecordedBy:'delegated-validation-workflow',sourceVersion:'s',mappingVersion:'m',decisionBatchId:'batch'};
it('shows stored attribution and excludes another tenant/year',async()=>{
 state.call.mockResolvedValue({data:{delegatedDecisions:[record,{...record,id:'foreign',schoolId:'b',reason:'foreign secret'},{...record,id:'old',academicYearId:'old',reason:'old decision'}]}});
 render(<DelegatedValidationPanel schoolId="a" yearId="y"/>);
 await screen.findByText('Preserve history and geography');expect(screen.queryByText('foreign secret')).toBeNull();expect(screen.queryByText('old decision')).toBeNull();
 expect(screen.getByText(/Enregistrement : delegated-validation-workflow/)).toBeTruthy();
});
it('clears stale data immediately when school changes',async()=>{
 state.call.mockResolvedValueOnce({data:{delegatedDecisions:[record]}}).mockImplementationOnce(()=>new Promise(()=>{}));
 const view=render(<DelegatedValidationPanel schoolId="a" yearId="y"/>);await screen.findByText(record.reason);
 view.rerender(<DelegatedValidationPanel schoolId="b" yearId="y"/>);expect(screen.queryByText(record.reason)).toBeNull();
});
it('does not claim zero pending decisions when server read fails',async()=>{
 state.call.mockRejectedValue(new Error('Unavailable'));render(<DelegatedValidationPanel schoolId="a" yearId="y"/>);
 await screen.findByRole('alert');expect(screen.queryByText(/0 décisions pédagogiques/)).toBeNull();
});
