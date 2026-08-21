import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const classesSource = fs.readFileSync(new URL('../../src/pages/Classes.tsx', import.meta.url), 'utf8');

for (const role of ['owner', 'director']) {
  test(`App load as ${role} has no automatic class/student write path`, () => {
    assert.doesNotMatch(appSource, /safePatchDB|DatabasePatch/);
    assert.doesNotMatch(appSource, /standardFranco|standardAnglo|duplicateClassIdsToRemap/);
    assert.doesNotMatch(appSource, /crypto\.randomUUID\(\)/);
  });
}

test('class assignment updates UI only after the callable resolves', () => {
  const callableIndex = classesSource.indexOf('await assignStudentToClass');
  const localUpdateIndex = classesSource.indexOf('updateLocalState({', callableIndex);
  assert.ok(callableIndex >= 0, 'the class assignment must use the backend callable');
  assert.ok(localUpdateIndex > callableIndex, 'local state may update only after the callable response');
  assert.doesNotMatch(
    classesSource.slice(classesSource.indexOf('const handleChangeClass'), classesSource.indexOf('// Pré-résolution des noms')),
    /runTransaction|updateDoc|setDoc/,
  );
});
