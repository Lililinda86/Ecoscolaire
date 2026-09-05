import { describe, expect, it } from 'vitest';
import { deterministicMockPreparationAnalyzer, validatePreparationAnalysis } from '../../functions/src/pedagogy/preparationAnalyzer';
import { canTransitionPreparation, preparationIdForItem, uploadIdForChecksum } from '../../functions/src/pedagogy/preparations';

describe('Lot B preparation domain', () => {
  it('derives stable identities from a Lot A item and a checksum', () => {
    const id = preparationIdForItem('school__year__class__math__d1__s2');
    expect(id).toMatch(/^prep__school__year__class__math__d1__s__[a-f0-9]{16}$/);
    expect(uploadIdForChecksum('prep__item', 'a'.repeat(64))).toBe(`upload__prep__item__${'a'.repeat(24)}`);
  });

  it('allows only the explicit lifecycle', () => {
    expect(canTransitionPreparation('expected', 'uploaded')).toBe(true);
    expect(canTransitionPreparation('uploaded', 'needs_review')).toBe(true);
    expect(canTransitionPreparation('needs_review', 'validated')).toBe(true);
    expect(canTransitionPreparation('validated', 'uploaded')).toBe(false);
    expect(canTransitionPreparation('expected', 'validated')).toBe(false);
  });

  it('keeps absent source values null in deterministic analysis', async () => {
    const result = await deterministicMockPreparationAnalyzer.analyze({
      preparationId: 'prep', uploadId: 'upload', fileName: 'lesson.pdf', mimeType: 'application/pdf',
      lessonTitle: null, subjectName: 'Mathématiques', objective: null
    });
    expect(result.lessonTitle).toBeNull();
    expect(result.objective).toBeNull();
    expect(result.lessonSteps).toEqual([]);
    expect(result.warnings[0]).toContain('champs absents');
  });

  it('has a deterministic failure hook for fallback coverage', async () => {
    await expect(deterministicMockPreparationAnalyzer.analyze({
      preparationId: 'prep', uploadId: 'upload', fileName: 'analysis-fail.png', mimeType: 'image/png',
      lessonTitle: 'Nombres', subjectName: 'Mathématiques', objective: 'Comparer'
    })).rejects.toThrow('MOCK_ANALYSIS_FAILURE');
  });

  it('rejects invented or malformed analysis schemas', () => {
    expect(() => validatePreparationAnalysis({ schemaVersion: 'unknown' })).toThrow('INVALID_ANALYSIS_SCHEMA');
    expect(() => validatePreparationAnalysis({
      schemaVersion: 'preparation-analysis-v1', lessonTitle: null, subjectName: null, objective: null,
      prerequisites: [], materials: [], lessonSteps: [{ title: 'Étape', durationMinutes: 0, description: null }],
      assessment: null, differentiation: null, warnings: [], confidence: 2
    })).toThrow('INVALID_ANALYSIS_SCHEMA');
  });

  it('accepts a bounded structured analysis', () => {
    expect(validatePreparationAnalysis({
      schemaVersion: 'preparation-analysis-v1', lessonTitle: 'Lire', subjectName: 'Français', objective: null,
      prerequisites: [], materials: ['Ardoise'], lessonSteps: [{ title: 'Découverte', durationMinutes: 15, description: null }],
      assessment: null, differentiation: null, warnings: [], confidence: 0.8
    }).lessonSteps[0].durationMinutes).toBe(15);
  });
});
