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
  console.log('=== TEST IMPORT SWEEPER RUNTIME KILL SWITCH ===');
  let firestoreCalled = false;
  admin.firestore = () => {
    firestoreCalled = true;
    throw new Error('Firestore must not be accessed while imports are disabled');
  };

  await sweeperFunction({});
  assert.strictEqual(firestoreCalled, false);
  console.log('✅ sweeper exits before Firestore, leases or recovery');
  passed++;
  
  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
