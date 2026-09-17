import secondaryFiles from '../../../../docs/pedagogy-content-completion/MINESEC_VERIFIED_FILE_METADATA.json';
import checks from '../../../../docs/pedagogy-content-completion/MINESEC_SOURCE_CHECKS.json';
import { secondarySubjectSources } from '../../../../functions/src/pedagogy/secondarySubjectSources';
import { minedubDocuments } from './minedubVerified';
import { minedubSubjectIndex } from './minedubSubjectIndex';
import { earlyYearsActivities, earlyYearsLevels } from './earlyYearsProgram';
import { verifiedTeacherGuides } from './verifiedTeacherGuides';
import { structuredModulesFor } from './secondaryStructuredUnits';

export interface PedagogicalMaterial {
  id: string; title: string; authority: string; type: string; language: string;
  levels: string[]; subjects: string[]; themes: string[]; url: string | null;
  sourceVersion: string; edition: string; locator: string; retrievedAt: string | null;
  provenance: string; applicability: string; rights: string; note: string;
  preparationOutline?: string[];
  sourceAliases?: Array<{ id: string; title: string; url: string | null }>;
}
const unique = (values: string[]) => [...new Set(values)];
const primaryIds: Record<string, string> = { SIL: 'fr-primary-sil', CP: 'fr-primary-cp', CE1: 'fr-primary-ce1', CE2: 'fr-primary-ce2', CM1: 'fr-primary-cm1', CM2: 'fr-primary-cm2', 'Class 1': 'en-primary-1', 'Class 2': 'en-primary-2', 'Class 3': 'en-primary-3', 'Class 4': 'en-primary-4', 'Class 5': 'en-primary-5', 'Class 6': 'en-primary-6' };
const rawMaterialCatalog: PedagogicalMaterial[] = [
  ...minedubDocuments.filter(d => !d.id.endsWith('-variant')).map(d => ({
    id: d.id, title: d.title, authority: 'MINEDUB', type: 'Curriculum', language: d.language,
    levels: d.id.includes('nursery') ? earlyYearsLevels.filter(l => l.language === d.language).map(l => l.id) : d.levels.map(l => primaryIds[l]).filter(Boolean),
    subjects: minedubSubjectIndex.find(s => s.documentId === d.id)?.names || [], themes: ['Référentiel'],
    url: 'https://www.minedub.cm/download/350/archives/' + d.download,
    sourceVersion: d.sha, edition: '2018', locator: 'Couverture et sommaire ; ' + d.pages + ' pages PDF', retrievedAt: '2026-09-08',
    provenance: 'OFFICIAL_VERIFIED', applicability: 'REVIEW_REQUIRED', rights: 'LINK_METADATA_ONLY',
    note: d.id.includes('nursery') ? 'Domaines de référence seulement. Aucun rattachement des quatre niveaux locaux aux deux années officielles n’est déduit.' : 'Source documentaire authentifiée ; aucune adoption, ouverture de matière ou progression annuelle automatique.',
  })),
  ...secondaryFiles.files.map(d => {
    const related = secondarySubjectSources.flatMap(level => level.subjects.flatMap(subject => subject.sources.filter(s => s.documentId === 'minesec-' + d.fileId).map(() => ({ level: level.catalogLevelId, subject: subject.officialSubject, language: level.section === 'anglophone' ? 'en' : 'fr' }))));
    const check = (checks as Record<string, { date: string; locator: string; note: string }>)[d.fileId];
    const guide = verifiedTeacherGuides[d.fileId];
    const moduleLanguages = unique(structuredModulesFor('minesec-' + d.fileId).map(unit => unit.language));
    // A class section is not evidence of the language of a PDF.
    return { id: 'minesec-' + d.fileId, title: d.title, authority: 'MINESEC', type: /guide/i.test(d.title) ? 'Guide pédagogique' : 'Document secondaire', language: guide?.language || (moduleLanguages.length === 1 ? moduleLanguages[0] : 'À vérifier'),
      levels: unique([...(guide?.levels || []), ...related.map(r => r.level)]), subjects: unique([...(guide?.subjects || []), ...related.map(r => r.subject)]), themes: [guide ? 'Méthodologie de préparation' : 'Référentiel secondaire — contenu à examiner'],
      url: d.url, sourceVersion: d.sha256, edition: check?.date || 'Non établie', locator: guide?.locator || check?.locator || 'Métadonnées du catalogue ministériel ; contenu à examiner', retrievedAt: d.retrievedAt,
      provenance: 'MINISTRY_HOSTED_PDF_RETRIEVED', applicability: 'NOT_ESTABLISHED', rights: d.rights,
      note: (guide?.summary || check?.note || 'Aucune correspondance de classe établie.') + ' Les rattachements restent des propositions partielles, pas des disciplines ouvertes à ITALO.',
      preparationOutline: guide?.outline,
    };
  }),
  ...earlyYearsLevels.flatMap(level => earlyYearsActivities(level.id).map(a => ({
    id: a.id, title: a.title, authority: 'ITALO', type: 'Activité originale', language: a.language,
    levels: [level.id], subjects: [a.domain], themes: [a.objective], url: null,
    sourceVersion: 'italo-early-years-v1', edition: 'Proposition locale v1', locator: 'Programme préscolaire intégré', retrievedAt: null,
    provenance: 'ITALO_INTERNAL', applicability: 'PROPOSED_NOT_ADOPTED', rights: 'ORIGINAL_PROJECT_CONTENT',
    note: a.objective + ' Acquis observable : ' + a.observable + ' Activité : ' + a.activity + ' Soutien : ' + a.support,
  }))),
  ...[
    { id: 'gce-logic-0590-2024', title: 'GCE Ordinary Level — Logic 0590', type: 'Syllabus d’examen', subject: 'Logic', edition: 'Mars 2024', file: '2024/03/0590-LOGIC-Syllabus-Review.pdf', hash: 'd7941336bfb50cc4c000a2bb9c809c400a718f239ab70f00463fb6dea85a8e08', note: 'Première session annoncée : juin 2025. Référentiel d’examen, pas une épreuve passée. Discipline et classe ITALO à confirmer.' },
    { id: 'gce-ol-report-2023', title: 'GCE Ordinary Level — Subject Report 2023', type: 'Rapport d’examinateurs', subject: 'Accounting · Biology · Chemistry · Commerce · Economics · English Language · Literature in English · Food and Nutrition · French · Special Bilingual Education French · Geography · Geology · History · Citizenship Education · Human Biology · Mathematics · Additional Mathematics · Physics · Logic · Computer Science', language: 'fr/en', edition: 'Session 2023', file: '2023/11/2023-OL-Subject-Report.pdf', hash: 'be00227126d233eff6f97174d87030ed6d48f68344a15ce642f354e550638e9c', note: 'Rapport disciplinaire référencé par le catalogue officiel ; sommaire PDF p.1. Retour d’examinateurs, pas un sujet ni un corrigé intégral. Aucun résultat individuel importé.' },
    { id: 'gce-al-report-2023', title: 'GCE Advanced Level — Subject Report 2023', type: 'Rapport d’examinateurs', subject: 'Accounting · Biology · Chemistry · Economics · English Language · Literature in English · Food Science and Nutrition · French · Special Bilingual Education French · Geography · Geology · History · Pure Mathematics with Mechanics · Pure Mathematics with Statistics · Further Mathematics · Physics · Religious Studies · Philosophy · Computer Science · Information and Communication Technologies', language: 'fr/en', edition: 'Session 2023', file: '2023/11/2023-AL-subject-Report.pdf', hash: '0afd33b752f74ebe7c6ccdbdb87ddb15e323505901d2398adafdc66ff13ce2a6', note: 'Couverture p.1, sommaire p.2. Retour d’examinateurs, ni syllabus actuel ni corrigé officiel complet. Combinaison ITALO non déduite ; aucun résultat individuel importé.' },
    { id: 'gce-al-report-2024', title: 'GCE Advanced Level — Subject Report 2024', type: 'Rapport d’examinateurs', subject: 'Accounting · Biology · Chemistry · Economics · English Language · Literature in English · Food Science and Nutrition · French · Special Bilingual Education French · Geography · Geology · History · Pure Mathematics with Mechanics · Pure Mathematics with Statistics · Further Mathematics · Physics · Religious Studies · Philosophy · Computer Science · Information and Communication Technologies', language: 'fr/en', edition: 'Session 2024', file: '2024/10/2024-Subject-Report-ALG.pdf', hash: 'bc44a3b20275c20250e99c12ea3cdea43abc7a15aaf671d7f46ecd1a968895a5', note: 'Sommaire p.1 : Advanced Level General Subjects. Retour d’examinateurs, pas un sujet ni un corrigé intégral. Options ITALO à confirmer ; aucun résultat individuel importé.' },
    { id: 'gce-english-0730-2023', title: 'GCE Advanced Level — English Language 0730', type: 'Syllabus d’examen', subject: 'English Language', edition: 'Avril 2023', file: '2023/11/0730-ENGLISH-LANGUAGE-REVIEWED-SYLLABUS.pdf', hash: '3c0cacdedc62b3916667cc2a555d604333bb9b9961e1721579b530961f93c683', note: 'Couverture : premier enseignement septembre 2023, première évaluation juin 2025. Complément de préparation à l’examen, ne remplace pas automatiquement le curriculum MINESEC.' },
    { id: 'gce-geography-0550-2023', title: 'GCE Ordinary Level — Geography 0550', type: 'Syllabus d’examen', subject: 'Geography', edition: 'Novembre 2023', file: '2023/11/0550-GEOGRAPHY-SYLLABUS-REVIEW-2022.pdf', hash: '43f7925ed45059d5b6e11887d69bf4e69fb9e9222f2e2c89d388f998e2b4c3c1', note: 'Couverture : première session juin 2025. L’édition est novembre 2023, malgré le nom du fichier contenant 2022.' },
    { id: 'gce-physics-0580-specimen', title: 'GCE Ordinary Level — Physics 0580, paper 2 — spécimen', type: 'Spécimen officiel', subject: 'Physics', edition: 'Copyright 2026 ; session non indiquée', file: '2026/03/Ordinary-Level-Physics-0580-Sample-Question.pdf', hash: 'cb46eddefecc482422d9a4d9d9e59957c7f541942fe43c4ee7d917f6e1ce6311', note: 'SAMPLE et JUNE XXXX sur la couverture. Sujet d’entraînement, pas une annale de juin 2026 ; aucun corrigé authentifié associé.' },
  ].map(d => ({ id: d.id, title: d.title, authority: 'GCE BOARD', type: d.type, language: d.language || 'en', levels: [], subjects: d.subject.split(' · '), themes: ['Préparation aux examens'], url: 'https://camgceb.org/wp-content/uploads/' + d.file, sourceVersion: d.hash, edition: d.edition, locator: 'Couverture ou sommaire PDF p. 1 ; catalogue officiel https://camgceb.org/downloads/', retrievedAt: '2026-09-16', provenance: 'OFFICIAL_VERIFIED', applicability: 'EXAM_SCOPE_ONLY_CLASS_REVIEW_REQUIRED', rights: 'LINK_METADATA_ONLY', note: d.note })),
];
export function deduplicateMaterials(rows: PedagogicalMaterial[]) {
  const byKey = new Map<string, PedagogicalMaterial>();
  for (const row of rows) {
    const key = /^[a-f0-9]{64}$/.test(row.sourceVersion) ? row.authority + ':' + row.sourceVersion : row.id;
    const existing = byKey.get(key), alias = { id: row.id, title: row.title, url: row.url };
    if (!existing) byKey.set(key, { ...row, sourceAliases: [alias] });
    else {
      existing.levels = unique([...existing.levels, ...row.levels]);
      existing.subjects = unique([...existing.subjects, ...row.subjects]);
      existing.themes = unique([...existing.themes, ...row.themes]);
      existing.sourceAliases!.push(alias);
      existing.note = unique([existing.note, row.note]).join(' ');
    }
  }
  return [...byKey.values()];
}
export const materialCatalog = deduplicateMaterials(rawMaterialCatalog);
export interface MaterialFilters { level?: string; subject?: string; theme?: string; type?: string; language?: string; source?: string; search?: string }
export function materialProvenance(d: PedagogicalMaterial) {
  return { ...d, issuer: d.authority === 'MINEDUB' ? 'Ministère de l’Éducation de Base' : d.authority === 'MINESEC' ? 'Ministère des Enseignements Secondaires' : d.authority === 'GCE BOARD' ? 'Cameroon General Certificate of Education Board' : 'ITALO — proposition rédigée avec un assistant',
    documentType: d.type, level: d.levels, subject: d.subjects, version: d.sourceVersion,
    publicationDate: null, effectiveDate: null, officialUrl: d.url, retrievalUrl: d.url,
    checksum: /^[a-f0-9]{64}$/.test(d.sourceVersion) ? d.sourceVersion : null,
    sourceLocator: d.locator, rightsStatus: d.url ? 'LINK_ONLY' : 'ORIGINAL_PROJECT_CONTENT',
    verificationStatus: d.provenance === 'MINISTRY_HOSTED_PDF_RETRIEVED' ? 'OFFICIAL_PENDING_VERIFICATION' : d.provenance,
    pedagogicalApproval: 'NOT_IMPLIED', documentaryModules: structuredModulesFor(d.id),
  };
}
export function materialPreparationText(d: PedagogicalMaterial) {
  if (!d.preparationOutline) return null;
  return ['ITALO_LOCAL — ORIGINAL PREPARATION OUTLINE / CANEVAS LOCAL À COMPLÉTER', 'Teacher remains author / La préparation réelle reste à écrire par l’enseignant.', d.title, d.locator, d.url || '', 'Source version: ' + d.sourceVersion, 'Not an official blank form, adopted curriculum or taught evidence.', ...d.preparationOutline.map(label => label + '\n________________________')].join('\n\n');
}
export function filterMaterials(filters: MaterialFilters, catalog = materialCatalog) {
  const query = (filters.search || '').trim().toLocaleLowerCase();
  return catalog.filter(d => (!filters.level || d.levels.includes(filters.level)) && (!filters.subject || d.subjects.includes(filters.subject)) && (!filters.theme || d.themes.includes(filters.theme)) && (!filters.type || d.type === filters.type) && (!filters.language || d.language === filters.language) && (!filters.source || d.authority === filters.source) && (!query || [d.title, d.note, ...d.subjects, ...d.themes].join(' ').toLocaleLowerCase().includes(query)));
}
