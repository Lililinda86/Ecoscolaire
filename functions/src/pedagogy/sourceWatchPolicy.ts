export const SOURCE_WATCH_MAX_BYTES = 2 * 1024 * 1024;
export const SOURCE_WATCH_TIMEOUT_MS = 15_000;
// CEDUC identity/access rights are not established; do not silently authorize
// a guessed domain. MINESUP has no demonstrated applicable category here.
export const SOURCE_WATCH_HOSTS = new Set(['minedub.cm', 'www.minedub.cm', 'minesec.gov.cm', 'www.minesec.gov.cm', 'files.minesec.gov.cm']);
export const SYNTHETIC_WATCH_URL = 'https://raw.githubusercontent.com/Lililinda86/Ecoscolaire/staging/tests/fixtures/pedagogy-watch-source.txt';

// An allowlisted host authorizes a bounded public fetch, not a claim of official
// provenance, redistribution rights, completeness or pedagogical approval.
export function sourceWatchUrl(raw: unknown, syntheticStaging: boolean): string {
  if (typeof raw !== 'string' || raw.length > 2000) throw new Error('SOURCE_URL_INVALID');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('SOURCE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.search || url.hash) throw new Error('SOURCE_URL_UNSAFE');
  if (!SOURCE_WATCH_HOSTS.has(url.hostname) && !(syntheticStaging && url.href === SYNTHETIC_WATCH_URL)) throw new Error('SOURCE_HOST_NOT_AUTHORIZED');
  return url.href;
}

export function sourceWatchInterval(raw: unknown, syntheticStaging: boolean): number {
  if (!Number.isInteger(raw) || Number(raw) < (syntheticStaging ? 15 : 360) || Number(raw) > 10080) throw new Error('SOURCE_INTERVAL_INVALID');
  return Number(raw);
}

export function sourceWatchChange(previousHash: string | null, nextHash: string): 'baseline' | 'unchanged' | 'file_changed' {
  if (!/^[a-f0-9]{64}$/.test(nextHash) || previousHash !== null && !/^[a-f0-9]{64}$/.test(previousHash)) throw new Error('SOURCE_HASH_INVALID');
  return !previousHash ? 'baseline' : previousHash === nextHash ? 'unchanged' : 'file_changed';
}
