import { describe, expect, it } from 'vitest';
import { sourceWatchUrl, sourceWatchInterval, sourceWatchChange, SYNTHETIC_WATCH_URL } from '../../functions/src/pedagogy/sourceWatchPolicy';

describe('bounded source-watch policy', () => {
  it.each(['https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels', 'https://www.minedub.cm/'])('allows an explicitly listed public host without claiming authenticity: %s', url => {
    expect(sourceWatchUrl(url, false)).toBe(url);
  });
  it.each(['http://www.minesec.gov.cm/', 'https://user:password@www.minesec.gov.cm/', 'https://www.minesec.gov.cm:8443/', 'https://www.minesec.gov.cm/?token=private', 'https://www.minesec.gov.cm/#fragment', 'https://localhost/', 'https://127.0.0.1/', 'https://[::1]/', 'https://www.minesec.gov.cm.attacker.invalid/', 'file:///etc/passwd', 'invalid'])('rejects unsafe/unauthorized source: %s', url => {
    expect(() => sourceWatchUrl(url, false)).toThrow();
  });
  it('restricts the original controlled-change fixture to explicit synthetic Staging', () => {
    expect(() => sourceWatchUrl('https://www.ceduc.cm/', false)).toThrow('SOURCE_HOST_NOT_AUTHORIZED');
    expect(() => sourceWatchUrl(SYNTHETIC_WATCH_URL, false)).toThrow();
    expect(sourceWatchUrl(SYNTHETIC_WATCH_URL, true)).toBe(SYNTHETIC_WATCH_URL);
    expect(() => sourceWatchUrl(SYNTHETIC_WATCH_URL.replace('/staging/', '/main/'), true)).toThrow();
  });
  it('bounds cost and frequency while permitting the synthetic scheduled test', () => {
    expect(sourceWatchInterval(1440, false)).toBe(1440);
    expect(sourceWatchInterval(15, true)).toBe(15);
    for (const value of [0, 15, 359, 10081, 360.5, '360']) expect(() => sourceWatchInterval(value, false)).toThrow();
  });
  it('distinguishes file changes from pedagogical changes and never invents a valid hash', () => {
    expect(sourceWatchChange(null, 'a'.repeat(64))).toBe('baseline');
    expect(sourceWatchChange('a'.repeat(64), 'a'.repeat(64))).toBe('unchanged');
    expect(sourceWatchChange('a'.repeat(64), 'b'.repeat(64))).toBe('file_changed');
    expect(() => sourceWatchChange(null, '')).toThrow();
    expect(() => sourceWatchChange('corrupt', 'a'.repeat(64))).toThrow();
  });
});
