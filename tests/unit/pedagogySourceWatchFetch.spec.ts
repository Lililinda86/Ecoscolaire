import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { fingerprintPublicSource } from '../../functions/src/pedagogy/sourceWatchFetch';
import { SOURCE_WATCH_MAX_BYTES } from '../../functions/src/pedagogy/sourceWatchPolicy';

const url = 'https://www.minesec.gov.cm/';
describe('public source fingerprint boundary (local HTTP fixtures, not a real integration)', () => {
  it('hashes actual bytes and returns metadata without retaining the document body', async () => {
    const fetcher = vi.fn(async () => new Response('original synthetic text', { headers: { 'content-type': 'text/plain', etag: '"v1"' } }));
    const result = await fingerprintPublicSource(url, false, fetcher);
    expect(result.sha256).toBe(createHash('sha256').update('original synthetic text').digest('hex'));
    expect(result.bytes).toBe(23);
    expect(Object.keys(result).sort()).toEqual(['bytes', 'etag', 'finalUrl', 'lastModified', 'mimeType', 'sha256']);
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
  it('does not follow a redirect outside the exact host allowlist', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }));
    await expect(fingerprintPublicSource(url, false, fetcher)).rejects.toThrow('SOURCE_HOST_NOT_AUTHORIZED');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds redirect chains even within authorized hosts', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));
    await expect(fingerprintPublicSource(url, false, fetcher)).rejects.toThrow('SOURCE_REDIRECT_LIMIT');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('does not call an inaccessible or empty source up to date', async () => {
    await expect(fingerprintPublicSource(url, false, async () => new Response('', { status: 404 }))).rejects.toThrow('SOURCE_HTTP_404');
    await expect(fingerprintPublicSource(url, false, async () => new Response('', { headers: { 'content-type': 'text/plain' } }))).rejects.toThrow('SOURCE_EMPTY');
  });
  it('enforces actual decoded byte limits even when the declared size is small', async () => {
    await expect(fingerprintPublicSource(url, false, async () => new Response(new Uint8Array(SOURCE_WATCH_MAX_BYTES + 1), { headers: { 'content-type': 'application/pdf', 'content-length': '1' } }))).rejects.toThrow('SOURCE_TOO_LARGE');
  });
  it('rejects unsupported content and sanitizes network exception details', async () => {
    await expect(fingerprintPublicSource(url, false, async () => new Response('data', { headers: { 'content-type': 'application/json' } }))).rejects.toThrow('SOURCE_CONTENT_TYPE_UNSUPPORTED');
    await expect(fingerprintPublicSource(url, false, async () => { throw new Error('Do not expose private transport internals'); })).rejects.toThrow('SOURCE_UNAVAILABLE');
  });
});
