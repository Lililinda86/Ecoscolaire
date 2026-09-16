// IAM-authenticated one-off Staging admin workflow. No endpoint, owner session,
// remote manifest, token logging, policy override or production target accepted.
const fs = require('node:fs'), path = require('node:path');
const admin = require(require.resolve('firebase-admin', { paths: [path.resolve(__dirname, '../functions')] }));
const { runDelegatedSubjectBatch } = require('../functions/lib/pedagogy/delegatedSubjectBatch');
const policy = Object.freeze({ projectId: 'ecoscolaire-staging', manifestDigest: 'db931dfae7e9123181aaa3e6cb33f0ede696437752315f8314b2d7a3eb777c9d', authorizationReference: 'sha256:054701734239de646cf111522ef087f40660e467f3d88487b51aba34b808de65' });
(async () => {
 const [file, mode, ...extra] = process.argv.slice(2);
 if (!file || extra.length || !['--dry-run', '--apply-authorized-relations'].includes(mode)) throw Error('Private manifest and explicit supported mode required');
 if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('No emulator override in live executable');
 for (const key of ['GOOGLE_CLOUD_PROJECT','GCLOUD_PROJECT','FIREBASE_PROJECT_ID']) if (process.env[key] && process.env[key] !== policy.projectId) throw Error('Project conflict');
 const manifest = JSON.parse(fs.readFileSync(file,'utf8'));
 const app = admin.initializeApp({projectId: policy.projectId}); const db=app.firestore(); db.settings({preferRest:true});
 try {
  const dry=await runDelegatedSubjectBatch(db,policy,manifest,'dry-run'); console.log(JSON.stringify({phase:'DRY_RUN',...dry}));
  if(mode==='--apply-authorized-relations') {
   const applied=await runDelegatedSubjectBatch(db,policy,manifest,'apply',dry.snapshot); console.log(JSON.stringify({phase:'APPLY',...applied}));
   const verified=await runDelegatedSubjectBatch(db,policy,manifest,'dry-run');
   if(verified.persisted!==94 || !verified.idempotent) throw Error('Reload verification failed');
   console.log(JSON.stringify({phase:'RELOAD_AND_AUDIT_VERIFIED',...verified}));
  }
 } finally {await app.delete();}
})().catch(e=>{console.error('CONTROLLED_SUBJECT_BATCH_BLOCKED:',e.message);process.exitCode=1;});
