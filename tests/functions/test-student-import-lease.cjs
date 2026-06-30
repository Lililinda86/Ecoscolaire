const assert = require('assert');

// Mock Firestore Timestamp
class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000);
  }
  static fromMillis(millis) {
    return new Timestamp(Math.floor(millis / 1000), (millis % 1000) * 1000000);
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
}

let mockDocStore = {};

const db = {
  runTransaction: async (updateFunction) => {
    // Very simple mock transaction for testing
    const transaction = {
      get: async (ref) => {
        const data = mockDocStore[ref.id];
        return {
          exists: !!data,
          id: ref.id,
          data: () => data
        };
      },
      update: (ref, data) => {
        mockDocStore[ref.id] = { ...mockDocStore[ref.id], ...data };
      }
    };
    return updateFunction(transaction);
  }
};

const admin = {
  firestore: () => db
};
admin.firestore.Timestamp = Timestamp;

// Properly mock the modules via require.cache
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'firebase-admin') {
    return admin;
  }
  if (id === 'firebase-functions/v2/scheduler') {
    return { onSchedule: (schedule, func) => func };
  }
  return originalRequire.apply(this, arguments);
};

const { acquireZombieLease } = require('../../functions/lib/studentImportSweeper.js');

let passed = 0;
let failed = 0;

async function runTests() {
  console.log('=== TESTS ZOMBIE LEASE (E1.2) ===');

  const nowMillis = Date.now();
  const min20Ago = Timestamp.fromMillis(nowMillis - 20 * 60000);
  const min10Ago = Timestamp.fromMillis(nowMillis - 10 * 60000);
  const min5Ago = Timestamp.fromMillis(nowMillis - 5 * 60000);
  const min5Future = Timestamp.fromMillis(nowMillis + 5 * 60000);

  const testCases = [
    {
      id: 'T1',
      name: 'Zombie sans lease -> acquisition PASS',
      initialState: { schoolId: 's1', status: 'RUNNING', updatedAt: min20Ago },
      expected: true
    },
    {
      id: 'T2',
      name: 'Lease expiré -> acquisition PASS',
      initialState: { schoolId: 's1', status: 'RUNNING', updatedAt: min20Ago, sweeperLockedUntil: min10Ago },
      expected: true
    },
    {
      id: 'T3',
      name: 'Lease actif -> false PASS',
      initialState: { schoolId: 's1', status: 'RUNNING', updatedAt: min20Ago, sweeperLockedUntil: min5Future },
      expected: false
    },
    {
      id: 'T4',
      name: 'Status SUCCESS -> false PASS',
      initialState: { schoolId: 's1', status: 'SUCCESS', updatedAt: min20Ago },
      expected: false
    },
    {
      id: 'T5',
      name: 'Status FAILED -> false PASS',
      initialState: { schoolId: 's1', status: 'FAILED', updatedAt: min20Ago },
      expected: false
    },
    {
      id: 'T6',
      name: 'Job récent (<10 min) -> false PASS',
      initialState: { schoolId: 's1', status: 'RUNNING', updatedAt: min5Ago },
      expected: false
    }
  ];

  for (const t of testCases) {
    mockDocStore[t.id] = t.initialState;
    const ref = { id: t.id };
    try {
      const result = await acquireZombieLease(db, ref, 'sweeper-test');
      assert.strictEqual(result, t.expected);
      console.log(`✅ ${t.id}: ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${t.id}: ${t.name} (Error: ${e.message})`);
      failed++;
    }
  }

  // T7: Deux transactions concurrentes
  try {
    mockDocStore['T7'] = { schoolId: 's1', status: 'RUNNING', updatedAt: min20Ago };
    const ref = { id: 'T7' };
    
    // Simulate concurrency with OCC by serializing them but checking version/retry.
    // An easy way to simulate OCC is to make runTransaction sequential.
    let isLocked = false;
    let concurrentDb = {
      runTransaction: async (updateFunction) => {
        // Simulate OCC lock
        while (isLocked) await new Promise(r => setTimeout(r, 10));
        isLocked = true;
        try {
          let tx = {
            get: async (ref) => {
              const data = mockDocStore[ref.id];
              return { exists: !!data, id: ref.id, data: () => data };
            },
            update: (ref, data) => { mockDocStore[ref.id] = { ...mockDocStore[ref.id], ...data }; }
          };
          const res = await updateFunction(tx);
          return res;
        } finally {
          isLocked = false;
        }
      }
    };

    const p1 = acquireZombieLease(concurrentDb, ref, 'sweeper-1');
    const p2 = acquireZombieLease(concurrentDb, ref, 'sweeper-2'); // In a real mock, this would run sequentially after p1 mutates.
    
    // Simple manual simulation of Firestore's retry behavior:
    // P1 runs, updates mockDocStore.
    const res1 = await p1;
    // P2 runs, reads updated mockDocStore.
    const res2 = await p2;
    
    assert.strictEqual(res1, true);
    assert.strictEqual(res2, false);
    console.log(`✅ T7: Deux transactions concurrentes -> Une vraie OCC empêcherait la double écriture. PASS simulé.`);
    passed++;
  } catch (e) {
    console.log(`❌ T7: Concurrent (Error: ${e.message})`);
    failed++;
  }

  console.log(`\n=== RÉSULTATS: ${passed} PASS, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

runTests();
