// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type {
  Aggregate,
  Actor,
  EventSpec,
  StoredEvent,
  MapMeta,
} from "./types.js";
import type { resolveChange } from "./git-adapter.js";
import type { buildReceipt } from "./receipt.js";
declare function stateRoot(
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string;
declare function writeAtomic(filename: string, value: unknown): void;
declare function eventHash(
  event: object & {
    eventHash?: string;
  },
): string;
declare function makeEvent({
  mapId,
  sequence,
  eventType,
  payload,
  actor,
  changeRevisionId,
  expectedAggregateRevision,
  previousEventHash,
  occurredAt,
}: EventSpec & {
  mapId: string;
  sequence: number;
  actor: Actor;
  expectedAggregateRevision: number;
  previousEventHash?: string | null;
}): StoredEvent;
export interface StoreOptions {
  root?: string;
  hostname?: string;
}
interface WriterLock {
  filename: string;
  token: string;
}
declare class FileReviewMapStore {
  readonly root: string;
  readonly hostname: string;
  constructor(options?: StoreOptions);
  repositoryDir(repositoryKey: string): string;
  mapDir(repositoryKey: string, mapId: string): string;
  indexPath(repositoryKey: string): string;
  readIndex(repositoryKey: string): {
    schemaVersion: number;
    maps: MapMeta[];
  };
  rebuildIndex(repositoryKey: string): {
    schemaVersion: number;
    maps: MapMeta[];
  };
  updateIndex(repositoryKey: string, meta: MapMeta): void;
  find(repositoryKey: string, manifestDigest: string): MapMeta | null;
  related(repositoryKey: string): MapMeta | null;
  acquireLock(directory: string, mapId: string): WriterLock;
  releaseLock(lock: WriterLock): void;
  create({
    identity,
    title,
    actor,
  }: {
    identity: ReturnType<typeof resolveChange>;
    title?: string;
    actor: Actor;
  }): Aggregate;
  eventFiles(directory: string): string[];
  load(repositoryKey: string, mapId: string): Aggregate;
  writeMeta(repositoryKey: string, state: Aggregate): void;
  mutate(
    repositoryKey: string,
    mapId: string,
    expectedRevision: number,
    actor: Actor,
    buildEvents: (state: Aggregate) => EventSpec[],
  ): {
    state: Aggregate;
    emittedEventIds: string[];
  };
  writeReceipt(
    repositoryKey: string,
    mapId: string,
    receipt: ReturnType<typeof buildReceipt>,
  ): string;
  writeReceiptMarkdown(
    repositoryKey: string,
    mapId: string,
    receiptId: string,
    markdown: string,
  ): string;
  storeEvidenceBlob(
    repositoryKey: string,
    mapId: string,
    bytes: Buffer,
  ): {
    digest: string;
    size: number;
  };
  inspect(
    repositoryKey: string,
    mapId: string,
  ): {
    stateRoot: string;
    mapDirectory: string;
  };
  delete(repositoryKey: string, mapId: string): void;
}
export { FileReviewMapStore, stateRoot, writeAtomic, makeEvent, eventHash };
