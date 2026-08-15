import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const resolveVercelBuildMode = (environment = process.env) => {
  const vercelEnvironment = String(environment.VERCEL_ENV || '').trim();
  const targetEnvironment = String(environment.VERCEL_TARGET_ENV || '').trim();

  if (targetEnvironment && targetEnvironment !== vercelEnvironment) {
    throw new Error(
      `Vercel environment mismatch: VERCEL_ENV=${vercelEnvironment || 'missing'}, `
      + `VERCEL_TARGET_ENV=${targetEnvironment}.`,
    );
  }

  if (vercelEnvironment === 'preview') return 'staging';
  if (vercelEnvironment === 'production') return 'production';

  throw new Error(
    `Unsupported or missing VERCEL_ENV: ${vercelEnvironment || 'missing'}. `
    + 'Refusing to guess a Firebase target.',
  );
};

export const runVercelBuild = (environment = process.env) => {
  const mode = resolveVercelBuildMode(environment);
  console.log(`Vercel build target selected: ${mode}`);
  const npmEntrypoint = environment.npm_execpath;
  const command = npmEntrypoint ? process.execPath : 'npm';
  const args = npmEntrypoint
    ? [npmEntrypoint, 'run', `build:${mode}`]
    : ['run', `build:${mode}`];
  const result = spawnSync(command, args, {
    env: environment,
    shell: !npmEntrypoint && process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Vercel ${mode} build failed with exit code ${result.status ?? 'unknown'}.`);
  }
};

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile) {
  try {
    runVercelBuild();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
