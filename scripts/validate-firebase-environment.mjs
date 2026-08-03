import { loadEnv } from 'vite';

const modeIndex = process.argv.indexOf('--mode');
if (modeIndex === -1 || !process.argv[modeIndex + 1]) {
  console.error("CRITICAL ERROR: --mode is required for validate-firebase-environment.mjs");
  process.exit(1);
}

const mode = process.argv[modeIndex + 1];
const env = loadEnv(mode, process.cwd(), '');

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

let isConfigValid = true;
for (const key of requiredKeys) {
  const val = env[key];
  if (!val || val.trim() === '') {
    console.error(`Variable Firebase obligatoire absente :\n${key}`);
    isConfigValid = false;
  }
}

if (!isConfigValid) {
  process.exit(1);
}

const projectId = env['VITE_FIREBASE_PROJECT_ID'];

if (mode === 'staging') {
  if (projectId !== 'ecoscolaire-staging') {
    console.error(`CRITICAL ERROR: In staging mode, VITE_FIREBASE_PROJECT_ID must be 'ecoscolaire-staging'.`);
    process.exit(1);
  }
} else if (mode === 'production') {
  if (projectId !== 'ecoscolaire-c5861') {
    console.error(`CRITICAL ERROR: In production mode, VITE_FIREBASE_PROJECT_ID must be 'ecoscolaire-c5861'.`);
    process.exit(1);
  }
} else {
  console.error(`CRITICAL ERROR: Unknown mode '${mode}'.`);
  process.exit(1);
}

console.log(`Environment validation passed for mode: ${mode}`);
process.exit(0);
