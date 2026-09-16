import { createHash } from 'node:crypto';
import { DocumentaryRelation } from './subjectMappingEngine';

/** Complete, immutable source-evidence snapshot, NOT a set of human approvals.
 * A later choice of one local subject must never discard sibling components.
 */
export function documentaryEvidenceSnapshot(relations: DocumentaryRelation[], sourceVersion: string, mappingVersion: string) {
  const bySubject = new Map<string, DocumentaryRelation>();
  for (const relation of relations) {
    const normalized = { ...relation, pdfPages: [...new Set(relation.pdfPages)].sort((a, b) => a - b) };
    const previous = bySubject.get(relation.subjectId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalized)) throw new Error('Conflicting documentary evidence for same subject');
    bySubject.set(relation.subjectId, normalized);
  }
  const stable = [...bySubject.values()].sort((a, b) => a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0);
  const snapshotVersion = createHash('sha256').update(JSON.stringify([sourceVersion, mappingVersion, stable])).digest('hex');
  return { scope: 'SOURCE_EVIDENCE_ONLY_NOT_HUMAN_DECISION', sourceVersion, mappingVersion, snapshotVersion, relations: stable };
}
