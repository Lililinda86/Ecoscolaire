import { test } from '@playwright/test';

type CredentialKind = 'alpha' | 'beta' | 'superAdmin';

const ENV_NAMES: Record<CredentialKind, string> = {
  alpha: 'STAGING_TEST_ALPHA_PASSWORD',
  beta: 'STAGING_TEST_BETA_PASSWORD',
  superAdmin: 'STAGING_TEST_SUPERADMIN_PASSWORD',
};

export function loadStagingCredentials(required: CredentialKind[]) {
  const values = Object.fromEntries(
    required.map((kind) => [kind, process.env[ENV_NAMES[kind]]]),
  ) as Partial<Record<CredentialKind, string>>;
  const missing = required.filter((kind) => !values[kind]);

  if (missing.length && process.env.STAGING_TESTS_REQUIRED === 'true') {
    throw new Error(
      `Required staging credentials are missing: ${missing.map((kind) => ENV_NAMES[kind]).join(', ')}`,
    );
  }

  test.skip(
    missing.length > 0,
    `Live staging credentials unavailable: ${missing.map((kind) => ENV_NAMES[kind]).join(', ')}`,
  );

  return {
    alphaPassword: values.alpha ?? '',
    betaPassword: values.beta ?? '',
    superAdminPassword: values.superAdmin ?? '',
  };
}
