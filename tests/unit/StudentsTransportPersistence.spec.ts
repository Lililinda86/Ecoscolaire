import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/pages/Students.tsx', 'utf8');

describe('Students transport persistence contract', () => {
  it('edits the public enrollment flag and all private transport fields', () => {
    expect(source).toContain('usesTransport: finalStudent.usesTransport === true');
    expect(source).toContain('transportStatus: finalStudent.transportStatus');
    expect(source).toContain('transportZonePk: finalStudent.transportZonePk');
    expect(source).toContain("transportNeighborhood: finalStudent.transportNeighborhood ?? ''");
    expect(source).toContain("transportPickupPoint: finalStudent.transportPickupPoint ?? ''");
  });

  it('keeps stable inputs and a read-only summary without displaying a tariff', () => {
    expect(source).toContain('data-testid="student-transport-zone-pk"');
    expect(source).toContain('data-testid="student-transport-neighborhood"');
    expect(source).toContain('data-testid="student-transport-pickup-point"');
    expect(source).toContain('data-testid="student-transport-summary"');
    expect(source).toContain('Statut Transport :');
    const summary = source.slice(
      source.indexOf('data-testid="student-transport-summary"'),
      source.indexOf('{/* Récapitulatif compact */}')
    );
    expect(summary).not.toMatch(/FCFA|tarif/i);
  });

  it('uses the same separated-data contract for create and edit', () => {
    expect(source).toContain('splitStudentData({');
    expect(source).toContain('updateStudentSeparatedData({');
    expect(source).toContain('privateData: privateData as unknown as Record<string, unknown>');
  });
});
