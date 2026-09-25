import type {
  Aggregate,
  Actor,
  EventSpec,
  StoredEvent,
  MapMeta,
} from "./types.js";
import type { resolveChange } from "./git-adapter.js";
import type { buildReceipt } from "./receipt.js";
import { errorFields, isRecord } from "../input.js";
import { readMeta } from "./readers.js";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { canonicalize, digest, id } from "./canonical.js";
import { ReviewMapError, invariant } from "./errors.js";
import {
  replay,
  currentRevision,
  applyEvent,
  SCHEMA_VERSION,
  PRODUCER_VERSION,
} from "./domain.js";
import {
  validateEvent,
  validateSnapshot,
  validateReceipt,
} from "./validation.js";

function stateRoot(env = process.env, platform = process.platform) {
  if (env.KANKO_STATE_DIR) return path.resolve(env.KANKO_STATE_DIR);
  if (platform === "win32")
    return path.join(
      env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "kanko",
    );
  if (platform === "darwin")
    return path.join(os.homedir(), "Library", "Application Support", "kanko");
  return path.join(
    env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
    "kanko",
  );
}

function mkdir(directory: string) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
}
function readJson(filename: string): unknown {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function writeAtomic(filename: string, value: unknown) {
  mkdir(path.dirname(filename));
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  const handle = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(handle, `${canonicalize(value)}\n`);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, filename);
  try {
    const dir = fs.openSync(path.dirname(filename), "r");
    try {
      fs.fsyncSync(dir);
    } finally {
      fs.closeSync(dir);
    }
  } catch {
    /* directory fsync is unavailable on some platforms */
  }
}

function eventHash(event: object & { eventHash?: string }) {
  const { eventHash: ignored, ...unsigned } = event;
  void ignored;
  return digest(unsigned);
}

function makeEvent({
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
}): StoredEvent {
  const event = {
    schemaVersion: SCHEMA_VERSION,
    mapId,
    sequence,
    eventId: id("evt"),
    eventType,
    occurredAt: occurredAt || new Date().toISOString(),
    actor,
    changeRevisionId: changeRevisionId || null,
    expectedAggregateRevision,
    payload,
    previousEventHash: previousEventHash || null,
  };
  const stored = { ...event, eventHash: eventHash(event) };
  validateEvent(stored);
  return stored;
}

function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorFields(error).code === "EPERM";
  }
}

export interface StoreOptions {
  root?: string;
  hostname?: string;
}
interface WriterLock {
  filename: string;
  token: string;
}

class FileReviewMapStore {
  readonly root: string;
  readonly hostname: string;
  constructor(options: StoreOptions = {}) {
    this.root = options.root || stateRoot();
    this.hostname = options.hostname || os.hostname();
    mkdir(this.root);
  }
  repositoryDir(repositoryKey: string) {
    invariant(
      /^[0-9a-f]{64}$/.test(repositoryKey),
      "invalid_repository_key",
      "invalid repository key",
    );
    return path.join(this.root, "repositories", repositoryKey);
  }
  mapDir(repositoryKey: string, mapId: string) {
    invariant(
      /^map_[0-9a-f-]+$/.test(mapId),
      "invalid_map_id",
      "invalid map ID",
    );
    return path.join(this.repositoryDir(repositoryKey), "maps", mapId);
  }
  indexPath(repositoryKey: string) {
    return path.join(this.repositoryDir(repositoryKey), "index.json");
  }

  readIndex(repositoryKey: string) {
    try {
      const index = readJson(this.indexPath(repositoryKey));
      return isRecord(index) && Array.isArray(index.maps)
        ? { schemaVersion: SCHEMA_VERSION, maps: index.maps.map(readMeta) }
        : { schemaVersion: SCHEMA_VERSION, maps: [] };
    } catch (error) {
      if (
        errorFields(error).code !== "ENOENT" &&
        !(error instanceof SyntaxError)
      )
        throw error;
      return this.rebuildIndex(repositoryKey);
    }
  }

  rebuildIndex(repositoryKey: string) {
    const root = path.join(this.repositoryDir(repositoryKey), "maps");
    const maps = [];
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        try {
          maps.push(
            readMeta(readJson(path.join(root, entry.name, "meta.json"))),
          );
        } catch {
          /* a broken map is omitted, not erased */
        }
      }
    } catch (error) {
      if (errorFields(error).code !== "ENOENT") throw error;
    }
    const index = {
      schemaVersion: SCHEMA_VERSION,
      maps: maps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
    writeAtomic(this.indexPath(repositoryKey), index);
    return index;
  }

  updateIndex(repositoryKey: string, meta: MapMeta) {
    const index = this.readIndex(repositoryKey);
    index.maps = index.maps.filter((item) => item.id !== meta.id);
    index.maps.push(meta);
    index.maps.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    writeAtomic(this.indexPath(repositoryKey), index);
  }

  find(repositoryKey: string, manifestDigest: string) {
    return (
      this.readIndex(repositoryKey).maps.find(
        (item) => item.manifestDigest === manifestDigest && !item.archivedAt,
      ) || null
    );
  }
  related(repositoryKey: string) {
    return (
      this.readIndex(repositoryKey).maps.find((item) => !item.archivedAt) ||
      null
    );
  }

  acquireLock(directory: string, mapId: string): WriterLock {
    const locks = path.join(directory, "locks");
    mkdir(locks);
    const filename = path.join(locks, "writer.lock");
    const value = {
      pid: process.pid,
      hostname: this.hostname,
      startedAt: new Date().toISOString(),
      token: id("lck"),
      mapId,
    };
    try {
      const fd = fs.openSync(filename, "wx", 0o600);
      fs.writeFileSync(fd, `${canonicalize(value)}\n`);
      fs.closeSync(fd);
      return { filename, token: value.token };
    } catch (error) {
      if (errorFields(error).code !== "EEXIST") throw error;
      let old;
      try {
        old = readJson(filename);
        invariant(
          isRecord(old),
          "writer_locked",
          "writer lock must be an object",
        );
      } catch {
        throw new ReviewMapError(
          "writer_locked",
          `map has an unreadable writer lock: ${filename}`,
        );
      }
      if (
        old.hostname === this.hostname &&
        typeof old.pid === "number" &&
        Number.isInteger(old.pid) &&
        !processExists(old.pid)
      ) {
        fs.unlinkSync(filename);
        return this.acquireLock(directory, mapId);
      }
      throw new ReviewMapError(
        "writer_locked",
        `map is locked by process ${old.pid} on ${old.hostname}`,
        old,
      );
    }
  }

  releaseLock(lock: WriterLock) {
    try {
      const current = readJson(lock.filename);
      if (isRecord(current) && current.token === lock.token)
        fs.unlinkSync(lock.filename);
    } catch (error) {
      if (errorFields(error).code !== "ENOENT") throw error;
    }
  }

  create({
    identity,
    title,
    actor,
  }: {
    identity: ReturnType<typeof resolveChange>;
    title?: string;
    actor: Actor;
  }) {
    const mapId = id("map");
    const directory = this.mapDir(identity.repositoryKey, mapId);
    mkdir(path.join(directory, "events"));
    mkdir(path.join(directory, "snapshots"));
    mkdir(path.join(directory, "receipts"));
    mkdir(path.join(directory, "tmp"));
    mkdir(path.join(directory, "blobs", "sha256"));
    writeAtomic(
      path.join(this.repositoryDir(identity.repositoryKey), "repository.json"),
      {
        schemaVersion: SCHEMA_VERSION,
        repositoryKey: identity.repositoryKey,
        workspace: identity.workspace,
        commonDir: identity.commonDir,
        updatedAt: new Date().toISOString(),
      },
    );
    const occurredAt = new Date().toISOString();
    const changeRevision = {
      id: id("rev"),
      state: "current",
      createdAt: occurredAt,
      kind: identity.kind,
      labels: identity.labels,
      manifest: identity.manifest,
      manifestDigest: identity.manifestDigest,
    };
    const payload = {
      producerVersion: PRODUCER_VERSION,
      mapId,
      title: title || "Untitled change",
      repository: {
        key: identity.repositoryKey,
        workspace: identity.workspace,
        commonDir: identity.commonDir,
      },
      changeRevision,
      actor,
      occurredAt,
    };
    const event = makeEvent({
      mapId,
      sequence: 1,
      eventType: "ReviewMapCreated",
      payload,
      actor,
      changeRevisionId: changeRevision.id,
      expectedAggregateRevision: 0,
      previousEventHash: null,
      occurredAt,
    });
    writeAtomic(path.join(directory, "events", "000000000001.json"), event);
    const state = replay([event]);
    this.writeMeta(identity.repositoryKey, state);
    return state;
  }

  eventFiles(directory: string) {
    try {
      return fs
        .readdirSync(path.join(directory, "events"))
        .filter((name) => /^\d{12}\.json$/.test(name))
        .sort();
    } catch (error) {
      if (errorFields(error).code === "ENOENT") return [];
      throw error;
    }
  }

  load(repositoryKey: string, mapId: string) {
    const directory = this.mapDir(repositoryKey, mapId);
    const files = this.eventFiles(directory);
    invariant(files.length > 0, "map_not_found", `map not found: ${mapId}`);
    const events = [];
    let previous: string | null = null;
    for (let index = 0; index < files.length; index++) {
      const event = readJson(path.join(directory, "events", files[index]));
      validateEvent(event);
      invariant(
        event.sequence === index + 1,
        "event_sequence_invalid",
        `expected event ${index + 1}, found ${event.sequence}`,
      );
      invariant(
        event.previousEventHash === previous,
        "event_chain_invalid",
        `event ${event.sequence} has an invalid previous hash`,
      );
      invariant(
        event.eventHash === eventHash(event),
        "event_hash_invalid",
        `event ${event.sequence} failed its integrity check`,
      );
      events.push(event);
      previous = event.eventHash;
    }
    const state = replay(events);
    validateSnapshot(state);
    return state;
  }

  writeMeta(repositoryKey: string, state: Aggregate) {
    const current = currentRevision(state);
    const meta = {
      schemaVersion: SCHEMA_VERSION,
      id: state.id,
      title: state.title,
      phase: state.phase,
      aggregateRevision: state.aggregateRevision,
      manifestDigest: current.manifestDigest,
      changeRevisionId: current.id,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      archivedAt: state.archivedAt,
    };
    writeAtomic(
      path.join(this.mapDir(repositoryKey, state.id), "meta.json"),
      meta,
    );
    this.updateIndex(repositoryKey, meta);
  }

  mutate(
    repositoryKey: string,
    mapId: string,
    expectedRevision: number,
    actor: Actor,
    buildEvents: (state: Aggregate) => EventSpec[],
  ) {
    const directory = this.mapDir(repositoryKey, mapId);
    const lock = this.acquireLock(directory, mapId);
    try {
      let state = this.load(repositoryKey, mapId);
      invariant(
        state.aggregateRevision === expectedRevision,
        "revision_conflict",
        `expected revision ${expectedRevision}, current revision is ${state.aggregateRevision}`,
        { currentRevision: state.aggregateRevision },
      );
      const specs = buildEvents(state);
      invariant(
        Array.isArray(specs) && specs.length > 0,
        "empty_mutation",
        "mutation produced no events",
      );
      const emitted = [];
      for (const spec of specs) {
        const sequence = state.aggregateRevision + 1;
        const event = makeEvent({
          mapId,
          sequence,
          ...spec,
          actor,
          changeRevisionId:
            spec.changeRevisionId === undefined
              ? state.currentChangeRevisionId
              : spec.changeRevisionId,
          expectedAggregateRevision: expectedRevision,
          previousEventHash: state.lastEventHash,
          occurredAt: spec.occurredAt,
        });
        writeAtomic(
          path.join(
            directory,
            "events",
            `${String(sequence).padStart(12, "0")}.json`,
          ),
          event,
        );
        state = applyEvent(state, event);
        emitted.push(event.eventId);
      }
      if (state.aggregateRevision % 100 === 0) {
        const bytes = zlib.gzipSync(
          Buffer.from(
            canonicalize({
              schemaVersion: SCHEMA_VERSION,
              sequence: state.aggregateRevision,
              eventHash: state.lastEventHash,
              state,
            }),
          ),
        );
        fs.writeFileSync(
          path.join(
            directory,
            "snapshots",
            `${String(state.aggregateRevision).padStart(12, "0")}.json.gz`,
          ),
          bytes,
          { mode: 0o600, flag: "wx" },
        );
      }
      this.writeMeta(repositoryKey, state);
      return { state, emittedEventIds: emitted };
    } finally {
      this.releaseLock(lock);
    }
  }

  writeReceipt(
    repositoryKey: string,
    mapId: string,
    receipt: ReturnType<typeof buildReceipt>,
  ) {
    validateReceipt(receipt);
    const directory = path.join(this.mapDir(repositoryKey, mapId), "receipts");
    writeAtomic(path.join(directory, `${receipt.id}.json`), receipt);
    return path.join(directory, `${receipt.id}.json`);
  }

  writeReceiptMarkdown(
    repositoryKey: string,
    mapId: string,
    receiptId: string,
    markdown: string,
  ) {
    const filename = path.join(
      this.mapDir(repositoryKey, mapId),
      "receipts",
      `${receiptId}.md`,
    );
    const fd = fs.openSync(filename, "wx", 0o600);
    try {
      fs.writeFileSync(fd, markdown);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return filename;
  }

  storeEvidenceBlob(repositoryKey: string, mapId: string, bytes: Buffer) {
    invariant(
      Buffer.isBuffer(bytes),
      "invalid_blob",
      "evidence blob must be bytes",
    );
    invariant(
      bytes.length <= 5 * 1024 * 1024,
      "blob_too_large",
      "evidence blob exceeds the 5 MiB per-blob limit",
    );
    const root = path.join(
      this.mapDir(repositoryKey, mapId),
      "blobs",
      "sha256",
    );
    let total = 0;
    try {
      for (const prefix of fs.readdirSync(root, { withFileTypes: true })) {
        if (!prefix.isDirectory()) continue;
        for (const name of fs.readdirSync(path.join(root, prefix.name)))
          total += fs.statSync(path.join(root, prefix.name, name)).size;
      }
    } catch (error) {
      if (errorFields(error).code !== "ENOENT") throw error;
    }
    const contentDigest = digest(bytes);
    const hex = contentDigest.slice(7);
    const directory = path.join(root, hex.slice(0, 2));
    const filename = path.join(directory, hex);
    if (!fs.existsSync(filename)) {
      invariant(
        total + bytes.length <= 50 * 1024 * 1024,
        "blob_quota_exceeded",
        "evidence blobs exceed the 50 MiB map limit",
      );
      mkdir(directory);
      const fd = fs.openSync(filename, "wx", 0o600);
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    return { digest: contentDigest, size: bytes.length };
  }

  inspect(repositoryKey: string, mapId: string) {
    return {
      stateRoot: this.root,
      mapDirectory: this.mapDir(repositoryKey, mapId),
    };
  }

  delete(repositoryKey: string, mapId: string) {
    const directory = this.mapDir(repositoryKey, mapId);
    invariant(
      fs.existsSync(directory),
      "map_not_found",
      `map not found: ${mapId}`,
    );
    fs.rmSync(directory, { recursive: true, force: false });
    this.rebuildIndex(repositoryKey);
  }
}

export { FileReviewMapStore, stateRoot, writeAtomic, makeEvent, eventHash };
