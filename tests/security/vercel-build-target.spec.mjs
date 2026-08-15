import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveVercelBuildMode } from '../../scripts/build-vercel.mjs';

test('Vercel Preview builds target staging Firebase configuration', () => {
  assert.equal(resolveVercelBuildMode({
    VERCEL_ENV: 'preview',
    VERCEL_TARGET_ENV: 'preview',
  }), 'staging');
});

test('Vercel Production builds retain the Production Firebase configuration', () => {
  assert.equal(resolveVercelBuildMode({
    VERCEL_ENV: 'production',
    VERCEL_TARGET_ENV: 'production',
  }), 'production');
});

test('missing Vercel environment fails closed', () => {
  assert.throws(
    () => resolveVercelBuildMode({}),
    /Refusing to guess a Firebase target/,
  );
});

test('conflicting Vercel environment signals fail closed', () => {
  assert.throws(
    () => resolveVercelBuildMode({
      VERCEL_ENV: 'preview',
      VERCEL_TARGET_ENV: 'production',
    }),
    /environment mismatch/,
  );
});

test('development and custom environments cannot silently select Production', () => {
  for (const value of ['development', 'staging', '']) {
    assert.throws(
      () => resolveVercelBuildMode({ VERCEL_ENV: value }),
      /Unsupported or missing VERCEL_ENV/,
    );
  }
});

test('Diagnostic reports the Firebase configuration injected into the build', async () => {
  const source = await readFile(new URL('../../src/pages/Diagnostic.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectId:\s*import\.meta\.env\.VITE_FIREBASE_PROJECT_ID/);
  assert.match(source, /authDomain:\s*import\.meta\.env\.VITE_FIREBASE_AUTH_DOMAIN/);
  assert.match(source, /storageBucket:\s*import\.meta\.env\.VITE_FIREBASE_STORAGE_BUCKET/);
  assert.match(source, /appId:\s*import\.meta\.env\.VITE_FIREBASE_APP_ID/);
  assert.doesNotMatch(source, /projectId:\s*["']ecoscolaire-c5861["']/);
});
