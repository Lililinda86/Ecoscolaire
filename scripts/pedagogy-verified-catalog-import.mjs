import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Module from 'node:module';
import ts from 'typescript';

// Additive metadata / short paraphrases only. Never imports source PDFs, adopts a
// curriculum, assigns a teacher, or invents weekly hours / mandatory subjects.
const args = new Set(process.argv.slice(2));
if (!args.has('--project=ecoscolaire-staging')) throw new Error('Explicit Staging project required.');
const apply = args.has('--apply');
if (apply && !args.has('--confirm=ADD_VERIFIED_REFERENCES_ONLY')) throw new Error('Explicit reference import confirmation required.');
const schoolId = 'school-italo-official';
const readTs = path => {
  const mod = new Module(path);
  mod._compile(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, path);
  return mod.exports;
};
const { minedubDocuments, structuredReviewExcerpts } = readTs('../src/features/pedagogy/resources/minedubVerified.ts');
const { additionalVerifiedUnits } = readTs('../src/features/pedagogy/resources/additionalVerifiedUnits.ts');
const { minedubSubjectIndex } = readTs('../src/features/pedagogy/resources/minedubSubjectIndex.ts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceUrl = doc => 'https://www.minedub.cm/download/350/archives/' + doc.download;
const refs = minedubDocuments.filter(doc => !doc.id.endsWith('-variant'));
const expected = [];
for (const doc of refs) {
  const index = minedubSubjectIndex.find(row => row.documentId === doc.id);
  expected.push({ path: 'curriculumPrograms/' + doc.id + '-review-2018-v1', data: {
    id: doc.id + '-review-2018-v1', countryCode: 'CM', section: doc.language === 'fr' ? 'francophone' : 'anglophone', cycle: doc.id.includes('nursery') ? 'nursery' : 'primary',
    title: doc.title + ' — référence partielle à examiner', version: '2018-review-v1', status: 'published', sourceType: 'official',
    authority: 'MINEDUB', coverage: 'PARTIAL', applicability: 'PENDING_HUMAN_REVIEW', sourceChecksum: doc.sha,
    subjectNames: index.names, sourcePdfPages: index.pdfPages,
    provenance: { label: 'Métadonnées et reformulations courtes issues du document MINEDUB', sourceUrl: sourceUrl(doc), note: 'Édition 2018 authentifiée, applicabilité actuelle et validation pédagogique non établies. Pas une importation intégrale. Les sommaires ne fixent ni horaires locaux ni obligations de classe.' },
  } });
}
// Source columns with an unambiguous existing primary catalog level.
// Nursery year mapping remains a human decision, so no school-level unit is forged.
const primaryLevels = { SIL: 'fr-primary-sil', CP: 'fr-primary-cp', CE1: 'fr-primary-ce1', CE2: 'fr-primary-ce2', CM1: 'fr-primary-cm1', CM2: 'fr-primary-cm2', 'Class 1': 'en-primary-1', 'Class 2': 'en-primary-2', 'Class 3': 'en-primary-3', 'Class 4': 'en-primary-4', 'Class 5': 'en-primary-5', 'Class 6': 'en-primary-6' };
for (const [excerptId, level] of [...structuredReviewExcerpts, ...additionalVerifiedUnits].filter(row => primaryLevels[row.level]).map(row => [row.id, primaryLevels[row.level]])) {
  const excerpt = [...structuredReviewExcerpts, ...additionalVerifiedUnits].find(row => row.id === excerptId);
  const doc = refs.find(row => row.id === excerpt.documentId);
  const id = excerpt.id + '-review-2018-v1';
  expected.push({ path: 'curriculumUnits/' + id, data: { id, programId: doc.id + '-review-2018-v1', catalogLevelId: level, subjectId: additionalVerifiedUnits.includes(excerpt) ? 'science-and-technology' : 'mathematics', subjectName: excerpt.subject,
    title: excerpt.officialUnit || (excerpt.id === 'primary-en-sharing' ? 'Partage — extrait localisé' : excerpt.domain + ' — extrait localisé'), domain: excerpt.domain, objective: excerpt.objectiveParaphrase, competency: excerpt.competencyParaphrase,
    sequence: 1, status: 'published', sourceType: 'official', sourceUrl: sourceUrl(doc), sourceLocator: 'PDF ' + excerpt.sourcePdfPage + ' — ' + excerpt.sourceLocator,
    verificationStatus: excerpt.status, coverage: 'PARTIAL', sourceChecksum: doc.sha,
    ...(additionalVerifiedUnits.includes(excerpt) ? { sourceDocumentId: doc.id, sourcePage: excerpt.sourcePdfPage, sourcePrintedPage: excerpt.sourcePrintedPage, theme: excerpt.officialUnit, officialLesson: excerpt.officialLesson, sequence: 2 } : {}),
  } });
}
const encode = value => value === null ? { nullValue: null } : typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? { integerValue: String(value) } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
const decode = value => 'stringValue' in value ? value.stringValue : 'booleanValue' in value ? value.booleanValue : 'integerValue' in value ? Number(value.integerValue) : 'arrayValue' in value ? (value.arrayValue.values || []).map(decode) : 'mapValue' in value ? Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)])) : null;
const token = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token --quiet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const base = 'https://firestore.googleapis.com/v1/projects/ecoscolaire-staging/databases/(default)/documents';
async function get(path) {
  const result = await fetch(base + '/' + path, { headers });
  if (result.status === 404) return null;
  if (!result.ok) throw new Error('Read failed: ' + result.status);
  return decode({ mapValue: { fields: (await result.json()).fields } });
}
if (!(await get('schools/' + schoolId))) throw new Error('Exact Staging school missing.');
const query = await fetch(base + ':runQuery', { method: 'POST', headers, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'subjects' }], where: { fieldFilter: { field: { fieldPath: 'schoolId' }, op: 'EQUAL', value: { stringValue: schoolId } } }, limit: 501 } }) });
if (!query.ok) throw new Error('Subject read failed: ' + query.status);
const existing = (await query.json()).filter(row => row.document).map(row => decode({ mapValue: { fields: row.document.fields } }));
if (existing.length > 500) throw new Error('Subject catalog bound exceeded.');
const names = new Map();
for (const doc of refs) for (const name of minedubSubjectIndex.find(row => row.documentId === doc.id).names) {
  const section = doc.language === 'fr' ? 'francophone' : 'anglophone';
  const key = section + ':' + name;
  const row = names.get(key) || { name, section, cycles: [], sourceReferences: [] };
  const cycle = doc.id.includes('nursery') ? 'nursery' : 'primary';
  if (!row.cycles.includes(cycle)) row.cycles.push(cycle);
  row.sourceReferences.push({ documentId: doc.id, url: sourceUrl(doc), checksum: doc.sha, pages: minedubSubjectIndex.find(item => item.documentId === doc.id).pdfPages });
  names.set(key, row);
}
for (const [key, row] of names) {
  // Preserve existing catalog entries; no fuzzy merge or rename.
  if (existing.some(item => item.name === row.name && (item.section === row.section || item.section === 'all') && item.isActive !== false && !String(item.id).startsWith('minedub-ref-'))) continue;
  const id = 'minedub-ref-' + hash(key).slice(0, 20);
  expected.push({ path: 'subjects/' + id, data: { id, schoolId, ...row, isActive: true, requirementStatus: 'PENDING_HUMAN_REVIEW', localConfigurationStatus: 'CATALOG_REFERENCE_ONLY', createdBy: 'pedagogy-verified-reference-import', updatedBy: 'pedagogy-verified-reference-import' } });
}
const missing = [], counts = {};
for (const document of expected) {
  document.data.importChecksum = hash(document.data);
  const previous = await get(document.path);
  if (previous && previous.importChecksum !== document.data.importChecksum) throw new Error('Existing reference differs; review required, no overwrite.');
  if (!previous) missing.push(document);
  const collection = document.path.split('/')[0]; counts[collection] = (counts[collection] || 0) + 1;
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', project: 'ecoscolaire-staging', expected: counts, creates: missing.length, adoptions: 0, classSubjectAssignments: 0, studentWrites: 0, sourceFilesUploaded: 0 }));
if (apply && missing.length) {
  const writes = missing.map(document => ({ update: { name: base.replace('https://firestore.googleapis.com/v1/', '') + '/' + document.path, fields: encode(document.data).mapValue.fields }, currentDocument: { exists: false } }));
  if (writes.length > 100) throw new Error('Import scope exceeded.');
  const result = await fetch(base + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes }) });
  if (!result.ok) throw new Error('Atomic create failed: ' + result.status);
  for (const document of missing) if ((await get(document.path))?.importChecksum !== document.data.importChecksum) throw new Error('Readback failed.');
  console.log(JSON.stringify({ readback: 'PASS', createdDocuments: missing.length, expectedCatalog: counts, existingDocumentsOverwritten: 0 }));
}
