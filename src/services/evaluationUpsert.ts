import type { Evaluation } from '../types';

export function upsertEvaluationInCache(cache: Evaluation[], newEvaluation: Evaluation): void {
  const existingIndex = cache.findIndex(e => e.id === newEvaluation.id);
  if (existingIndex >= 0) {
    const existing = cache[existingIndex];
    newEvaluation.version = (existing.version || 1) + 1;
    newEvaluation.createdAt = existing.createdAt || newEvaluation.createdAt;
    newEvaluation.createdBy = existing.createdBy || newEvaluation.createdBy;
    cache[existingIndex] = newEvaluation;
  } else {
    newEvaluation.version = 1;
    cache.push(newEvaluation);
  }
}
