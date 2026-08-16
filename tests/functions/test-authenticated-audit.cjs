const assert = require('node:assert/strict');
const { handleAuthenticatedAudit } = require('../../functions/lib/authenticatedAudit.js');

const users = new Map([
  ['board-a', { role: 'boardViewer', schoolId: 'school-a', email: 'board@school-a.test', active: true }],
  ['secretary-a', { role: 'secretary', schoolId: 'school-a', email: 'secretary@school-a.test', isActive: true }],
  ['owner-a', { role: 'owner', schoolId: 'school-a', email: 'owner@school-a.test', status: 'active' }],
  ['inactive-a', { role: 'boardViewer', schoolId: 'school-a', email: 'inactive@school-a.test', active: false }],
]);
const records = [];
const serverTimestamp = Object.freeze({ trustedServerTimestamp: true });
const dependencies = {
  loadUser: async uid => ({ exists: users.has(uid), data: users.get(uid) }),
  createAudit: async record => {
    records.push(record);
    return `audit-${records.length}`;
  },
  serverTimestamp: () => serverTimestamp,
  nowIso: () => '2026-08-16T12:00:00.000Z',
};
const auth = uid => ({ uid, token: { email: `forged-${uid}@client.test` } });

const expectCode = async (operation, expectedCode) => {
  await assert.rejects(operation, error => {
    assert.equal(error.code, expectedCode);
    return true;
  });
};

(async () => {
  await expectCode(
    () => handleAuthenticatedAudit({ action: 'LOGIN' }, undefined, dependencies),
    'unauthenticated',
  );
  await expectCode(
    () => handleAuthenticatedAudit({ action: 'LOGIN' }, auth('missing-profile'), dependencies),
    'permission-denied',
  );
  await expectCode(
    () => handleAuthenticatedAudit({ action: 'LOGIN' }, auth('inactive-a'), dependencies),
    'permission-denied',
  );

  for (const uid of ['board-a', 'secretary-a', 'owner-a']) {
    for (const action of ['LOGIN', 'LOGOUT']) {
      const before = records.length;
      const result = await handleAuthenticatedAudit({ action }, auth(uid), dependencies);
      assert.equal(result.auditId, `audit-${before + 1}`);
      const record = records.at(-1);
      const profile = users.get(uid);
      assert.equal(record.actorUid, uid);
      assert.equal(record.userId, uid);
      assert.equal(record.actorRole, profile.role);
      assert.equal(record.userRole, profile.role);
      assert.equal(record.schoolId, 'school-a');
      assert.equal(record.userEmail, profile.email);
      assert.equal(record.action, action);
      assert.equal(record.targetType, 'SYSTEM');
      assert.equal(record.targetId, uid);
      assert.equal(record.targetName, profile.email);
      assert.equal(record.createdAt, serverTimestamp);
      assert.equal(record.timestamp, '2026-08-16T12:00:00.000Z');
      assert.equal(record.canonicalBackendAudit, true);
    }
  }

  for (const forged of [
    { action: 'LOGIN', actorUid: 'victim' },
    { action: 'LOGIN', role: 'superAdmin' },
    { action: 'LOGIN', schoolId: 'school-b' },
    { action: 'LOGIN', createdAt: 'client-time' },
  ]) {
    const before = records.length;
    await expectCode(
      () => handleAuthenticatedAudit(forged, auth('board-a'), dependencies),
      'invalid-argument',
    );
    assert.equal(records.length, before);
  }

  await expectCode(
    () => handleAuthenticatedAudit({ action: 'ARBITRARY_EVENT' }, auth('board-a'), dependencies),
    'invalid-argument',
  );
  await expectCode(
    () => handleAuthenticatedAudit({
      action: 'CREATE_PAYMENT', targetType: 'PAYMENT', targetId: 'payment-1', targetName: 'Payment 1',
    }, auth('board-a'), dependencies),
    'permission-denied',
  );
  await expectCode(
    () => handleAuthenticatedAudit({
      action: 'CREATE_USER', targetType: 'STUDENT', targetId: 'user-b', targetName: 'User B',
    }, auth('owner-a'), dependencies),
    'invalid-argument',
  );
  await expectCode(
    () => handleAuthenticatedAudit({
      action: 'CREATE_USER', targetType: 'USER', targetId: 'user-b', targetName: 'User B',
      details: { password: 'forbidden' },
    }, auth('owner-a'), dependencies),
    'invalid-argument',
  );

  const businessResult = await handleAuthenticatedAudit({
    action: 'CREATE_USER', targetType: 'USER', targetId: 'user-b', targetName: 'User B',
    details: { setupEmailSent: true },
  }, auth('owner-a'), dependencies);
  assert.equal(businessResult.auditId, `audit-${records.length}`);
  assert.deepEqual(records.at(-1).details, { setupEmailSent: true });

  console.log('Authenticated backend audit tests: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
