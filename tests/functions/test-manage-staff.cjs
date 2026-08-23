const assert = require('assert');
const Module = require('module');
const originalRequire = Module.prototype.require;

const docs = {};
let autoId = 0;

function reference(path, id) {
  const key = `${path}/${id}`;
  if (!docs[key]) {
    docs[key] = {
      id,
      path: key,
      exists: false,
      value: undefined,
      get: async function() { return { exists: this.exists, data: () => this.value }; },
    };
  }
  return docs[key];
}

const db = {
  collection(path) {
    return { doc(id) { return reference(path, id || `auto_${++autoId}`); } };
  },
  async runTransaction(callback) {
    return callback({
      get: ref => ref.get(),
      create(ref, value) {
        assert.strictEqual(ref.exists, false, `create collision at ${ref.path}`);
        ref.exists = true;
        ref.value = { ...value };
      },
      update(ref, value) {
        assert.strictEqual(ref.exists, true, `missing update target ${ref.path}`);
        ref.value = { ...ref.value, ...value };
      },
    });
  },
};

const firestore = () => db;
const adminMock = { firestore };
const functionsMock = {
  logger: { error: () => undefined },
  https: {
    onCall: handler => handler,
    HttpsError: class HttpsError extends Error {
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    },
  },
};

Module.prototype.require = function patchedRequire(name) {
  if (name === 'firebase-admin') return adminMock;
  if (name === 'firebase-admin/firestore') {
    return { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } };
  }
  if (name === 'firebase-functions') return functionsMock;
  return originalRequire.apply(this, arguments);
};

const { manageStaff } = require('../../functions/lib/staff/manageStaff.js');

function put(path, value) {
  const [collection, id] = path.split('/');
  const ref = reference(collection, id);
  ref.exists = true;
  ref.value = { ...value };
  return ref;
}

async function expectBusinessError(call, code, businessCode) {
  try {
    await call();
    assert.fail(`Expected ${businessCode}`);
  } catch (error) {
    if (error.name === 'AssertionError') throw error;
    assert.strictEqual(error.code, code);
    assert.strictEqual(error.details?.businessCode, businessCode);
  }
}

async function run() {
  await expectBusinessError(
    () => manageStaff({ action: 'CREATE', profile: {} }, {}),
    'unauthenticated',
    'UNAUTHENTICATED',
  );

  put('users/owner', { role: 'owner', schoolId: 'S1', isActive: true });
  put('users/director', { role: 'director', schoolId: 'S1', active: true });
  put('users/secretary', { role: 'secretary', schoolId: 'S1', status: 'active' });
  put('users/teacher', { role: 'teacher', schoolId: 'S1', isActive: true });

  await expectBusinessError(
    () => manageStaff({ action: 'CREATE', profile: { firstName: 'A', lastName: 'B' } }, { auth: { uid: 'teacher' } }),
    'permission-denied',
    'PERMISSION_DENIED',
  );
  await expectBusinessError(
    () => manageStaff({ action: 'CREATE', schoolId: 'S2', profile: { firstName: 'A', lastName: 'B' } }, { auth: { uid: 'owner' } }),
    'permission-denied',
    'SCHOOL_MISMATCH',
  );
  await expectBusinessError(
    () => manageStaff({ action: 'CREATE', profile: { firstName: 'A', lastName: 'B', role: 'owner' } }, { auth: { uid: 'owner' } }),
    'invalid-argument',
    'UNSUPPORTED_STAFF_FIELDS',
  );

  const created = await manageStaff({
    action: 'CREATE',
    profile: {
      firstName: '  Alice ', lastName: ' Martin ', phone: ' 600000000 ',
      email: ' alice@example.test ', staffType: 'teacher', employmentStatus: 'active',
      testFixture: true, testRunId: 'staff-safe-1',
    },
  }, { auth: { uid: 'owner' } });
  assert.strictEqual(created.schoolId, 'S1');
  const staff = docs[`staff/${created.staffId}`];
  assert.ok(staff.exists);
  assert.strictEqual(staff.value.schoolId, 'S1');
  assert.strictEqual(staff.value.firstName, 'Alice');
  assert.strictEqual(staff.value.createdAt, 'SERVER_TIMESTAMP');
  assert.strictEqual(staff.value.createdBy, 'owner');

  let audits = Object.values(docs).filter(doc => doc.path.startsWith('audit_logs/'));
  assert.strictEqual(audits.length, 1);
  assert.strictEqual(audits[0].value.action, 'STAFF_CREATED');
  const auditJson = JSON.stringify(audits[0].value);
  assert.ok(!auditJson.includes('Alice'));
  assert.ok(!auditJson.includes('alice@example.test'));
  assert.ok(!auditJson.includes('600000000'));

  const updated = await manageStaff({
    action: 'UPDATE', staffId: created.staffId,
    profile: { firstName: 'Alice-2', staffType: 'driver' },
  }, { auth: { uid: 'secretary' } });
  assert.strictEqual(updated.schoolId, 'S1');
  assert.strictEqual(staff.value.firstName, 'Alice-2');
  assert.strictEqual(staff.value.staffType, 'driver');
  assert.strictEqual(staff.value.createdBy, 'owner');

  const deactivated = await manageStaff(
    { action: 'DEACTIVATE', staffId: created.staffId },
    { auth: { uid: 'director' } },
  );
  assert.strictEqual(deactivated.isActive, false);
  assert.strictEqual(staff.exists, true);
  assert.strictEqual(staff.value.employmentStatus, 'inactive');

  const reactivated = await manageStaff(
    { action: 'REACTIVATE', staffId: created.staffId },
    { auth: { uid: 'director' } },
  );
  assert.strictEqual(reactivated.isActive, true);
  assert.strictEqual(staff.exists, true);
  assert.strictEqual(staff.value.employmentStatus, 'active');

  audits = Object.values(docs).filter(doc => doc.path.startsWith('audit_logs/'));
  assert.deepStrictEqual(
    audits.map(doc => doc.value.action),
    ['STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED'],
  );
  console.log('✅ manageStaff lifecycle, tenant isolation and audit tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
