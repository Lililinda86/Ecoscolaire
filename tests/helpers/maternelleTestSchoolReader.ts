import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ClassOptionLabelItem } from '../../src/utils/classCatalog';

// Only the already-authenticated TEST owner's normal Firestore permissions.
// No Admin SDK, service account, custom token, or cross-school read.
type Value = { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean; mapValue?: { fields?: Record<string, Value> }; arrayValue?: { values?: Value[] } };
type Document = { name: string; updateTime: string; fields?: Record<string, Value> };
type QueryResponse = { document?: Document }[];
export type LabelClass = ClassOptionLabelItem & { isActive?: boolean };
export type Fees = Record<string, Record<string, number>>;
const base = 'https://firestore.googleapis.com/v1/projects/ecoscolaire-staging/databases/(default)/documents';
const decode = (value: Value): unknown => {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, item]) => [key, decode(item)]));
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decode);
  return null;
};
const fields = (doc: Document) => Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, decode(value)]));
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
export const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export async function createTestSchoolReader(idToken: string, uid: string) {
  assert.ok(idToken && uid && !uid.includes('/'), 'Authenticated TEST identity required');
  async function get(path: string, fieldMask: string[]) {
    const params = new URLSearchParams(fieldMask.map(field => ['mask.fieldPaths', field]));
    const response = await fetch(`${base}/${path}?${params}`, { headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `TEST read denied: HTTP ${response.status}`);
    return response.json() as Promise<Document>;
  }
  const profile = fields(await get(`users/${encodeURIComponent(uid)}`, ['schoolId', 'role', 'email']));
  assert.equal(profile.role, 'owner');
  assert.equal(profile.email, 'owner.alpha@ecoscolaire.com');
  assert.ok(typeof profile.schoolId === 'string' && profile.schoolId && !profile.schoolId.includes('/'), 'TEST school required');
  const schoolId = profile.schoolId;

  async function query(collection: 'classes' | 'students' | 'payments', fieldMask: string[]) {
    const response = await fetch(`${base}:runQuery`, {
      method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: collection }],
        select: { fields: fieldMask.map(fieldPath => ({ fieldPath })) },
        where: { fieldFilter: { field: { fieldPath: 'schoolId' }, op: 'EQUAL', value: { stringValue: schoolId } } },
      } }), signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `TEST scoped query denied: HTTP ${response.status}`);
    return ((await response.json()) as QueryResponse).flatMap(item => item.document ? [item.document] : []);
  }
  return {
    async classes(): Promise<LabelClass[]> {
      const docs = await query('classes', ['name', 'schoolId', 'section', 'type', 'language', 'level', 'campus', 'site', 'isActive']);
      return docs.map(doc => ({ ...fields(doc), id: doc.name.split('/').at(-1)! }) as LabelClass);
    },
    async fees(): Promise<Fees> {
      return (fields(await get(`schools/${encodeURIComponent(schoolId)}`, ['classFees'])).classFees || {}) as Fees;
    },
    async snapshot() {
      // Only document identities + update timestamps, never student/payment fields.
      const entries = await Promise.all((['classes', 'students', 'payments'] as const).map(async collection => {
        const docs = await query(collection, ['__name__']);
        return [collection, { count: docs.length, hash: fingerprint(docs.map(doc => [doc.name, doc.updateTime]).sort()) }];
      }));
      const feeData = fields(await get(`schools/${encodeURIComponent(schoolId)}`, ['classFees'])).classFees || {};
      return { scope: 'existing-alpha-test-school', ...Object.fromEntries(entries), classFeesHash: fingerprint(feeData) };
    },
  };
}
