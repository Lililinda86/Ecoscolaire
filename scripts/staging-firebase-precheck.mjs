export const STAGING_FIREBASE_PROJECT = 'ecoscolaire-staging';
export const PRODUCTION_FIREBASE_PROJECT = 'ecoscolaire-c5861';

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

export const assertStagingFirebasePrecheck = ({ runtimeProject, requestUrls }) => {
  const project = typeof runtimeProject === 'string' ? runtimeProject.trim() : '';
  if (project !== STAGING_FIREBASE_PROJECT) {
    throw new Error(
      project === PRODUCTION_FIREBASE_PROJECT
        ? 'PRECHECK_FAILED: runtime Firebase project is Production.'
        : 'PRECHECK_FAILED: runtime Firebase project is absent or unknown.',
    );
  }

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
