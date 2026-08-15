export const STAGING_PROJECT_ID = 'ecoscolaire-staging';

const ENV_NAMES = {
  alpha: 'STAGING_TEST_ALPHA_PASSWORD',
  beta: 'STAGING_TEST_BETA_PASSWORD',
  superAdmin: 'STAGING_TEST_SUPERADMIN_PASSWORD',
};

export function assertStagingProject(projectId) {
  if (projectId !== STAGING_PROJECT_ID) {
    throw new Error(`Refusing credential use outside ${STAGING_PROJECT_ID}.`);
  }
}

export function requireStagingCredential(kind) {
  const envName = ENV_NAMES[kind];
  const value = envName ? process.env[envName] : undefined;
  if (!value) throw new Error(`${envName ?? kind} is required.`);
  return value;
}
