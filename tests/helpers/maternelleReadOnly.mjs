import assert from 'node:assert/strict';

export const STAGING_PROJECT = 'ecoscolaire-staging';
export const FEATURE_REF = 'refs/heads/codex/maternelle-labels-audit';
export const PREVIEW_HOST = /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/;

export function assertReadOnlyRun(env) {
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.ok([FEATURE_REF, 'refs/heads/staging'].includes(env.GITHUB_REF), 'Unapproved branch');
  assert.equal(env.GITHUB_REPOSITORY, 'Lililinda86/Ecoscolaire');
  assert.equal(env.STAGING_FIREBASE_PROJECT_ID, STAGING_PROJECT);
  return env.GITHUB_REF === FEATURE_REF ? 'pre-merge' : 'post-merge';
}

export function classifyReadOnlyRequest(rawUrl, method, { appOrigin, apiKey, storageBucket }) {
  const url = new URL(rawUrl);
  const decoded = decodeURIComponent(rawUrl);
  if (decoded.includes('ecoscolaire-c5861')) return 'forbidden-production';
  if (url.hostname === 'firestore.googleapis.com') {
    if (!decoded.includes(`projects/${STAGING_PROJECT}/`)) return 'forbidden-project';
    if (/\/Write\/|:commit|:batchWrite|:beginTransaction|:rollback/i.test(decoded)) return 'forbidden-write';
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'read';
    return method === 'POST' && /\/Listen\/|:runQuery|:runAggregationQuery|:batchGet/.test(decoded) ? 'read' : 'forbidden-write';
  }
  if (url.hostname.endsWith('.cloudfunctions.net')) {
    if (!url.hostname.endsWith(`-${STAGING_PROJECT}.cloudfunctions.net`)) return 'forbidden-project';
    // The app emits this audit after sign-in. Abort it; never fabricate a success response.
    return url.pathname === '/recordAuthenticatedAudit' ? 'blocked-login-audit' : 'forbidden-write';
  }
  if (['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname)) {
    if (!apiKey || url.searchParams.get('key') !== apiKey) return 'forbidden-project';
    if (method === 'OPTIONS') return 'auth';
    return method === 'POST' && ['/v1/accounts:signInWithPassword', '/v1/accounts:lookup', '/v1/token'].includes(url.pathname) ? 'auth' : 'forbidden-auth-change';
  }
  if (url.hostname === 'firebasestorage.googleapis.com') {
    return ['GET', 'HEAD', 'OPTIONS'].includes(method) && decoded.includes(`/b/${storageBucket}/`) ? 'read' : 'forbidden-write';
  }
  if (url.origin === appOrigin) return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'app' : 'forbidden-write';
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'asset' : 'blocked-external-post';
}

export function selectReadOnlyPreview(deployments, expectedSha) {
  const urls = new Set();
  for (const deployment of deployments) {
    if (deployment.sha !== expectedSha || deployment.creator?.login !== 'vercel[bot]') continue;
    assert.equal(deployment.production_environment, false, 'Production deployment forbidden');
    assert.equal(deployment.environment, 'Preview');
    for (const status of deployment.statuses || []) {
      if (status.state !== 'success' || status.environment !== 'Preview') continue;
      const url = new URL(status.environment_url);
      assert.equal(url.protocol, 'https:');
      assert.match(url.hostname, PREVIEW_HOST);
      urls.add(url.origin);
    }
  }
  assert.ok(urls.size <= 1, 'Ambiguous immutable preview');
  return [...urls][0] || null;
}

export function redactReadOnlyError(error, env = process.env) {
  let message = error instanceof Error ? error.message : String(error);
  const values = Object.entries(env).filter(([key, value]) => /PASSWORD|SECRET|TOKEN|API_KEY|SERVICE_ACCOUNT/.test(key) && typeof value === 'string').map(([, value]) => value);
  for (const value of [...values]) {
    try { const json = JSON.parse(value); values.push(json.private_key, json.private_key_id); } catch { /* Not a JSON credential. */ }
  }
  for (const value of values.filter(value => typeof value === 'string' && value.length > 3)) message = message.split(value).join('[REDACTED]');
  return message.replace(/([?&](?:key|token|secret)=)[^&\s)]+/gi, '$1[REDACTED]');
}
