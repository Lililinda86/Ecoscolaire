import { createHash } from 'node:crypto';
import { SOURCE_WATCH_MAX_BYTES, SOURCE_WATCH_TIMEOUT_MS, sourceWatchUrl } from './sourceWatchPolicy';

export interface PublicSourceFingerprint {
  finalUrl: string; sha256: string; bytes: number; mimeType: string;
  etag: string | null; lastModified: string | null;
}

// Read public bytes transiently to fingerprint them; never persist the source
// body or treat a successful fetch as authentication or redistribution rights.
export async function fingerprintPublicSource(rawUrl: string, syntheticStaging: boolean, fetcher: typeof fetch = fetch): Promise<PublicSourceFingerprint> {
  let url = sourceWatchUrl(rawUrl, syntheticStaging);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_WATCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: controller.signal,
        credentials: 'omit', headers: { accept: 'text/html, application/pdf, text/plain, application/xhtml+xml', 'user-agent': 'Ecoscolaire-SourceWatch/1' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('SOURCE_REDIRECT_LIMIT');
        url = sourceWatchUrl(new URL(location, url).href, syntheticStaging);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('SOURCE_HTTP_' + response.status); }
      const length = Number(response.headers.get('content-length') || 0);
      if (length > SOURCE_WATCH_MAX_BYTES) { await response.body?.cancel(); throw new Error('SOURCE_TOO_LARGE'); }
      const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['text/html', 'text/plain', 'application/pdf', 'application/xhtml+xml', 'application/octet-stream'].includes(mimeType)) {
        await response.body?.cancel(); throw new Error('SOURCE_CONTENT_TYPE_UNSUPPORTED');
      }
      if (!response.body) throw new Error('SOURCE_EMPTY');
      const reader = response.body.getReader(), hash = createHash('sha256');
      let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > SOURCE_WATCH_MAX_BYTES) { controller.abort(); await reader.cancel().catch(() => {}); throw new Error('SOURCE_TOO_LARGE'); }
        hash.update(part.value);
      }
      if (!bytes) throw new Error('SOURCE_EMPTY');
      const modified = response.headers.get('last-modified');
      return { finalUrl: url, sha256: hash.digest('hex'), bytes, mimeType,
        etag: response.headers.get('etag')?.slice(0, 256) || null,
        lastModified: modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : null };
    }
    throw new Error('SOURCE_REDIRECT_LIMIT');
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof Error && error.message === 'SOURCE_TOO_LARGE')) throw new Error('SOURCE_TIMEOUT');
    if (error instanceof Error && /^SOURCE_[A-Z0-9_]+$/.test(error.message)) throw error;
    throw new Error('SOURCE_UNAVAILABLE');
  } finally { clearTimeout(timer); }
}
