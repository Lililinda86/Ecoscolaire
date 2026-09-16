/* One authorization, one environment, one consumed batch. No HTTP endpoint.
 * Private manifest is deliberately NOT committed or logged. IAM ADC required.
 * Usage: node scripts/apply-authorized-primary-levels.cjs <private-manifest> --dry-run
 * After CI/deployment: same command with --apply-approved-twelve (fresh dry-run first).
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const admin = requireFunctions('firebase-admin');
const { runDelegatedLevelBatch } = require('../functions/lib/pedagogy/delegatedLevelBatch');
const policy = Object.freeze({ projectId: 'ecoscolaire-staging', manifestDigest: 'ac45af50a1c07e3a2e54cb5b2164546281252917fad8a167a5fd75f1882892df', authorizationReference: 'sha256:ed447a80b535a80b68df31fe4d55952a4a40656cff5d1fcd0c18c3697cd0c28f' });
(async () => {
  const [filename, mode, ...extra] = process.argv.slice(2);
  if (!filename || extra.length || !['--dry-run', '--apply-approved-twelve'].includes(mode)) throw Error('Explicit private manifest and supported mode required');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw Error('Live runner cannot use emulator overrides');
  for (const key of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) if (process.env[key] && process.env[key] !== policy.projectId) throw Error('Environment project conflict');
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const app = admin.initializeApp({ projectId: policy.projectId });
  const db = app.firestore(); db.settings({ preferRest: true });
  try {
    const dryRun = await runDelegatedLevelBatch(db, policy, manifest, 'dry-run');
    console.log(JSON.stringify({ phase: 'DRY_RUN', ...dryRun }));
    if (mode === '--apply-approved-twelve') {
      const applied = await runDelegatedLevelBatch(db, policy, manifest, 'apply', dryRun.snapshot);
      console.log(JSON.stringify({ phase: 'APPLY', ...applied }));
      const verified = await runDelegatedLevelBatch(db, policy, manifest, 'dry-run');
      if (verified.persisted !== 12 || !verified.idempotent) throw Error('Post-write verification failed');
      console.log(JSON.stringify({ phase: 'RELOAD_AND_AUDIT_VERIFIED', ...verified }));
    }
  } finally { await app.delete(); }
})().catch(error => { console.error('CONTROLLED_LEVEL_BATCH_BLOCKED:', error.message); process.exitCode = 1; });
