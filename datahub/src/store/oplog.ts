/**
 * store/oplog — 操作要約ログ (push/pull/backup/resolve)。
 * GET /v1/log と UI の履歴表示用。ファイルは append-only、配信はメモリ上の直近 N 件。
 */
import { join } from "node:path";
import { appendJsonl, readJsonl } from "../util/jsonl.js";

export interface OpEntry {
  op: "push" | "pull" | "backup" | "resolve" | "authors";
  ts: string;
  author?: string;
  items?: number;
  statuses?: Record<string, number>;
  sinceRev?: number;
  headRev?: number;
  durationMs?: number;
  note?: string;
}

const KEEP = 500;

export class OpLog {
  private recentEntries: OpEntry[] = [];

  private constructor(
    private readonly file: string,
    private readonly clock: () => Date,
  ) {}

  static open(dataDir: string, clock: () => Date): OpLog {
    const oplog = new OpLog(join(dataDir, "oplog.jsonl"), clock);
    oplog.recentEntries = readJsonl<OpEntry>(oplog.file).slice(-KEEP);
    return oplog;
  }

  append(entry: Omit<OpEntry, "ts">): OpEntry {
    const full: OpEntry = { ...entry, ts: this.clock().toISOString() };
    appendJsonl(this.file, full);
    this.recentEntries.push(full);
    if (this.recentEntries.length > KEEP) this.recentEntries.shift();
    return full;
  }

  recent(limit: number): OpEntry[] {
    return this.recentEntries.slice(-Math.max(1, limit)).reverse();
  }
}
