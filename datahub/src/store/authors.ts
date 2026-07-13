/**
 * store/authors — Author (PC 単位 UUIDv4) と表示名の台帳。
 * authors.jsonl は upsert イベントログ、head は author ごとの最新行。
 */
import { join } from "node:path";
import { appendJsonl, readJsonl } from "../util/jsonl.js";
import { isUuidV4 } from "./record.js";

interface AuthorEvent {
  author: string;
  name: string;
  ts: string;
}

export interface AuthorEntry {
  author: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
}

export class AuthorRegistry {
  private entries = new Map<string, AuthorEntry>();

  private constructor(
    private readonly file: string,
    private readonly clock: () => Date,
  ) {}

  static open(dataDir: string, clock: () => Date): AuthorRegistry {
    const registry = new AuthorRegistry(join(dataDir, "authors.jsonl"), clock);
    for (const ev of readJsonl<AuthorEvent>(registry.file)) registry.applyEvent(ev);
    return registry;
  }

  private applyEvent(ev: AuthorEvent): void {
    const existing = this.entries.get(ev.author);
    this.entries.set(ev.author, {
      author: ev.author,
      name: ev.name,
      firstSeen: existing?.firstSeen ?? ev.ts,
      lastSeen: ev.ts,
    });
  }

  upsert(author: string, name: string): AuthorEntry {
    if (!isUuidV4(author)) throw new Error(`author は UUIDv4 であること: ${author}`);
    if (!name.trim()) throw new Error("表示名 name が空です");
    const ev: AuthorEvent = { author, name: name.trim(), ts: this.clock().toISOString() };
    appendJsonl(this.file, ev);
    this.applyEvent(ev);
    const entry = this.entries.get(author);
    if (!entry) throw new Error("[authors] upsert 直後に entry が見つかりません (bug)");
    return entry;
  }

  has(author: string): boolean {
    return this.entries.has(author);
  }

  get(author: string): AuthorEntry | undefined {
    return this.entries.get(author);
  }

  list(): AuthorEntry[] {
    return [...this.entries.values()].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  }
}
