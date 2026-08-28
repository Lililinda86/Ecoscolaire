import {
  Clock, FixtureBootstrapper, Logger, ManifestRecord, ManifestStore, RunLock,
} from '../src/prepare';
import { AuthInspector, AuthUserStatus, ResourceInspector } from '../src/inspect';
import { ALLOWED_CLEANUP_COLLECTIONS, AllowedCleanupCollection, CollectionDeleter, CounterCleaner, AuthCleaner, DeleteBatchRequest, DeleteBatchResult } from '../src/cleanup';
import { ResidualCounter } from '../src/verifyCleanup';
import { TransportReleaseManifest } from '../src/manifest';

export class FakeClock implements Clock {
  private current: Date;
  constructor(initial = new Date('2026-08-28T21:00:00.000Z')) {
    this.current = initial;
  }
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class RecordingLogger implements Logger {
  readonly entries: { message: string; fields?: Record<string, unknown> }[] = [];
  info(message: string, fields?: Record<string, unknown>): void {
    this.entries.push({ message, fields });
  }
}

export class FakeManifestStore implements ManifestStore {
  private readonly byTestRunId = new Map<string, ManifestRecord>();

  async get(testRunId: string): Promise<ManifestRecord | null> {
    return this.byTestRunId.get(testRunId) ?? null;
  }

  async create(record: ManifestRecord): Promise<void> {
    if (this.byTestRunId.has(record.manifest.testRunId)) {
      throw new Error(`Manifest already exists for ${record.manifest.testRunId}`);
    }
    this.byTestRunId.set(record.manifest.testRunId, record);
  }

  async update(testRunId: string, updater: (record: ManifestRecord) => ManifestRecord): Promise<ManifestRecord> {
    const current = this.byTestRunId.get(testRunId);
    if (!current) throw new Error(`No manifest to update for ${testRunId}`);
    const next = updater(current);
    this.byTestRunId.set(testRunId, next);
    return next;
  }
}

export class FakeRunLock implements RunLock {
  private readonly locked = new Set<string>();
  acquire(testRunId: string): boolean {
    if (this.locked.has(testRunId)) return false;
    this.locked.add(testRunId);
    return true;
  }
  release(testRunId: string): void {
    this.locked.delete(testRunId);
  }
}

interface FixtureDoc {
  readonly fixtureSchoolId: string;
  readonly testRunId: string;
  readonly testFixture: true;
}

/** Single in-memory backend shared by every fake port so tests can assert end-to-end behavior. */
export class FakeStagingBackend {
  readonly documents = new Map<AllowedCleanupCollection, Map<string, FixtureDoc>>(
    ALLOWED_CLEANUP_COLLECTIONS.map((collection) => [collection, new Map()]),
  );
  readonly authUsers = new Set<string>();
  /** Docs deliberately seeded outside any manifest's own identity, to be caught as orphans/violations. */
  readonly orphanFlags = new Set<string>();

  seedDocument(collection: AllowedCleanupCollection, documentId: string, fixtureSchoolId: string, testRunId: string): void {
    this.documents.get(collection)!.set(documentId, { fixtureSchoolId, testRunId, testFixture: true });
  }

  seedAuthUser(email: string): void {
    this.authUsers.add(email);
  }

  seedOrphan(collection: AllowedCleanupCollection, documentId: string, fixtureSchoolId: string, testRunId: string): void {
    this.seedDocument(collection, documentId, fixtureSchoolId, testRunId);
    this.orphanFlags.add(`${collection}/${documentId}`);
  }
}

export class FakeFixtureBootstrapper implements FixtureBootstrapper {
  failNextCreationsCount = 0;
  readonly calls: { manifest: TransportReleaseManifest; alreadyCreated: readonly string[] }[] = [];
  /** Structural (non-cleanup-tracked) resources actually created, keyed by resourceId. */
  readonly createdStructures = new Set<string>();

  constructor(private readonly backend: FakeStagingBackend) {}

  async createFixtureStructures(
    manifest: TransportReleaseManifest,
    alreadyCreated: readonly string[],
  ): Promise<{ createdResourceIds: readonly string[] }> {
    this.calls.push({ manifest, alreadyCreated });
    const remaining = manifest.expectedResourceIds.filter((id) => !alreadyCreated.includes(id));
    const toCreate = this.failNextCreationsCount > 0 ? remaining.slice(0, this.failNextCreationsCount) : remaining;
    // Bootstrapped "school" structures are tracked separately: they are not part of
    // ALLOWED_CLEANUP_COLLECTIONS, so they never collide with cleanup-test fixtures.
    for (const resourceId of toCreate) this.createdStructures.add(resourceId);
    if (this.failNextCreationsCount > 0 && toCreate.length < remaining.length) {
      this.failNextCreationsCount = 0;
      throw new Error('Simulated partial bootstrap failure');
    }
    return { createdResourceIds: toCreate };
  }
}

export class FakeResourceInspector implements ResourceInspector {
  constructor(private readonly backend: FakeStagingBackend) {}

  async countByCollection(fixtureSchoolId: string): Promise<Readonly<Record<string, number>>> {
    const counts: Record<string, number> = {};
    for (const collection of ALLOWED_CLEANUP_COLLECTIONS) {
      counts[collection] = [...this.backend.documents.get(collection)!.values()]
        .filter((doc) => doc.fixtureSchoolId === fixtureSchoolId).length;
    }
    return counts;
  }

  async findOwnershipViolations(fixtureSchoolId: string): Promise<readonly string[]> {
    const violations: string[] = [];
    for (const [collection, docs] of this.backend.documents) {
      for (const [documentId, doc] of docs) {
        if (doc.fixtureSchoolId === fixtureSchoolId && this.backend.orphanFlags.has(`${collection}/${documentId}`)) {
          violations.push(`${collection}/${documentId}`);
        }
      }
    }
    return violations;
  }
}

export class FakeAuthInspector implements AuthInspector {
  constructor(private readonly backend: FakeStagingBackend) {}
  async checkExistence(authUsers: readonly string[]): Promise<Readonly<Record<string, AuthUserStatus>>> {
    return Object.fromEntries(authUsers.map((email) => [email, this.backend.authUsers.has(email) ? 'present' : 'missing']));
  }
}

export class FakeCollectionDeleter implements CollectionDeleter {
  constructor(private readonly backend: FakeStagingBackend) {}
  async deleteBatch(request: DeleteBatchRequest): Promise<DeleteBatchResult> {
    const collectionDocs = this.backend.documents.get(request.collection)!;
    const matches = [...collectionDocs.entries()]
      .filter(([, doc]) => doc.fixtureSchoolId === request.fixtureSchoolId && doc.testRunId === request.testRunId && doc.testFixture === true)
      .slice(0, request.limit);
    for (const [documentId] of matches) collectionDocs.delete(documentId);
    const remaining = [...collectionDocs.values()]
      .some((doc) => doc.fixtureSchoolId === request.fixtureSchoolId && doc.testRunId === request.testRunId);
    return { deletedIds: matches.map(([documentId]) => documentId), done: !remaining };
  }
}

export class FakeCounterCleaner implements CounterCleaner {
  readonly resetCalls: (readonly string[])[] = [];
  async resetCounters(counterIds: readonly string[]): Promise<void> {
    this.resetCalls.push(counterIds);
  }
}

export class FakeAuthCleaner implements AuthCleaner {
  constructor(private readonly backend: FakeStagingBackend) {}
  async deleteFixtureUsers(authUsers: readonly string[]): Promise<{ deletedEmails: readonly string[] }> {
    const deleted = authUsers.filter((email) => this.backend.authUsers.delete(email));
    return { deletedEmails: deleted };
  }
}

export class FakeResidualCounter implements ResidualCounter {
  constructor(private readonly backend: FakeStagingBackend) {}

  async countResidualsByCollection(
    fixtureSchoolId: string,
    testRunId: string,
  ): Promise<Readonly<Record<AllowedCleanupCollection, number>>> {
    const counts = {} as Record<AllowedCleanupCollection, number>;
    for (const collection of ALLOWED_CLEANUP_COLLECTIONS) {
      counts[collection] = [...this.backend.documents.get(collection)!.values()]
        .filter((doc) => doc.fixtureSchoolId === fixtureSchoolId && doc.testRunId === testRunId).length;
    }
    return counts;
  }

  async countResidualAuthUsers(authUsers: readonly string[]): Promise<number> {
    return authUsers.filter((email) => this.backend.authUsers.has(email)).length;
  }

  async countOrphans(): Promise<number> {
    return this.backend.orphanFlags.size;
  }
}
