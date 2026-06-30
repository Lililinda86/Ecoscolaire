const assert = require('assert');

// Mock Firebase Admin SDK for testing
const admin = {
  firestore: () => db,
}; 
admin.firestore.Timestamp = { now: () => ({ toMillis: () => Date.now() }), fromMillis: (m) => ({ toMillis: () => m }) };
const _dummy_admin = {
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
  runTransaction: async (updateFunction) => {
    return updateFunction({
      get: async (ref) => {
        const doc = mockDocs.find(d => d.id === ref.id);
        return { exists: !!doc, id: ref.id, data: () => doc };
      },
      update: (ref, data) => {}
    });
  },
  collection: (path) => ({
    where: (field, op, val) => ({
      limit: (num) => ({
        get: async () => {
          // In memory filtering for mock
          const filtered = mockDocs.filter(d => val.includes(d.status));
          // Wrap in snap
          const docs = filtered.slice(0, num).map(doc => ({
            id: doc.id,
            ref: { id: doc.id },
            data: () => doc
          }));
          return {
            docs,
            forEach: (cb) => docs.forEach(cb)
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
      if (typeof args[0] === 'string' && args[0].startsWith('Zombie Sweeper Completed.')) {
        const text = args[0];
        const scanned = parseInt(text.match(/Scanned: (\d+)/)[1]);
        const zombiesDetected = parseInt(text.match(/Zombies: (\d+)/)[1]);
        const skipped = parseInt(text.match(/Skipped: (\d+)/)[1]);
        const leasesAcquired = parseInt(text.match(/Leases: (\d+)/)[1]);
        capturedSummary = { scanned, zombiesDetected, skipped, leasesAcquired };
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
  
  const nowMillis = Date.now();
  const min20 = new Date(nowMillis - 20 * 60 * 1000);
  const min10 = new Date(nowMillis - 10 * 60 * 1000);
  const min5 = new Date(nowMillis - 5 * 60 * 1000);
  
  // Create mock Timestamp-like object
  const createTimestamp = (date) => ({
    toDate: () => date,
    toMillis: () => date.getTime()
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
      { id: 'job1', schoolId: 's1', status: 'RUNNING', lastHeartbeatAt: createTimestamp(min5) }
    ],
    (summary) => {
      assert.strictEqual(summary.scanned, 1);
      assert.strictEqual(summary.zombiesDetected, 0);
      assert.strictEqual(summary.skipped, 1);
    }
  );

  await testCase('Mixte (1 Zombie, 1 Récent, 1 sans Date)', 
    [
      { id: 'job1', schoolId: 's1', status: 'VALIDATING', lastHeartbeatAt: createTimestamp(min20) }, // Zombie
      { id: 'job2', schoolId: 's1', status: 'RUNNING', lastHeartbeatAt: createTimestamp(min5) },    // Skip
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
