import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
vi.mock('../../functions/src/pedagogy/aiPrivateClient', () => ({ requestPrivatePedagogyAi: transport }));
import { approvedAssessmentEnvelope, approvedAssessmentLessons, assertApprovedSyntheticEnvelope } from '../../functions/src/pedagogy/approvedSyntheticRequests';
import { generateAssessmentContent } from '../../functions/src/pedagogy/aiAssessment';
import { analyzeSyntheticPreparation } from '../../functions/src/pedagogy/aiPreparation';
import { defaultPedagogyPolicy } from '../../functions/src/pedagogy/pedagogyPolicy';
describe('exact synthetic envelope allowlist (no provider calls)', () => {
  beforeEach(() => { transport.mockReset().mockRejectedValue(new Error('SIMULATED_STOP_BEFORE_NETWORK')); });
  it.each(approvedAssessmentLessons.map((lesson, index) => ({ lesson, index })))('accepts the actual assessment builder for fixture $index', async ({ lesson }) => {
    const [language, cycle, title, content] = lesson;
    const input = { validatedPreparations: [{ id: 'source', version: 1, subjectId: 'math', classSubjectId: 'class-math', subjectName: language === 'en' ? 'Mathematics' : 'Mathematiques', pedagogicalContent: `${title}\n${content}\n${content}` }], assessmentPolicy: { ...defaultPedagogyPolicy({ cycle, section: language === 'en' ? 'anglophone' : 'francophone' }), configured: false } } as unknown as Parameters<typeof generateAssessmentContent>[1];
    await expect(generateAssessmentContent('pedagogy-ai-validation-20260906', input, language)).rejects.toThrow('SIMULATED_STOP_BEFORE_NETWORK');
    expect(() => assertApprovedSyntheticEnvelope(transport.mock.calls[0][1])).not.toThrow();
  });
  it('accepts the actual preparation builder without allowing arbitrary accompanying text', async () => {
    const bytes = readFileSync(new URL('../fixtures/synthetic-pedagogy-ai/pre-fr.pdf', import.meta.url));
    await expect(analyzeSyntheticPreparation('pedagogy-ai-validation-20260906', 'upload', 'checksum', bytes, 'application/pdf')).rejects.toThrow('SIMULATED_STOP_BEFORE_NETWORK');
    const request = transport.mock.calls[0][1];
    expect(() => assertApprovedSyntheticEnvelope(request)).not.toThrow();
    expect(() => assertApprovedSyntheticEnvelope({ ...request, content: request.content + ' extra record' })).toThrow('AI_SYNTHETIC_ENVELOPE_NOT_APPROVED');
  });
  it.each(['instructions', 'content', 'schema'] as const)('blocks an extra record through %s', field => {
    const request = approvedAssessmentEnvelope(0, 'unit');
    const value = field === 'schema' ? { ...request.schema, description: 'unapproved record' } : request[field] + ' unapproved record';
    expect(() => assertApprovedSyntheticEnvelope({ ...request, [field]: value })).toThrow('AI_SYNTHETIC_ENVELOPE_NOT_APPROVED');
  });
  it('rejects changed policy and unexpected top-level fields', () => {
    const request = approvedAssessmentEnvelope(0, 'unit');
    const body = JSON.parse(request.content); body.policy.totalPoints = 100;
    expect(() => assertApprovedSyntheticEnvelope({ ...request, content: JSON.stringify(body) })).toThrow('AI_SYNTHETIC_ENVELOPE_NOT_APPROVED');
    expect(() => assertApprovedSyntheticEnvelope(Object.assign({}, request, { pupilRecord: 'unapproved' }))).toThrow('AI_SYNTHETIC_ENVELOPE_NOT_APPROVED');
  });
});
