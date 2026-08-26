import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildReportCardPdf } from '../../src/services/reportCardPdf';
import type { ReportCard, ReportCardSnapshot, ReportCardSubjectResult } from '../../src/types';

const subject = (index: number, status: ReportCardSubjectResult['status'] = 'VALID'): ReportCardSubjectResult => ({
  classSubjectId: `class-subject-${index}`,
  subjectId: `subject-${index}`,
  subjectName: index === 0
    ? 'Mathématiques / Mathematics — résolution de problèmes et raisonnement logique avancé'
    : `Matière bilingue ${index} / Bilingual subject ${index}`,
  subjectCode: `M${String(index).padStart(2, '0')}`,
  coefficient: status === 'MISSING_COEFFICIENT' ? null : (index % 3) + 1,
  status,
  evaluationCount: status === 'NOT_EVALUATED' ? 0 : 2,
  scoredCount: status === 'VALID' ? 1 : 0,
  absenceCount: index === 1 ? 1 : 0,
  excusedCount: index === 2 ? 1 : 0,
  evaluationResults: [],
  rawAverage: status === 'VALID' ? 11.25 + (index % 7) : null,
  displayedAverage: status === 'VALID' ? '11,25' : null,
  weightedPoints: status === 'VALID' ? 22.5 : null,
  calculable: status === 'VALID',
});

const fixture = (status: ReportCard['status'] = 'published', count = 36): ReportCard => {
  const subjectResults = Array.from({ length: count }, (_, index) => subject(index,
    index === 4 ? 'NOT_EVALUATED' : index === 5 ? 'NO_CALCULABLE_GRADE' : index === 6 ? 'MISSING_COEFFICIENT' : 'VALID'));
  const snapshot: ReportCardSnapshot = {
    school: { id: 'school-staging', name: 'École Primaire Bilingue ITALO' },
    academicYear: { id: 'year-2026', name: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30' },
    period: { id: 'term-1', name: 'Trimestre 1 / Term 1', startDate: '2026-09-01', endDate: '2026-12-15' },
    class: { id: 'class-6', name: 'CM2 / Grade 6', section: 'Bilingue', type: 'primary' },
    student: { id: 'student-fixture', name: 'Amina Nlong Étoundi', registrationNumber: 'TEST-W2-05', section: 'Bilingue' },
    program: { id: 'program-fixture', revisionId: 'revision-1', revisionNumber: 1 },
    subjectResults,
    overallResult: { generalAverage: 14.375, totalPoints: 345, totalCoefficients: 24 },
    blockingIssues: [],
    sourceRefs: { evaluationIds: [], gradeIds: [] },
    policy: {
      normalizedScale: 20,
      eligibleEvaluationStatus: 'published',
      absence: 'PRESERVED_NOT_ZERO',
      missingGrade: 'BLOCK_VALIDATION',
      ranking: 'DEFERRED',
      mention: 'DEFERRED',
      promotionDecision: 'OUT_OF_SCOPE',
    },
    directorComment: 'Progression régulière. Continuez vos efforts en français et en anglais.',
  };
  return {
    id: 'rc-w2-05-pdf-fixture', schoolId: 'school-staging', academicYearId: 'year-2026', periodId: 'term-1',
    classId: 'class-6', studentId: 'student-fixture', programId: 'program-fixture', programRevisionId: 'revision-1',
    programRevisionNumber: 1, status, version: 4, immutable: status === 'published', snapshot,
    sourceHash: 'a'.repeat(64), snapshotHash: 'b'.repeat(64), officialSnapshot: status === 'published' ? snapshot : undefined,
    officialSnapshotHash: status === 'published' ? 'b'.repeat(64) : undefined,
    createdAt: '2026-08-26T08:00:00.000Z', createdBy: 'director-fixture', updatedAt: '2026-08-26T08:00:00.000Z',
    updatedBy: 'director-fixture', publishedAt: status === 'published' ? '2026-08-26T08:00:00.000Z' : undefined,
    publishedBy: status === 'published' ? 'director-fixture' : undefined, testFixture: true, testRunId: 'w2-05-pdf',
  };
};

describe('W2-05 official report-card PDF', () => {
  test('refuses draft or validated mutable data', () => {
    expect(() => buildReportCardPdf(fixture('draft'))).toThrow('REPORT_CARD_NOT_PUBLISHED');
    expect(() => buildReportCardPdf(fixture('validated'))).toThrow('REPORT_CARD_NOT_PUBLISHED');
  });

  test('creates a deterministic A4 multi-page PDF from the immutable published snapshot', () => {
    const first = Buffer.from(buildReportCardPdf(fixture()).output('arraybuffer'));
    const second = Buffer.from(buildReportCardPdf(fixture()).output('arraybuffer'));
    expect(first.subarray(0, 5).toString()).toBe('%PDF-');
    expect(first.equals(second)).toBe(true);
    expect(buildReportCardPdf(fixture()).getNumberOfPages()).toBeGreaterThan(1);

    const outputDir = path.resolve('output/pdf');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'w2-05-report-card-fixture.pdf'), first);
  });
});
