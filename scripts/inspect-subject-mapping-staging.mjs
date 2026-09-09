import assert from 'node:assert/strict';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import Module from 'node:module';
const readTs = path => { const mod = new Module(path); mod._compile(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, path); return mod.exports; };

// Explicit Staging-only, read-only projection. Never read users, pupils or secrets.
assert.equal(process.env.PEDAGOGY_FIREBASE_PROJECT_ID, 'ecoscolaire-staging');
const app = initializeApp({ projectId: 'ecoscolaire-staging', credential: applicationDefault() }, 'subject-mapping-readonly');
const db = initializeFirestore(app, { preferRest: true });
const schoolId = 'school-italo-official';
try {
  const school = await db.doc(`schools/${schoolId}`).get();
  assert(school.exists);
  const academicYearId = school.data().activeAcademicYearId;
  const definitions = {
    subjects: ['name', 'code', 'section', 'cycles', 'isActive', 'localConfigurationStatus'],
    classes: ['name', 'catalogLevelId', 'section', 'cycle', 'series', 'serie', 'stream', 'combination', 'options', 'isActive'],
    classPrograms: ['classId', 'academicYearId', 'status', 'draftRevisionId', 'publishedRevisionId', 'hasUnpublishedChanges'],
    classSubjects: ['classId', 'academicYearId', 'subjectId', 'subjectNameSnapshot', 'revisionId', 'isActive'],
    teacherAssignments: ['classId', 'academicYearId', 'subjectId', 'isActive'],
  };
  const result = { environment: 'ecoscolaire-staging', schoolId, academicYearId, readAt: new Date().toISOString(), writes: 0 };
  for (const [name, fields] of Object.entries(definitions)) {
    const snap = await db.collection(name).where('schoolId', '==', schoolId).select(...fields).limit(2001).get();
    assert(snap.size <= 2000, `${name}: bounded inspection exceeded`);
    // Assignments are only counted; no employee identifiers are fetched or emitted.
    result[name] = name === 'teacherAssignments' ? { count: snap.size } : snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
  if (process.argv.includes('--summary')) {
    const { matchOfficialSubjects, primaryDocumentByLevel } = readTs('src/features/pedagogy/services/subjectMapping.ts');
    const { minedubSubjectIndex } = readTs('src/features/pedagogy/resources/minedubSubjectIndex.ts');
    const primary = result.classes.filter(c => c.isActive !== false && primaryDocumentByLevel[c.catalogLevelId]).map(c => {
      const source = minedubSubjectIndex.find(s => s.documentId === primaryDocumentByLevel[c.catalogLevelId]);
      const matches = matchOfficialSubjects(source.names, result.subjects.map(s => ({ ...s, schoolId })), schoolId, c.catalogLevelId.startsWith('fr-') ? 'francophone' : 'anglophone');
      return { className: c.name, catalogLevelId: c.catalogLevelId, sourceDocumentId: source.documentId, officialSubjects: matches.length, exact: matches.filter(m => m.status === 'EXACT').length, safeAliases: matches.filter(m => m.status === 'SAFE_ALIAS').length, ambiguous: matches.filter(m => m.status === 'AMBIGUOUS').length, missingLocal: matches.filter(m => m.status === 'MISSING_LOCAL_SUBJECT').length };
    });
    const summary = { environment: result.environment, schoolId, academicYearId, readAt: result.readAt, writes: 0, primary, subjectsInCatalog: result.subjects.length, programsExisting: result.classPrograms.length, assignmentsExisting: result.teacherAssignments.count, classesWithoutConfiguredSubjects: result.classes.filter(c => c.isActive !== false && !result.classSubjects.some(s => s.classId === c.id && s.isActive !== false && s.academicYearId === academicYearId && result.classPrograms.some(p => p.classId === c.id && [p.draftRevisionId, p.publishedRevisionId].includes(s.revisionId)))).length, secondCycleSeries: result.classes.filter(c => /2nde|1re|terminale|sixth/.test(c.catalogLevelId || '')).map(c => ({ className: c.name, series: c.series || c.serie || c.stream || c.combination || c.options || null })) };
    if (process.argv.includes('--save-baseline')) writeFileSync('docs/pedagogy-content-completion/SUBJECT_MAPPING_BASELINE.json', JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } else console.log(JSON.stringify(result, null, 2));
} finally { await deleteApp(app); }
