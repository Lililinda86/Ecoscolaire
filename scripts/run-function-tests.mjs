import { spawnSync } from 'node:child_process';

const tests = [
  'tests/functions/test-transport-paid-cycles.cjs',
  'tests/functions/test-import-job-processor.cjs',
  'tests/functions/test-student-import-sweeper.cjs',
  'tests/functions/test-student-import-lease.cjs',
  'tests/functions/test-student-import-recovery.cjs',
  'tests/functions/test-student-import-bulk-writer.cjs',
  'tests/functions/test-student-finance-projection.cjs',
  'tests/functions/test-secretary-collection-calculations.cjs',
  'tests/functions/test-manage-report-card-contracts.cjs',
  'tests/functions/test-academic-resolvers.cjs',
  'tests/functions/test-boardviewer-governance.cjs',
  'tests/functions/test-authenticated-audit.cjs',
  'tests/functions/test-expense-ledger.cjs',
  'tests/functions/test-student-class-assignment.cjs',
  'tests/functions/test-manage-staff.cjs',
  'tests/functions/test-staff-user-links.cjs',
  'tests/functions/test-manage-grades-contracts.cjs',
  'tests/functions/test-pedagogy-preparations.cjs',
  'tests/functions/test-pedagogy-weekly-assessments.cjs',
];

for (const testFile of tests) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
