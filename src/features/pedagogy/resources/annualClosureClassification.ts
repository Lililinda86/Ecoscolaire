import type { AnnualScope } from './annualCoverage';

export type AnnualPartialCause = 'STRUCTURE_INCOMPLETE'|'SOURCE_PARTIAL'|'LOCAL_SCOPE_UNKNOWN'|'CONTRADICTION'|'VERSION_UNCERTAIN'|'RIGHTS_LIMITATION'|'OTHER';
// The five immutable source documents associated with the eight baseline conflicts.
// The three previously approved subdomains are preserved, never reclassified here.
const conflictedSources = new Set(['minedub-fr-primary-2','minedub-en-primary-2','minedub-en-primary-3','minesec-31','minesec-64']);
export function classifyAnnualPartial(row: Pick<AnnualScope,'catalogLevelId'|'officialSource'|'coverageStatus'>): AnnualPartialCause|null {
 if(row.coverageStatus!=='PARTIAL_BLOCKING')return null;
 if(row.officialSource.some(s=>conflictedSources.has(s.id)))return 'CONTRADICTION';
 if(/(?:-2nde|-1re|-terminale|-lower-sixth|-upper-sixth)$/.test(row.catalogLevelId))return 'LOCAL_SCOPE_UNKNOWN';
 if(!row.officialSource.length)return 'SOURCE_PARTIAL';
 return 'STRUCTURE_INCOMPLETE';
}
export const annualCauseExplanation: Record<AnnualPartialCause,string> = {
 STRUCTURE_INCOMPLETE:'Source collectée ; compléter les tableaux de la classe et leurs objectifs. Un index ou une introduction ne suffit pas.',
 SOURCE_PARTIAL:'Une partie du socle annuel n’est pas établie par une source exploitable.',
 LOCAL_SCOPE_UNKNOWN:'Série ou combinaison locale non prouvée. Choisir le périmètre avant de compléter les variantes du second cycle.',
 CONTRADICTION:'Le document comporte une réserve non résolue ; la nouvelle structuration ne vaut pas résolution. Les sous-domaines approuvés dans la baseline sont conservés séparément.',
 VERSION_UNCERTAIN:'La version définitive ou applicable reste à authentifier.',
 RIGHTS_LIMITATION:'Conserver métadonnées, lien et structure permise ; ne pas redistribuer le document.',
 OTHER:'Consulter la justification propre à la ligne.',
};
