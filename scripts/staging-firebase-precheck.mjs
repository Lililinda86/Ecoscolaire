export const STAGING_FIREBASE_PROJECT = 'ecoscolaire-staging';
export const PRODUCTION_FIREBASE_PROJECT = 'ecoscolaire-c5861';

export const assertAutomationBypassSecret = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('PRECHECK_FAILED: VERCEL_AUTOMATION_BYPASS_SECRET is missing.');
  }
  return value;
};

export const classifyFirebaseRequest = (rawUrl) => {
  let decodedUrl = String(rawUrl || '');
  try {
    decodedUrl = decodeURIComponent(decodedUrl);
  } catch {
    // Malformed URLs remain classifiable as raw strings and fail closed below.
  }
  const relevant = /(?:firebaseio\.com|firebaseapp\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i
    .test(decodedUrl);
  return {
    relevant,
    staging: relevant && decodedUrl.includes(STAGING_FIREBASE_PROJECT),
    production: relevant && decodedUrl.includes(PRODUCTION_FIREBASE_PROJECT),
  };
};

export const assertStagingRuntimeProject = (runtimeProject) => {
  const project = typeof runtimeProject === 'string' ? runtimeProject.trim() : '';
  if (project !== STAGING_FIREBASE_PROJECT) {
    throw new Error(
      project === PRODUCTION_FIREBASE_PROJECT
        ? 'PRECHECK_FAILED: runtime Firebase project is Production.'
        : 'PRECHECK_FAILED: runtime Firebase project is absent or unknown.',
    );
  }
  return project;
};

export const assertProtectedPreviewLoaded = ({ expectedOrigin, actualUrl }) => {
  let expected;
  let actual;
  try {
    expected = new URL(expectedOrigin);
    actual = new URL(actualUrl);
  } catch {
    throw new Error('PRECHECK_FAILED: protected Preview URL is invalid.');
  }
  if (actual.hostname === 'vercel.com' && actual.pathname.startsWith('/login')) {
    throw new Error('PRECHECK_FAILED: Vercel login page was returned instead of the Preview.');
  }
  if (actual.origin !== expected.origin) {
    throw new Error('PRECHECK_FAILED: navigation left the expected protected Preview origin.');
  }
  return actual.origin;
};

export const assertStagingFirebasePrecheck = ({ runtimeProject, requestUrls }) => {
  const project = assertStagingRuntimeProject(runtimeProject);

  const classified = (Array.isArray(requestUrls) ? requestUrls : []).map(classifyFirebaseRequest);
  const productionRequests = classified.filter((request) => request.production).length;
  if (productionRequests > 0) {
    throw new Error('PRECHECK_FAILED: a Production Firebase request was observed.');
  }
  const stagingRequests = classified.filter((request) => request.staging).length;
  if (stagingRequests < 1) {
    throw new Error('PRECHECK_FAILED: no Firebase interaction targeting staging was observed.');
  }

  return {
    runtimeProject: project,
    stagingRequests,
    productionRequests,
  };
};
