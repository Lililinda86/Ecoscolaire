import { describe, expect, it } from 'vitest';
import { originalTemplates, templateText } from '../../src/features/pedagogy/resources/originalTemplates';

describe('original resources provenance and coverage', () => {
  it('provides eight unique integrated templates covering both languages and four cycles', () => {
    expect(originalTemplates).toHaveLength(8);
    expect(new Set(originalTemplates.map(item => item.id)).size).toBe(8);
    for (const cycle of ['pre_nursery', 'nursery', 'primary', 'secondary']) {
      expect(originalTemplates.filter(item => item.cycle === cycle).map(item => item.language).sort()).toEqual(['en', 'fr']);
    }
  });
  for (const item of originalTemplates) it(item.id + ' exports actual content with honest provenance and pending review', () => {
    expect(item.sourceKind).toBe('original_assistant_draft');
    expect(item.reviewStatus).toBe('pending');
    expect(item.officialCurriculumId).toBeNull();
    expect(item.steps.length).toBeGreaterThanOrEqual(3);
    const text = templateText(item);
    expect(text).toContain(item.id);
    expect(text).toContain(item.observation);
    expect(text).toContain(item.safety);
    expect(text).toContain(item.language === 'en' ? 'NOT AN OFFICIAL CURRICULUM' : 'PAS UN PROGRAMME OFFICIEL');
    expect(text).toContain(item.language === 'en' ? 'No lesson has been taught or approved' : 'ni un cours enseigné ni une validation pédagogique');
  });
});
