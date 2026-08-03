import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { assertMockPaymentAllowed } = require('../functions/lib/index.js');

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
      console.log(`✅ PASS: ${message}`);
    } else {
      failed++;
      console.error(`❌ FAIL: ${message}`);
    }
  }

  function testAllowed(projectId, isEmulator, isTestEnv, message) {
    try {
      assertMockPaymentAllowed(projectId, isEmulator, isTestEnv);
      assert(true, message);
    } catch (err) {
      assert(false, `${message} - Unexpected error: ${err.message}`);
    }
  }

  function testRefused(projectId, isEmulator, isTestEnv, message) {
    try {
      assertMockPaymentAllowed(projectId, isEmulator, isTestEnv);
      assert(false, `${message} - Should have thrown an error`);
    } catch (err) {
      assert(err.message === 'mockConfirmPayment is disabled outside test environment', `${message} - Threw expected error`);
    }
  }

  console.log('--- Testing assertMockPaymentAllowed ---');

  // ecoscolaire-staging : autorisé (assuming it doesn't need emulator/testEnv flags if it's exactly this project? Wait, the code says: `if (projectId !== 'ecoscolaire-staging' && !isEmulator && !isTestEnv) throw Error`)
  // So if projectId === 'ecoscolaire-staging', it won't throw.
  testAllowed('ecoscolaire-staging', false, false, 'ecoscolaire-staging is allowed');

  // ecoscolaire-c5861 : refusé
  testRefused('ecoscolaire-c5861', false, false, 'ecoscolaire-c5861 is refused');

  // projet inconnu : refusé
  testRefused('some-unknown-project', false, false, 'unknown project is refused');

  // valeur absente : refusée
  testRefused(undefined, false, false, 'undefined project is refused');
  
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

// We need to compile index.ts or use ts-node. Let's use the compiled JS from functions/lib/index.js
// Wait, the compiled file is in functions/lib/index.js
// Let's modify the import for the test script.
