import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { verifyDeployedArchive } from '../../scripts/verify-staging-pedagogy-source.mjs';
const filename = 'lib/pedagogy/sourceWatchPolicy.js';
test('accepts the exact compiled source with portable line endings', async () => {
  const archive = zipSync({ [filename]: strToU8('verified\r\nsource\r\n') });
  assert.equal((await verifyDeployedArchive(Buffer.from(archive), { [filename]: Buffer.from('verified\nsource\n') }))[0].file, filename);
});
test('rejects an ACTIVE function archive containing stale policy code', async () => {
  const archive = zipSync({ [filename]: strToU8('old policy') });
  await assert.rejects(verifyDeployedArchive(Buffer.from(archive), { [filename]: Buffer.from('new policy') }), /DEPLOYED_SOURCE_MISMATCH/);
});
test('rejects an archive without the required compiled module', async () => {
  const archive = zipSync({ 'unrelated.js': strToU8('irrelevant') });
  await assert.rejects(verifyDeployedArchive(Buffer.from(archive), { [filename]: Buffer.from('required') }), /SOURCE_FILE_MISSING_OR_DUPLICATED/);
});
