import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';

const validatorPath = path.resolve('scripts/validate-firebase-environment.mjs');
const tmpDir = os.tmpdir();

function runTest(name, mode, envOverrides, expectedExitCode) {
  const env = {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'fake-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'fake-domain.firebaseapp.com',
    VITE_FIREBASE_STORAGE_BUCKET: 'fake-bucket.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    VITE_FIREBASE_APP_ID: '1:123456789:web:abcde',
    ...envOverrides,
  };

  // Remove keys explicitly set to undefined
  for (const key in envOverrides) {
    if (envOverrides[key] === undefined) {
      delete env[key];
    }
  }

  // Execute in temp dir so loadEnv doesn't find the real .env.staging
  const result = spawnSync('node', [validatorPath, '--mode', mode], { env, cwd: tmpDir, encoding: 'utf-8' });
  const output = result.stdout + result.stderr;
  
  // Check for leaked values
  const hasSecretLeak = output.includes('fake-api-key') || output.includes('fake-domain') || output.includes('1:123456');

  if (result.status !== expectedExitCode) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`Expected exit code ${expectedExitCode}, got ${result.status}`);
    console.error(`Output: ${output}`);
    return false;
  }
  
  if (hasSecretLeak) {
    console.error(`❌ FAIL: ${name} - Secret value leaked in output!`);
    console.error(`Output: ${output}`);
    return false;
  }

  console.log(`✅ PASS: ${name}`);
  return true;
}

console.log("--- Testing validate-firebase-environment.mjs ---");

let allPassed = true;

allPassed &= runTest(
  '1. staging + variables complètes + ecoscolaire-staging',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging' },
  0
);

allPassed &= runTest(
  '2. staging + ecoscolaire-c5861',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-c5861' },
  1
);

allPassed &= runTest(
  '3. production + variables complètes + ecoscolaire-c5861',
  'production',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-c5861' },
  0
);

allPassed &= runTest(
  '4. production + ecoscolaire-staging',
  'production',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging' },
  1
);

allPassed &= runTest(
  '5. mode invalide',
  'invalid',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging' },
  1
);

allPassed &= runTest(
  '6. API key absente',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_API_KEY: undefined },
  1
);

allPassed &= runTest(
  '7. authDomain absent',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_AUTH_DOMAIN: undefined },
  1
);

allPassed &= runTest(
  '8. storageBucket absent',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_STORAGE_BUCKET: undefined },
  1
);

allPassed &= runTest(
  '9. messagingSenderId absent',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_MESSAGING_SENDER_ID: undefined },
  1
);

allPassed &= runTest(
  '10. appId absent',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_APP_ID: undefined },
  1
);

allPassed &= runTest(
  '11. variable contenant uniquement des espaces',
  'staging',
  { VITE_FIREBASE_PROJECT_ID: 'ecoscolaire-staging', VITE_FIREBASE_API_KEY: '   ' },
  1
);

if (!allPassed) {
  console.error("\nSome tests failed.");
  process.exit(1);
} else {
  console.log("\nAll 11 automated tests passed (12: no secret leak implicitly verified).");
  process.exit(0);
}
