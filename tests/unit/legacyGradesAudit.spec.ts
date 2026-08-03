import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('legacy grades audit script', () => {
  it('should correctly parse synthetic fixture and output JSON', () => {
    const scriptPath = path.resolve(__dirname, '../../scripts/audit-legacy-grades.mjs');
    const fixturePath = path.resolve(__dirname, '../fixtures/legacy-grades.synthetic.json');
    const out = execSync(`node "${scriptPath}" --input "${fixturePath}"`).toString();
    const result = JSON.parse(out);
    expect(result.total).toBe(3);
    expect(result.migratable).toBe(0);
    expect(result.nonMigratable).toBe(3);
  });
});
