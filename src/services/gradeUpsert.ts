import type { Grade } from '../types';

export function upsertGradeInCache(cache: Grade[], newGrade: Grade): void {
  const existingGradeIndex = cache.findIndex(g => g.id === newGrade.id);
  if (existingGradeIndex >= 0) {
    const existing = cache[existingGradeIndex];
    newGrade.version = (existing.version || 1) + 1;
    newGrade.createdAt = existing.createdAt || newGrade.createdAt;
    newGrade.createdBy = existing.createdBy || newGrade.createdBy;
    cache[existingGradeIndex] = newGrade;
  } else {
    newGrade.version = 1;
    cache.push(newGrade);
  }
}
