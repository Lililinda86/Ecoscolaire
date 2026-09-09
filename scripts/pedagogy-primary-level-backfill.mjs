import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import ts from 'typescript';

// Exact Staging target only. No rename, deletion, adoption, grades or subject writes.
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
if (!args.has('--project=ecoscolaire-staging')) throw new Error('Explicit Staging project required.');
if (apply && !args.has('--confirm=BACKFILL_PRIMARY_LEVELS_ONLY')) throw new Error('Explicit limited backfill confirmation required.');
const schoolId = process.argv.find(arg => arg.startsWith('--school='))?.slice(9);
if (!schoolId || !/^[a-zA-Z0-9_-]+$/.test(schoolId)) throw new Error('Exact school required.');
const module = new Module('class-catalog');
module._compile(ts.transpileModule(readFileSync(new URL('../src/constants/defaultClasses.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, 'class-catalog.cjs');
const catalog = module.exports.DEFAULT_CLASS_LEVELS.filter(row => row.cycle === 'primary' && row.isActive);
const token = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token --quiet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const base = 'https://firestore.googleapis.com/v1/projects/ecoscolaire-staging/databases/(default)/documents';
const response = await fetch(base + ':runQuery', { method: 'POST', headers, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'classes' }], where: { fieldFilter: { field: { fieldPath: 'schoolId' }, op: 'EQUAL', value: { stringValue: schoolId } } } } }) });
if (!response.ok) throw new Error('Class read failed: ' + response.status);
const documents = (await response.json()).filter(row => row.document).map(row => row.document);
const changes = [];
for (const document of documents) {
  const fields = document.fields;
  if (fields.isActive?.booleanValue === false || fields.catalogLevelId?.stringValue) continue;
  const name = fields.name?.stringValue;
  const section = fields.section?.stringValue || fields.type?.stringValue;
  const matches = catalog.filter(row => row.name === name && row.section === section);
  if (matches.length !== 1) continue;
  const target = matches[0].catalogLevelId;
  if (documents.some(row => row.name !== document.name && row.fields.catalogLevelId?.stringValue === target)) throw new Error('Existing canonical level conflict.');
  changes.push({ update: { name: document.name, fields: { catalogLevelId: { stringValue: target } } }, updateMask: { fieldPaths: ['catalogLevelId'] }, currentDocument: { updateTime: document.updateTime } });
}
if (changes.length > 12) throw new Error('Unexpected primary scope.');
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', project: 'ecoscolaire-staging', inspectedClasses: documents.length, proposedPrimaryLevels: changes.length, changedFields: ['catalogLevelId'], namesAndIdsPreserved: true, pedagogicalAdoptions: 0 }));
if (apply && changes.length) {
  const result = await fetch(base + ':commit', { method: 'POST', headers, body: JSON.stringify({ writes: changes }) });
  if (!result.ok) throw new Error('Atomic backfill failed: ' + result.status);
  for (const change of changes) {
    const check = await fetch('https://firestore.googleapis.com/v1/' + change.update.name, { headers });
    if (!check.ok || (await check.json()).fields.catalogLevelId.stringValue !== change.update.fields.catalogLevelId.stringValue) throw new Error('Backfill readback failed.');
  }
  console.log(JSON.stringify({ readback: 'PASS', configuredPrimaryLevels: changes.length, subjectOrStudentDataModified: false }));
}
