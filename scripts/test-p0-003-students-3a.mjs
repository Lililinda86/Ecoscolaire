import fs from 'fs';

const fileContent = fs.readFileSync('src/pages/Students.tsx', 'utf8');

const tests = [
  {
    name: 'Aucun saveDB dans handleSave',
    check: () => {
      const funcBody = fileContent.split('const handleSave =')[1].split('const handleDelete =')[0];
      return !funcBody.includes('saveDB');
    },
  },
  {
    name: 'Aucun saveDB dans handleDelete',
    check: () => {
      const funcBody = fileContent.split('const handleDelete =')[1].split('const handleDeleteAll =')[0];
      return !funcBody.includes('saveDB');
    },
  },
  {
    name: 'Présence de updateDoc pour édition',
    check: () => fileContent.includes('await updateDoc(studentRef, patchData)'),
  },
  {
    name: 'Aucun setDoc destructif pour édition',
    check: () => {
      const match = fileContent.match(/if \(isEditing.*\)\s*{[\s\S]*?}/);
      if (!match) return false;
      return !match[0].includes('setDoc');
    }
  },
  {
    name: 'ID stable avant submit (dans handleOpenModal)',
    check: () => fileContent.match(/handleOpenModal[\s\S]*?crypto\.randomUUID\(\)/) !== null,
  },
  {
    name: 'Validation requests sans saveDB',
    check: () => {
      const funcBody = fileContent.split('const handleDelete =')[1].split('const handleDeleteAll =')[0];
      return funcBody.includes('setDoc') && funcBody.includes('validation_requests') && !funcBody.includes('saveDB');
    }
  },
  {
    name: 'Patch strict : pas de ...finalStudent',
    check: () => {
      const editBlock = fileContent.match(/if \(isEditing.*\) {[\s\S]*?updateDoc/);
      return editBlock && !editBlock[0].includes('...finalStudent');
    }
  },
  {
    name: 'Patch strict : pas de schoolId, createdAt, createdBy',
    check: () => {
      const editBlock = fileContent.match(/if \(isEditing.*\) {[\s\S]*?updateDoc/);
      if (!editBlock) return false;
      return !editBlock[0].match(/schoolId:|createdAt:|createdBy:/);
    }
  }
];

let failed = false;

console.log('--- STATICAL VERIFICATION 3A ---');
tests.forEach(t => {
  if (t.check()) {
    console.log(`✅ ${t.name}`);
  } else {
    console.error(`❌ ${t.name}`);
    failed = true;
  }
});

if (failed) {
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
  process.exit(0);
}
