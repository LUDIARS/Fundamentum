/**
 * UserStore — scoped・可変・revisioned overlay。
 *
 * master を壊さず、利用側の上書き/調整を持つ層。scope は論理区画 (project id / session id 等)。
 * 個人特定子は置かない (個人データは Cernere 単一情報源、DESIGN §1.2)。
 *
 * 各 key は「リビジョン列」として保持する。set / delete が 1 リビジョンを積み、履歴を残す。
 * delete は tombstone リビジョン (value=null, deleted=true) で、Resolver では master を明示的に隠す。
 *
 * SRP: scope/key 単位の可変状態と履歴のみ。master との統合は Resolver。
 */
import type { StorageBackend } from "../backend/backend.js";
import type { JsonValue, UserRecord } from "../types.js";

/** scope ごとの partition 名。 */
function partitionFor(scope: string): string {
  return `user:${scope}`;
}

export class UserStore {
  constructor(private readonly backend: StorageBackend) {}

  /** key に値を設定する。新しいリビジョンを積んで最新 UserRecord を返す。 */
  async set(scope: string, key: string, value: JsonValue): Promise<UserRecord> {
    const revisions = await this.history(scope, key);
    const revision = (revisions.at(-1)?.revision ?? 0) + 1;
    const record: UserRecord = { scope, key, value, revision, deleted: false };
    revisions.push(record);
    await this.backend.putKeyed(partitionFor(scope), key, JSON.stringify(revisions));
    return record;
  }

  /** key を削除する (tombstone リビジョンを積む)。最新 (tombstone) UserRecord を返す。 */
  async delete(scope: string, key: string): Promise<UserRecord> {
    const revisions = await this.history(scope, key);
    const revision = (revisions.at(-1)?.revision ?? 0) + 1;
    const record: UserRecord = { scope, key, value: null, revision, deleted: true };
    revisions.push(record);
    await this.backend.putKeyed(partitionFor(scope), key, JSON.stringify(revisions));
    return record;
  }

  /**
   * key の最新の live な値を返す。未設定・または最新が tombstone のときは null。
   * 「リビジョンの生死」まで見たいときは getRecord / history を使う。
   */
  async get(scope: string, key: string): Promise<JsonValue | null> {
    const record = await this.getRecord(scope, key);
    return record && !record.deleted ? record.value : null;
  }

  /** key の最新リビジョン (tombstone 含む) を返す。未設定なら null。 */
  async getRecord(scope: string, key: string): Promise<UserRecord | null> {
    const revisions = await this.history(scope, key);
    return revisions.at(-1) ?? null;
  }

  /** key の全リビジョン (古い順)。未設定なら []。 */
  async history(scope: string, key: string): Promise<UserRecord[]> {
    const raw = await this.backend.getKeyed(partitionFor(scope), key);
    if (raw === null) return [];
    return JSON.parse(raw) as UserRecord[];
  }

  /** scope 内の live な (最新が tombstone でない) key 一覧。 */
  async list(scope: string): Promise<string[]> {
    const keys = await this.backend.listKeys(partitionFor(scope));
    const live: string[] = [];
    for (const key of keys) {
      const record = await this.getRecord(scope, key);
      if (record && !record.deleted) live.push(key);
    }
    return live;
  }
}
