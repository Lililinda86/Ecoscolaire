import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Only a fresh CI demo checkout may create this disposable, ignored override.
if (process.env.CI !== 'true' || process.env.PEDAGOGY_SAFE_CI !== 'true' ||
    process.argv[2] !== 'demo-ecoscolaire' || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.PEDAGOGY_STAGING_E2E === 'true') {
  throw new Error('An isolated demo CI environment is required.');
}
writeFileSync(new URL('../functions/.secret.local', import.meta.url),
  `PEDAGOGY_OPENAI_API_KEY=synthetic-emulator-only-${randomBytes(24).toString('hex')}\n`,
  { flag: 'wx', mode: 0o600 });
console.log('Disposable emulator override created; no real AI credential or provider call.');
