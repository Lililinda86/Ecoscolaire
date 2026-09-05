export class StagingUiPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StagingUiPreflightError';
    this.code = code;
  }
}

const TIMEOUT_PATTERN = /(?:timeout|timed out|aborted due to timeout)/i;

export function describeHttpTransportError(error) {
  const cause = error?.cause;
  return {
    error: {
      name: error?.name || null,
      message: error?.message || String(error)
    },
    cause: {
      name: cause?.name || null,
      message: cause?.message || null,
      code: cause?.code || null,
      errno: cause?.errno ?? null,
      syscall: cause?.syscall || null,
      hostname: cause?.hostname || null
    }
  };
}

export function classifyHttpTransportError(error) {
  const details = describeHttpTransportError(error);
  const timedOut = [
    details.error.name,
    details.error.message,
    details.cause.name,
    details.cause.message,
    details.cause.code
  ].some(value => TIMEOUT_PATTERN.test(String(value || ''))) || details.cause.code === 'ABORT_ERR';
  return timedOut ? 'STAGING_UI_PREFLIGHT_TIMEOUT' : 'STAGING_UI_NETWORK_FAILURE';
}

const fail = (code, message) => { throw new StagingUiPreflightError(code, message); };
const requireCheck = (condition, code, message) => { if (!condition) fail(code, message); };

const FULL_SHA = /^[a-f0-9]{40}$/i;
const APPROVED_IMMUTABLE_HOST = /^ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/i;

export function resolveExpectedStagingSha({ eventName, githubSha, githubRef, dispatchSha }) {
  const expectedSha = eventName === 'workflow_dispatch' ? String(dispatchSha || '').trim() : String(githubSha || '').trim();
  requireCheck((eventName === 'workflow_dispatch' || eventName === 'push') && githubRef === 'refs/heads/staging', 'INVALID_STAGING_TRIGGER', 'Validation must run from the staging branch');
  requireCheck(FULL_SHA.test(expectedSha), 'MISSING_OR_INVALID_EXPECTED_SHA', 'An exact full Staging SHA is required');
  return expectedSha.toLowerCase();
}

export function selectStagingVercelUrl({ expectedSha, branchSha, stagingDeploymentPass, deployments }) {
  requireCheck(branchSha === expectedSha, 'WRONG_STAGING_SHA', `origin/staging mismatch: ${branchSha || 'missing'}`);
  requireCheck(stagingDeploymentPass, 'FIREBASE_DEPLOYMENT_NOT_PASS', 'Official Firebase Staging deployment for exact SHA is not PASS');
  const urls = [];
  for (const deployment of deployments || []) {
    if (deployment.creatorLogin !== 'vercel[bot]') continue;
    if (deployment.sha !== expectedSha || deployment.ref !== expectedSha) continue;
    if (deployment.productionEnvironment || /production/i.test(String(deployment.environment || ''))) {
      fail('PRODUCTION_URL_FORBIDDEN', 'Production Vercel deployment is forbidden');
    }
    if (deployment.environment !== 'Preview') continue;
    for (const status of deployment.statuses || []) {
      if (status.state !== 'success' || status.environment !== 'Preview') continue;
      if (!status.environmentUrl) fail('MISSING_IMMUTABLE_URL', 'Successful Vercel deployment has no immutable URL');
      let url;
      try {
        url = new URL(status.environmentUrl);
      } catch {
        fail('INVALID_STAGING_URL', 'Vercel deployment URL is invalid');
      }
      requireCheck(url.protocol === 'https:' && APPROVED_IMMUTABLE_HOST.test(url.hostname), 'UNAPPROVED_STAGING_URL', 'Vercel URL is not an approved EcoScolaire immutable deployment');
      urls.push(url.origin);
    }
  }
  requireCheck(urls.length > 0, 'VERCEL_DEPLOYMENT_NOT_PASS', 'No successful exact-SHA Staging Vercel deployment was found');
  requireCheck(new Set(urls).size === 1, 'AMBIGUOUS_VERCEL_DEPLOYMENT', 'Multiple immutable Vercel URLs match the exact Staging SHA');
  return urls[0];
}

export function inspectUiHttpPreflight({ selectedUrl, finalUrl, status, body, bypassSecretPresent }) {
  requireCheck(bypassSecretPresent, 'MISSING_VERCEL_BYPASS_SECRET', 'VERCEL_AUTOMATION_BYPASS_SECRET is required');
  let selected;
  let final;
  try {
    selected = new URL(selectedUrl);
    final = new URL(finalUrl);
  } catch {
    fail('INVALID_STAGING_URL', 'Staging UI URL is invalid');
  }
  requireCheck(selected.protocol === 'https:' && APPROVED_IMMUTABLE_HOST.test(selected.hostname), 'UNAPPROVED_STAGING_URL', 'Staging UI URL is not an approved immutable deployment');
  requireCheck(!/^(?:www\.)?vercel\.com$/i.test(final.hostname), 'VERCEL_PROTECTED_URL', `Staging UI redirected to ${final.hostname}`);
  requireCheck(final.origin === selected.origin, 'UNEXPECTED_UI_REDIRECT', 'Staging UI redirected away from the selected immutable deployment');
  const html = String(body || '');
  requireCheck(!/vercel\.com\/login|<title[^>]*>\s*Login\b[^<]*Vercel|Log in to Vercel/i.test(html), 'VERCEL_PROTECTED_URL', 'Vercel login page returned');
  requireCheck(status >= 200 && status < 300, 'STAGING_UI_HTTP_FAILURE', `Staging UI returned HTTP ${status}`);
  requireCheck(/<div[^>]+id=["']root["']/i.test(html) && /(?:EcoScolaire|\/assets\/index-[^"' ]+\.js)/i.test(html), 'NOT_ECOSCOLAIRE_APP', 'EcoScolaire HTML signature is missing');
  return { code: 'PASS', finalUrl: final.href, status };
}

export function classifyBrowserLanding({ finalUrl, hasLoginEmail, hasAppShell }) {
  const final = new URL(finalUrl);
  requireCheck(!/^(?:www\.)?vercel\.com$/i.test(final.hostname), 'VERCEL_PROTECTED_URL', `Browser redirected to ${final.hostname}`);
  requireCheck(hasLoginEmail || hasAppShell, 'ECOSCOLAIRE_SHELL_NOT_VISIBLE', 'EcoScolaire login or app shell was not visible within the bounded timeout');
  return { code: 'PASS' };
}
