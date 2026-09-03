export class StagingUiPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StagingUiPreflightError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new StagingUiPreflightError(code, message); };
const requireCheck = (condition, code, message) => { if (!condition) fail(code, message); };

export function inspectUiHttpPreflight({ configuredUrl, finalUrl, status, body, expectedUrl }) {
  let configured;
  let final;
  try {
    configured = new URL(configuredUrl);
    final = new URL(finalUrl);
  } catch {
    fail('INVALID_STAGING_URL', 'Staging UI URL is invalid');
  }
  requireCheck(configured.protocol === 'https:', 'NON_HTTPS_STAGING_URL', 'Staging UI URL must use HTTPS');
  requireCheck(configured.origin === new URL(expectedUrl).origin, 'UNAPPROVED_STAGING_URL', 'Staging UI URL is not the approved exact-deployment URL');
  requireCheck(!/^(?:www\.)?vercel\.com$/i.test(final.hostname), 'VERCEL_PROTECTED_URL', `Staging UI redirected to ${final.hostname}`);
  const html = String(body || '');
  requireCheck(!/vercel\.com\/login|<title[^>]*>\s*Login\b[^<]*Vercel|Log in to Vercel/i.test(html), 'VERCEL_PROTECTED_URL', 'Vercel login page returned');
  requireCheck(status >= 200 && status < 300, 'STAGING_UI_HTTP_FAILURE', `Staging UI returned HTTP ${status}`);
  requireCheck(/<div[^>]+id=["']root["']/i.test(html) && /(?:EcoScolaire|\/assets\/index-[^"' ]+\.js)/i.test(html), 'NOT_ECOSCOLAIRE_APP', 'EcoScolaire HTML signature is missing');
  return { code: 'PASS', finalUrl: final.href, status };
}

export function assertExactStagingMetadata({ branchSha, firebaseDeploymentPass, vercelDeploymentPass, productionDeployment = false, expectedSha }) {
  requireCheck(branchSha === expectedSha, 'WRONG_STAGING_SHA', `origin/staging mismatch: ${branchSha || 'missing'}`);
  requireCheck(firebaseDeploymentPass, 'FIREBASE_DEPLOYMENT_NOT_PASS', 'Firebase Staging deployment for exact SHA is not PASS');
  requireCheck(vercelDeploymentPass, 'VERCEL_DEPLOYMENT_NOT_PASS', 'Vercel deployment for exact SHA is not PASS');
  requireCheck(!productionDeployment, 'PRODUCTION_URL_FORBIDDEN', 'Production deployment is forbidden');
  return { code: 'PASS', sha: expectedSha };
}

export function classifyBrowserLanding({ finalUrl, hasLoginEmail, hasAppShell }) {
  const final = new URL(finalUrl);
  requireCheck(!/^(?:www\.)?vercel\.com$/i.test(final.hostname), 'VERCEL_PROTECTED_URL', `Browser redirected to ${final.hostname}`);
  requireCheck(hasLoginEmail || hasAppShell, 'ECOSCOLAIRE_SHELL_NOT_VISIBLE', 'EcoScolaire login or app shell was not visible within the bounded timeout');
  return { code: 'PASS' };
}
