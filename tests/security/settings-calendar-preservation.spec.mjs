import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = readFileSync(new URL('../../src/pages/Settings.tsx', import.meta.url), 'utf8');
test('settings cannot clear historical academic or financial collections when managing a new year', () => {
  for (const collection of ['grades', 'attendance', 'staffAttendance', 'payments', 'receipts', 'students', 'classes']) {
    assert.doesNotMatch(source, new RegExp(collection + String.raw`\s*:\s*\[\s*\]`));
  }
  assert.doesNotMatch(source, /deleteDoc\s*\(/);
  assert.match(source, /navigate\('\/academic-periods'\)/);
});
