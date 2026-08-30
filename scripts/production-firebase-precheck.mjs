export const STAGING_FIREBASE_PROJECT = 'ecoscolaire-staging';
export const PRODUCTION_FIREBASE_PROJECT = 'ecoscolaire-c5861';

export const classifyFirebaseRequest = (rawUrl) => {
  let decodedUrl = String(rawUrl || '');
  try { decodedUrl = decodeURIComponent(decodedUrl); } catch { /* fail closed below */ }
  const relevant = /(?:firebaseio\.com|firebaseapp\.com|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i
    .test(decodedUrl);
  return {
    relevant,
    staging: relevant && decodedUrl.includes(STAGING_FIREBASE_PROJECT),
    production: relevant && decodedUrl.includes(PRODUCTION_FIREBASE_PROJECT),
  };
};

export const assertProductionRuntimeProject = (runtimeProject) => {
  const project = typeof runtimeProject === 'string' ? runtimeProject.trim() : '';
  if (project !== PRODUCTION_FIREBASE_PROJECT) {
    throw new Error(project === STAGING_FIREBASE_PROJECT
      ? 'PRECHECK_FAILED: runtime Firebase project is Staging.'
      : 'PRECHECK_FAILED: runtime Firebase project is absent or unknown.');
  }
  return project;
};

export const assertProductionAppLoaded = ({ expectedOrigin, actualUrl }) => {
  const expected = new URL(expectedOrigin);
  const actual = new URL(actualUrl);
  if (actual.origin !== expected.origin) throw new Error('PRECHECK_FAILED: navigation left the Production origin.');
  return actual.origin;
};

export const assertProductionFirebasePrecheck = ({ runtimeProject, requestUrls }) => {
  const project = assertProductionRuntimeProject(runtimeProject);
  const classified = (Array.isArray(requestUrls) ? requestUrls : []).map(classifyFirebaseRequest);
  const stagingRequests = classified.filter((request) => request.staging).length;
  if (stagingRequests > 0) throw new Error('PRECHECK_FAILED: a Staging Firebase request was observed.');
  const productionRequests = classified.filter((request) => request.production).length;
  if (productionRequests < 1) throw new Error('PRECHECK_FAILED: no Production Firebase interaction was observed.');
  return { runtimeProject: project, productionRequests, stagingRequests };
};
