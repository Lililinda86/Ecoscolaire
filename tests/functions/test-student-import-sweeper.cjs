const assert = require('assert');

// Mock Firebase Admin SDK for testing
const admin = {
  firestore: () => db
};
// We need to inject the mock into the module's closure
let sweeperFunction;
const mockSdk = {
  onSchedule: (schedule, func) => {
    sweeperFunction = func;
    return func;
  }
};

// Properly mock the modules via require.cache
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'firebase-functions/v2/scheduler') {
    return mockSdk;
  }
  if (id === 'firebase-admin') {
    return admin;
  }
  return originalRequire.apply(this, arguments);
};

// Now require the module to register the function
const { sweepZombieImportJobs } = require('../../functions/lib/studentImportSweeper.js');

let mockDocs = [];

const db = {
  collection: (path) => ({
    where: (field, op, val) => ({
      limit: (num) => ({
        get: async () => {
          // In memory filtering for mock
          const filtered = mockDocs.filter(d => val.includes(d.status));
          // Wrap in snap
          return {
            forEach: (cb) => {
              filtered.slice(0, num).forEach(doc => {
                cb({
                  id: doc.id,
                  data: () => doc
                });
              });
            }
          };
        }
      })
    })
  })
};

let passed = 0;
let failed = 0;

async function testCase(name, docs, verify) {
  console.log(`\nTEST: ${name}`);
  mockDocs = docs;
  try {
    // Inject the mock admin before calling
    const originalAdmin = require('firebase-admin');
    originalAdmin.firestore = admin.firestore;
    
    let capturedSummary = null;
    const originalLog = console.log;
    console.log = function(...args) {
      if (args[0] === 'Zombie Sweeper Completed:' && args[1]) {
        capturedSummary = args[1];
      }
      // originalLog.apply(console, args); // Suppress log for cleaner test output
    };

    await sweeperFunction({});
    
    console.log = originalLog; // Restore

    verify(capturedSummary);
    console.log(`✅ PASS`);
    passed++;
  } catch (error) {
    console.error(`❌ FAIL:`, error);
    failed++;
  }
}

async function runTests() {
  console.log('=== TESTS ZOMBIE SWEEPER (E1.1) ===');
  
  const now = Date.now();
  const min10 = new Date(now - 10 * 60 * 1000);
  const min20 = new Date(now - 20 * 60 * 1000);
  
  // Create mock Timestamp-like object
  const createTimestamp = (date) => ({
    toDate: () => date
  });

  await testCase('Détecte 1 zombie (RUNNING > 15m)', 
    [
      { id: 'job1', schoolId: 's1', status: 'RUNNING', updatedAt: createTimestamp(min20) }
    ],
    (summary) => {
      assert.strictEqual(summary.scanned, 1);
      assert.strictEqual(summary.zombiesDetected, 1);
      assert.strictEqual(summary.skipped, 0);
    }
  );

  await testCase('Ignore un job récent (RUNNING < 15m)', 
    [
      { id: 'job1', schoolId: 's1', status: 'RUNNING', updatedAt: createTimestamp(min10) }
    ],
    (summary) => {
      assert.strictEqual(summary.scanned, 1);
      assert.strictEqual(summary.zombiesDetected, 0);
      assert.strictEqual(summary.skipped, 1);
    }
  );

  await testCase('Mixte (1 Zombie, 1 Récent, 1 sans Date)', 
    [
      { id: 'job1', schoolId: 's1', status: 'VALIDATING', updatedAt: createTimestamp(min20) }, // Zombie
      { id: 'job2', schoolId: 's1', status: 'RUNNING', updatedAt: createTimestamp(min10) },    // Skip
      { id: 'job3', schoolId: 's1', status: 'RUNNING' } // Skip (pas de date)
    ],
    (summary) => {
      assert.strictEqual(summary.scanned, 3);
      assert.strictEqual(summary.zombiesDetected, 1);
      assert.strictEqual(summary.skipped, 2);
    }
  );
  
  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
