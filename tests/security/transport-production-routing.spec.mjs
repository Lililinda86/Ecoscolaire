import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isAuthorizedTransportRelease, RELEASE_INFRASTRUCTURE } from '../../scripts/transport-production-routing.mjs';
const workflow = fs.readFileSync('.github/workflows/firebase-deploy.yml', 'utf8');
test('only the approved product tree and bounded release infrastructure use the verification-only route', () => {
  assert.equal(isAuthorizedTransportRelease([]), true);
  assert.equal(isAuthorizedTransportRelease([...RELEASE_INFRASTRUCTURE]), true);
  for (const file of ['src/pages/Settings.tsx', 'src/pages/Grades.tsx', 'functions/src/index.ts', 'firestore.rules', 'package.json', 'scripts/build-vercel.mjs']) {
    assert.equal(isAuthorizedTransportRelease([file]), false, file);
  }
});
test('approved transport release skips every backend deployment and retains verification gates', () => {
  assert.ok(workflow.includes('node scripts/transport-production-routing.mjs'));
  assert.ok(workflow.includes("echo 'verification_only=true'"));
  assert.ok(workflow.includes("if: steps.limited.outputs.enabled == 'true' && steps.limited.outputs.verification_only != 'true'"));
  assert.ok(workflow.includes("if: steps.limited.outputs.enabled != 'true' # LIMITED_RELEASE_LEGACY_GUARD"));
  assert.ok(workflow.includes('Verify every limited Function is ACTIVE'));
  assert.ok(workflow.includes('node scripts/verify-production-rules-source.mjs'));
  assert.ok(workflow.includes('node scripts/verify-production-backup-gate.mjs'));
});
