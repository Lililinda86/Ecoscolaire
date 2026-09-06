export interface PreparationAnalysisInput {
  preparationId: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  lessonTitle: string | null;
  subjectName: string | null;
  objective: string | null;
}

export interface PreparationAnalysisResult {
  schemaVersion: 'preparation-analysis-v1';
  lessonTitle: string | null;
  subjectName: string | null;
  objective: string | null;
  prerequisites: string[];
  materials: string[];
  lessonSteps: Array<{ title: string; durationMinutes: number | null; description: string | null }>;
  assessment: string | null;
  differentiation: string | null;
  warnings: string[];
  confidence: number;
}

export interface PreparationAnalyzer {
  readonly version: string;
  analyze(input: PreparationAnalysisInput): Promise<PreparationAnalysisResult>;
}

const nullableText = (value: unknown, max = 1000): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw new Error('INVALID_ANALYSIS_SCHEMA');
  const trimmed = value.trim();
  return trimmed || null;
};

export const validatePreparationAnalysis = (value: unknown): PreparationAnalysisResult => {
  if (!value || typeof value !== 'object') throw new Error('INVALID_ANALYSIS_SCHEMA');
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 'preparation-analysis-v1') throw new Error('INVALID_ANALYSIS_SCHEMA');
  if (!Array.isArray(raw.prerequisites) || !Array.isArray(raw.materials) || !Array.isArray(raw.lessonSteps) || !Array.isArray(raw.warnings)) throw new Error('INVALID_ANALYSIS_SCHEMA');
  if (raw.prerequisites.length > 30 || raw.materials.length > 30 || raw.warnings.length > 30 || raw.lessonSteps.length > 20) throw new Error('INVALID_ANALYSIS_SCHEMA');
  const stringList = (items: unknown[], max: number): string[] => items.map(item => {
    if (typeof item !== 'string' || !item.trim() || item.length > max) throw new Error('INVALID_ANALYSIS_SCHEMA');
    return item.trim();
  }).slice(0, 30);
  const steps = raw.lessonSteps.slice(0, 20).map(item => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_ANALYSIS_SCHEMA');
    const step = item as Record<string, unknown>;
    const duration = step.durationMinutes;
    if (duration !== null && duration !== undefined && (!Number.isInteger(duration) || (duration as number) < 1 || (duration as number) > 600)) throw new Error('INVALID_ANALYSIS_SCHEMA');
    const title = nullableText(step.title, 150);
    if (!title) throw new Error('INVALID_ANALYSIS_SCHEMA');
    return { title, durationMinutes: duration === null || duration === undefined ? null : duration as number, description: nullableText(step.description, 1000) };
  });
  if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) throw new Error('INVALID_ANALYSIS_SCHEMA');
  return {
    schemaVersion: 'preparation-analysis-v1',
    lessonTitle: nullableText(raw.lessonTitle, 500),
    subjectName: nullableText(raw.subjectName, 200),
    objective: nullableText(raw.objective, 1000),
    prerequisites: stringList(raw.prerequisites, 300),
    materials: stringList(raw.materials, 300),
    lessonSteps: steps,
    assessment: nullableText(raw.assessment, 1000),
    differentiation: nullableText(raw.differentiation, 1000),
    warnings: stringList(raw.warnings, 300),
    confidence: raw.confidence
  };
};

export const deterministicMockPreparationAnalyzer: PreparationAnalyzer = {
  version: 'mock-preparation-analyzer-v1',
  async analyze(input) {
    if (input.fileName.toLowerCase().includes('analysis-fail')) throw new Error('MOCK_ANALYSIS_FAILURE');
    return validatePreparationAnalysis({
      schemaVersion: 'preparation-analysis-v1',
      lessonTitle: input.lessonTitle,
      subjectName: input.subjectName,
      objective: input.objective,
      prerequisites: [],
      materials: [],
      lessonSteps: [],
      assessment: null,
      differentiation: null,
      warnings: ['Analyse de démonstration : les champs absents restent vides et doivent être vérifiés.'],
      confidence: 0.55
    });
  }
};
