import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { test } from '@playwright/test';
const { describe, beforeAll, beforeEach, afterAll } = test;
let env;
const path = 'schools/school-a/pedagogy/preparations/year-a/upload-a/original.pdf';
const metadata = contentType => ({ contentType, customMetadata: { checksum: 'a'.repeat(64), preparationId: 'prep-a' } });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'ecoscolaire-pedagogy-storage-security', storage: { rules: fs.readFileSync('storage.rules', 'utf8') } }); });
beforeEach(async () => { await env.clearStorage(); });
const storageFor = (uid, role, schoolId = 'school-a') => env.authenticatedContext(uid, { role, schoolId }).storage();
describe('Pedagogy Lot B immutable Storage originals', () => {
  test('secretary uploads and reads a bounded PDF', async () => {
    const storage = storageFor('secretary-a', 'secretary');
    await assertSucceeds(uploadBytes(ref(storage, path), new Uint8Array([1, 2, 3]), metadata('application/pdf')));
    await assertSucceeds(getBytes(ref(storage, path)));
  });
  test('PNG and JPEG are accepted', async () => {
    const storage = storageFor('director-a', 'director');
    await assertSucceeds(uploadBytes(ref(storage, path.replace('.pdf', '.png')), new Uint8Array([1]), metadata('image/png')));
    await assertSucceeds(uploadBytes(ref(storage, path.replace('.pdf', '.jpg')), new Uint8Array([1]), metadata('image/jpeg')));
  });
  test('overwrite and deletion remain forbidden', async () => {
    await env.withSecurityRulesDisabled(async context => uploadBytes(ref(context.storage(), path), new Uint8Array([1]), metadata('application/pdf')));
    const storage = storageFor('owner-a', 'owner');
    await assertFails(uploadBytes(ref(storage, path), new Uint8Array([2]), metadata('application/pdf')));
    await assertFails(deleteObject(ref(storage, path)));
  });
  test('rejects unsupported content, wrong extension and oversize files', async () => {
    const storage = storageFor('secretary-a', 'secretary');
    await assertFails(uploadBytes(ref(storage, path.replace('.pdf', '.txt')), new Uint8Array([1]), metadata('text/plain')));
    await assertFails(uploadBytes(ref(storage, path.replace('.pdf', '.jpg')), new Uint8Array([1]), metadata('application/pdf')));
    await assertFails(uploadBytes(ref(storage, path), new Uint8Array(10 * 1024 * 1024 + 1), metadata('application/pdf')));
    await assertFails(uploadBytes(ref(storage, path), new Uint8Array([1]), { contentType: 'application/pdf' }));
  });
  test('teacher, board viewer, unauthenticated and other school are denied', async () => {
    for (const [uid, role, schoolId] of [['teacher-a', 'teacher', 'school-a'], ['board-a', 'boardViewer', 'school-a'], ['secretary-b', 'secretary', 'school-b']]) {
      const storage = storageFor(uid, role, schoolId);
      await assertFails(uploadBytes(ref(storage, path), new Uint8Array([1]), metadata('application/pdf')));
      await assertFails(getBytes(ref(storage, path)));
    }
    await assertFails(uploadBytes(ref(env.unauthenticatedContext().storage(), path), new Uint8Array([1]), metadata('application/pdf')));
  });
});
afterAll(async () => env.cleanup());
