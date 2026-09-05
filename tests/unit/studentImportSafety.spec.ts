import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isRealStudentImportEnabled,
  omitLegacyStudentFinancialFields
} from '../../functions/src/studentImportBulkWriter';

describe('legacy student import safety', () => {
  it('removes parent-finance source fields before every BulkWriter write', () => {
    const sanitized = omitLegacyStudentFinancialFields({
      id: 'student-import-1',
      schoolId: 'school-1',
      matricule: 'MAT-1',
      name: 'Élève Import',
      importJobId: 'job-1',
      importedAt: 'now',
      updatedAt: 'now',
      feeT1: 1000,
      feeT2: 2000,
      feeT3: 3000,
      financialBypass: { t1: true, t2: false, t3: false }
    });

    expect(sanitized).not.toHaveProperty('feeT1');
    expect(sanitized).not.toHaveProperty('feeT2');
    expect(sanitized).not.toHaveProperty('feeT3');
    expect(sanitized).not.toHaveProperty('financialBypass');
  });

  it('routes the students UI import through secure callable creation only', () => {
    const source = readFileSync('src/pages/Students.tsx', 'utf8');
    const confirmation = source.slice(
      source.indexOf('const handleConfirmImport = async () =>'),
      source.indexOf('const exportInscriptionsCSV')
    );
    expect(source).toContain('data-testid="student-import-open"');
    expect(confirmation).toContain('await createStudentSecure({');
    expect(confirmation).toContain('splitStudentData(student)');
    expect(confirmation).not.toMatch(/writeBatch\(|batch\.set\(|setDoc\(/);
  });

  it('keeps the BulkWriter real-data path disabled defensively', () => {
    expect(isRealStudentImportEnabled()).toBe(false);
  });

  it('keeps enforceStudentSaasLimits observational and non-destructive', () => {
    const source = readFileSync('functions/src/index.ts', 'utf8');
    const triggerStart = source.indexOf('export const enforceStudentSaasLimits');
    const triggerEnd = source.indexOf('// 9. updateStudentFinancialStatus', triggerStart);
    const trigger = source.slice(triggerStart, triggerEnd);
    expect(trigger).toContain('no mutation performed');
    expect(trigger).not.toMatch(/\.delete\s*\(/);
    expect(trigger).not.toMatch(/transaction\.(?:set|update|delete)\s*\(/);
    expect(trigger).not.toMatch(/change\.(?:after|before)\.ref/);
  });

  it('does not introduce asynchronous projection synchronization', () => {
    const sources = [
      readFileSync('functions/src/index.ts', 'utf8'),
      readFileSync('functions/src/studentImportBulkWriter.ts', 'utf8')
    ].join('\n');
    expect(sources).not.toMatch(/document\(['"]studentFinance\/\{[^}]+\}['"]\)[\s\S]{0,120}onWrite/);
    expect(sources).not.toMatch(/document\(['"]studentParentFinance\/\{[^}]+\}['"]\)[\s\S]{0,120}onWrite/);
  });
});
