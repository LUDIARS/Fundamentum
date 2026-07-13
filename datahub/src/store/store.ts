/**
 * store/store — コミット履歴と head index。rev の自動採番 (hub 全体で単調増加) を担う。
 * 書き込みの直列化は呼び出し側 (server/push_handler) の mutex が担保する。
 */
import { join } from "node:path";
import { RevLog } from "./revlog.js";
import {
  type CommitRecord,
  type Payload,
  type ResolutionNote,
  payloadHash,
  recordKey,
} from "./record.js";

export interface CommitInput {
  kind: string;
  id: string;
  author: string;
  payload: Payload;
  resolution?: ResolutionNote;
}

export class Store {
  private commits: CommitRecord[] = [];
  private headIndex = new Map<string, CommitRecord>();

  private constructor(
    private readonly revlog: RevLog,
    private readonly clock: () => Date,
  ) {}

  static open(dataDir: string, clock: () => Date): Store {
    const store = new Store(new RevLog(join(dataDir, "revlog.jsonl")), clock);
    store.commits = store.revlog.loadAll();
    for (const rec of store.commits) store.headIndex.set(recordKey(rec.kind, rec.id), rec);
    return store;
  }

  get headRev(): number {
    return this.commits.length;
  }

  get recordCount(): number {
    return this.headIndex.size;
  }

  head(kind: string, id: string): CommitRecord | undefined {
    return this.headIndex.get(recordKey(kind, id));
  }

  /** rev を採番してコミットし、確定レコードを返す (push の戻り値の源) */
  commit(input: CommitInput): CommitRecord {
    const record: CommitRecord = {
      rev: this.headRev + 1,
      kind: input.kind,
      id: input.id,
      author: input.author,
      ts: this.clock().toISOString(),
      hash: payloadHash(input.payload),
      payload: input.payload,
      ...(input.resolution ? { resolution: input.resolution } : {}),
    };
    this.revlog.append(record);
    this.commits.push(record);
    this.headIndex.set(recordKey(record.kind, record.id), record);
    return record;
  }

  /** rev>since の全コミット (rev 昇順) = 更新差分の配布単位 */
  pullSince(since: number, kindPrefix?: string): CommitRecord[] {
    const from = Math.max(0, since);
    const slice = this.commits.slice(from);
    if (!kindPrefix) return slice;
    return slice.filter((r) => r.kind.startsWith(kindPrefix));
  }

  /** 各 (kind,id) の head のみ (初回同期・一覧用)。rev 昇順 */
  heads(kindPrefix?: string): CommitRecord[] {
    const out: CommitRecord[] = [];
    for (const rec of this.headIndex.values()) {
      if (kindPrefix && !rec.kind.startsWith(kindPrefix)) continue;
      out.push(rec);
    }
    return out.sort((a, b) => a.rev - b.rev);
  }
}
