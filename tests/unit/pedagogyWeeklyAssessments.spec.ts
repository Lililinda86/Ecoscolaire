import { describe, expect, it } from 'vitest';
import { assessmentId, canTransitionWeeklyAssessment, coverageFor, DEFAULT_ASSESSMENT_POLICY, deterministicWeeklyAssessmentGenerator, fridayForWeek, hasAssessmentSourceChanged, schoolWeekInDouala, sourceChecksum, validateWeeklyAssessmentResult, type ValidatedPreparationSource } from '../../functions/src/pedagogy/weeklyAssessmentGenerator';

const source = (id: string, subjectId = 'math', version = 1): ValidatedPreparationSource => ({ id, version, subjectId, classSubjectId: `class-${subjectId}`, subjectName: subjectId === 'math' ? 'Mathématiques' : 'Français', curriculumUnitId: `unit-${id}`, lessonTitle: `Leçon ${id}`, objective: `Objectif ${id}`, pedagogicalContent: `Contenu ${id}` });
const input = (sources = [source('prep-1')]) => ({ school: { id: 'school', name: 'École' }, academicYear: { id: 'year', name: '2026-2027' }, class: { id: 'class', name: 'CE1' }, week: { id: 'week', startDate: '2026-12-28', endDate: '2027-01-03', fridayDate: '2027-01-01' }, validatedPreparations: sources, subjects: sources.map(item => ({ id: item.subjectId, name: item.subjectName })), pedagogicalContent: sources, assessmentPolicy: { ...DEFAULT_ASSESSMENT_POLICY } });

describe('Lot C weekly assessment domain', () => {
  it('builds one deterministic assessment identity', () => expect(assessmentId('s', 'y', 'c', 'w')).toBe('s__y__c__w'));
  it('detects missing subjects and partial coverage without invention', () => {
    const result = coverageFor([{ subjectId: 'math' }, { subjectId: 'fr' }, { subjectId: 'science' }], [source('a', 'math'), source('b', 'fr')]);
    expect(result.missingSubjects.map(item => item.id)).toEqual(['science']); expect(result.coveragePercent).toBe(66.67);
  });
  it('keeps a stable source checksum and detects version/addition changes', () => {
    const checksum = sourceChecksum([source('a')]);
    expect(sourceChecksum([source('a')])).toBe(checksum); expect(hasAssessmentSourceChanged(checksum, [source('a')])).toBe(false);
    expect(hasAssessmentSourceChanged(checksum, [source('a', 'math', 2)])).toBe(true); expect(hasAssessmentSourceChanged(checksum, [source('a'), source('b')])).toBe(true);
  });
  it.each([['2026-08-31T22:30:00.000Z', '2026-08-31', '2026-09-04'], ['2026-12-31T23:30:00.000Z', '2026-12-28', '2027-01-01'], ['2027-01-03T22:59:00.000Z', '2026-12-28', '2027-01-01'], ['2027-01-03T23:01:00.000Z', '2027-01-04', '2027-01-08']])('uses Africa/Douala at date boundaries', (instant, monday, friday) => {
    expect(schoolWeekInDouala(new Date(instant))).toEqual({ monday, friday }); expect(fridayForWeek(monday)).toBe(friday);
  });
  it('generates varied traced questions with exact configurable points', async () => {
    const result = await deterministicWeeklyAssessmentGenerator.generate(input([source('a', 'math'), source('b', 'fr'), source('c', 'math')]));
    expect(result.items.every(item => item.sourceLessonPreparationIds.length > 0)).toBe(true); expect(new Set(result.items.map(item => item.questionType)).size).toBeGreaterThan(1);
    expect(result.items.reduce((sum, item) => sum + item.points, 0)).toBe(20); expect(result.durationMinutes).toBe(60);
  });
  it('fails safely without validated preparations', async () => await expect(deterministicWeeklyAssessmentGenerator.generate(input([]))).rejects.toThrow('NO_VALIDATED_PREPARATIONS'));
  it('provides a deterministic failure hook', async () => await expect(deterministicWeeklyAssessmentGenerator.generate({ ...input(), class: { id: 'class', name: '[generator-fail] CE1' } })).rejects.toThrow('MOCK_WEEKLY_ASSESSMENT_FAILURE'));
  it('rejects missing traceability and incorrect totals', async () => {
    const result = await deterministicWeeklyAssessmentGenerator.generate(input());
    expect(() => validateWeeklyAssessmentResult({ ...result, totalPoints: 19 })).toThrow('INVALID_WEEKLY_ASSESSMENT_TOTAL');
    expect(() => validateWeeklyAssessmentResult({ ...result, items: result.items.map(item => ({ ...item, sourceLessonPreparationIds: [] })) })).toThrow('INVALID_WEEKLY_ASSESSMENT_SCHEMA');
  });
  it('enforces lifecycle transitions and protects validated revisions', () => {
    expect(canTransitionWeeklyAssessment('draft', 'generating')).toBe(true); expect(canTransitionWeeklyAssessment('needs_review', 'teacher_validated')).toBe(true);
    expect(canTransitionWeeklyAssessment('teacher_validated', 'ready_to_print')).toBe(true); expect(canTransitionWeeklyAssessment('ready_to_print', 'needs_review')).toBe(false); expect(canTransitionWeeklyAssessment('archived', 'generating')).toBe(false);
  });
});
