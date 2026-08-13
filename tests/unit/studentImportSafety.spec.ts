import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { omitLegacyStudentFinancialFields } from '../../functions/src/studentImportBulkWriter';

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

  it('keeps real-data import explicitly disabled in the students UI', () => {
    const source = readFileSync('src/pages/Students.tsx', 'utf8');
    expect(source).toContain('Import temporairement indisponible — utilisez l’ajout manuel sécurisé.');
    expect(source).toMatch(/<button[\s\S]*?disabled[\s\S]*?Import temporairement indisponible[\s\S]*?<\/button>/);
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
