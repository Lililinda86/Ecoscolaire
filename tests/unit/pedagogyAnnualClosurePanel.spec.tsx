// @vitest-environment jsdom
import {afterEach,describe,it,expect} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {AnnualCoveragePanel} from '../../src/features/pedagogy/components/AnnualCoveragePanel';
afterEach(cleanup);
describe('annual coverage display',()=>{
 it('shows only the school levels supplied by the scoped workspace',()=>{render(<AnnualCoveragePanel levelIds={['en-secondary-lower-sixth']}/>);expect(screen.getByRole('heading',{name:'Couverture annuelle documentaire'})).toBeTruthy();expect(screen.queryByText(/Primaire FR · sil/)).toBeNull();expect(screen.getAllByText(/Literature in English/).length).toBeGreaterThan(0);expect(screen.getAllByText(/English Language/).length).toBeGreaterThan(0);});
 it('does not fall back to another school when the level list is empty',()=>{render(<AnnualCoveragePanel levelIds={[]}/>);expect(screen.getByText('Aucun périmètre documentaire connu pour les niveaux affichés.')).toBeTruthy();expect(screen.queryByText(/Literature in English/)).toBeNull();});
});
