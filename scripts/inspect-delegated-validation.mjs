import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { initializeFirestore } from 'firebase-admin/firestore';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
assert(process.argv.includes('--project=ecoscolaire-staging'));
assert(!process.env.FIRESTORE_EMULATOR_HOST);
const app = initializeApp({projectId:'ecoscolaire-staging',credential:applicationDefault()});
const db = initializeFirestore(app,{preferRest:true});
const schoolId='school-italo-official';
try {
  const school=await db.doc('schools/'+schoolId).get();
  const academicYearId=school.data()?.activeAcademicYearId;
  assert(academicYearId);
  const result={projectId:'ecoscolaire-staging',schoolId,academicYearId,readAt:new Date().toISOString(),writes:0};
  for(const name of ['classes','subjects','classPrograms','classSubjects','schoolCurriculumAdoptions','curriculumSubjectMappings','curriculumProposalReviews']) {
    const snap=await db.collection(name).where('schoolId','==',schoolId).limit(2001).get();
    assert(snap.size<=2000);
    result[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
  }
  for(const name of ['curriculumPrograms','curriculumUnits']) {
    const snap=await db.collection(name).where('status','==','published').limit(2001).get();
    assert(snap.size<=2000); result[name]=snap.docs.map(d=>({id:d.id,...d.data()}));
  }
  mkdirSync('output/delegated-validation',{recursive:true});
  writeFileSync('output/delegated-validation/current-state.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({projectId:result.projectId,academicYearId,counts:Object.fromEntries(Object.entries(result).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length])),adoptions:result.schoolCurriculumAdoptions.map(d=>({level:d.catalogLevelId,program:d.curriculumProgramId,status:d.status})),classes:result.classes.map(d=>({level:d.catalogLevelId,cycle:d.cycle,active:d.isActive})),writes:0}));
} finally {await deleteApp(app);}
