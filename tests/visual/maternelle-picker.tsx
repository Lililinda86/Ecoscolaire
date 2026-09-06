import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClassProgramSubjectPicker } from '../../src/pages/subjects/programs/editor/ClassProgramSubjectPicker';
import '../../src/index.css';

const classes = [
  { id: 'visual-legacy-ps', name: 'Maternelle 1 francophone' },
  { id: 'visual-alias-ps', name: 'Petite Section francophone' },
  { id: 'visual-legacy-ms', name: 'Maternelle 2 francophone' },
  { id: 'visual-alias-ms', name: 'Moyenne Section francophone' },
  { id: 'visual-legacy-gs', name: 'Maternelle 3 francophone' },
  { id: 'visual-alias-gs', name: 'Grande Section francophone' },
].map(item => ({ ...item, schoolId: 'visual-only', type: 'francophone' as const, cycle: 'maternelle' as const, isActive: true }));

createRoot(document.getElementById('root')!).render(<ClassProgramSubjectPicker
  classes={classes} selectedClass={classes[0]} classId={classes[0].id}
  schoolId="visual-only" catalogSubjects={[]} activeSubjects={[]}
  onClose={() => undefined}
  onBulkSelect={() => { throw new Error('READ_ONLY: submission forbidden'); }}
/>);
