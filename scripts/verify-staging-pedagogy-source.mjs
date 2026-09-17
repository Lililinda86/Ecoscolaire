import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import unzipper from 'unzipper';

const normalize = bytes => Buffer.from(bytes).toString('utf8').replace(/\r\n/g, '\n');
const digest = bytes => createHash('sha256').update(normalize(bytes)).digest('hex');
export async function verifyDeployedArchive(bytes, expectedFiles) {
  assert(bytes.length <= 50 * 1024 * 1024, 'SOURCE_ARCHIVE_TOO_LARGE');
  const archive = await unzipper.Open.buffer(bytes), results = [];
  for (const [name, expected] of Object.entries(expectedFiles)) {
    const files = archive.files.filter(file => file.path === name);
    assert.equal(files.length, 1, 'SOURCE_FILE_MISSING_OR_DUPLICATED');
    assert(files[0].uncompressedSize <= 2 * 1024 * 1024, 'SOURCE_FILE_TOO_LARGE');
    const actualHash = digest(await files[0].buffer()), expectedHash = digest(expected);
    assert.equal(actualHash, expectedHash, 'DEPLOYED_SOURCE_MISMATCH');
    results.push({ file: name, sha256: actualHash });
  }
  return results;
}

async function main() {
  assert.equal(process.argv[2], '--project=ecoscolaire-staging', 'STAGING_PROJECT_REQUIRED');
  if (process.env.CI) assert.equal(process.env.GITHUB_REF, 'refs/heads/staging', 'STAGING_BRANCH_REQUIRED');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { GoogleAuth } = require('google-auth-library');
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
  const checks = [
    ['pedagogyFridayScheduler', ['lib/pedagogy/fridayPolicy.js', 'lib/pedagogy/fridayAutomation.js']],
    ['savePedagogySourceWatch', ['lib/pedagogy/sourceWatchPolicy.js', 'lib/pedagogy/sourceWatch.js']],
    ['pedagogySourceWatchScheduler', ['lib/pedagogy/sourceWatchPolicy.js', 'lib/pedagogy/sourceWatch.js']],
    ['recordPedagogySourceWatchReview', ['lib/pedagogy/sourceWatchPolicy.js', 'lib/pedagogy/sourceWatch.js']],
  ];
  for (const [functionName, files] of checks) {
    try {
      const endpoint = 'https://cloudfunctions.googleapis.com/v1/projects/ecoscolaire-staging/locations/us-central1/functions/' + functionName;
      const info = (await client.request({ url: endpoint, timeout: 30000 })).data;
      assert.equal(info.status, 'ACTIVE', 'FUNCTION_NOT_ACTIVE');
      const signed = (await client.request({ url: endpoint + ':generateDownloadUrl', method: 'POST', data: { versionId: info.versionId }, timeout: 30000 })).data;
      const url = new URL(signed.downloadUrl);
      assert(url.protocol === 'https:' && (url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('.storage.googleapis.com')), 'SOURCE_DOWNLOAD_HOST_INVALID');
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60000) });
      assert(response.ok, 'SOURCE_DOWNLOAD_FAILED');
      const expected = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(new URL('../functions/' + file, import.meta.url))])));
      const verified = await verifyDeployedArchive(Buffer.from(await response.arrayBuffer()), expected);
      console.log(JSON.stringify({ projectId: 'ecoscolaire-staging', functionName, versionId: info.versionId, sourceVerification: 'PASS', files: verified }));
    } catch (error) {
      // Never print signed source URLs, credentials, response bodies or headers.
      console.error(JSON.stringify({ functionName, sourceVerification: 'FAIL', code: /^[A-Z_]+$/.test(error?.message || '') ? error.message : 'SOURCE_VERIFICATION_FAILED' }));
      throw new Error('STAGING_DEPLOYED_SOURCE_VERIFICATION_FAILED');
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('STAGING_DEPLOYED_SOURCE_VERIFICATION_FAILED'); process.exitCode = 1; });
}
