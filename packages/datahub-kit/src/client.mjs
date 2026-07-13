// client — datahub の push/pull/authors/conflicts fetch クライアント。
// ブラウザ / Node 両用・依存ゼロ。API 契約: spec/interface/datahub-api.md

import { resolveBaseUrl } from "./config.mjs";

export class DatahubClient {
  /**
   * @param {{baseUrl?: string, author: string, name?: string|null}} options
   *   author: PC 単位の UUIDv4 (ブラウザは loadBrowserIdentity() で取得)
   */
  constructor(options) {
    if (!options || typeof options.author !== "string" || !options.author) {
      throw new Error("[datahub-kit] author (UUIDv4) は必須です");
    }
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.author = options.author;
    this.name = options.name ?? null;
  }

  async health() {
    return this.#api("GET", "/v1/health");
  }

  /** 表示名を hub の台帳へ登録 (push の前提) */
  async registerAuthor(name) {
    const result = await this.#api("POST", "/v1/authors", { author: this.author, name });
    this.name = result.name;
    return result;
  }

  async authors() {
    return this.#api("GET", "/v1/authors");
  }

  /**
   * @param {Array<{kind: string, id: string, baseRev: number, payload: object}>} items
   * 戻りの results[].rev が hub の採番リビジョン (自分の push へ割り当てる)。
   */
  async push(items) {
    return this.#api("POST", "/v1/push", { author: this.author, items });
  }

  /** rev>since の全コミット (更新差分)。次回は戻りの headRev を since に使う */
  async pull(since = 0, kindPrefix = undefined) {
    const query = new URLSearchParams({ since: String(since) });
    if (kindPrefix) query.set("kind", kindPrefix);
    return this.#api("GET", `/v1/pull?${query}`);
  }

  /** 各 (kind,id) の head のみ (初回同期・一覧用) */
  async records(kindPrefix = undefined) {
    const query = kindPrefix ? `?${new URLSearchParams({ kind: kindPrefix })}` : "";
    return this.#api("GET", `/v1/records${query}`);
  }

  async conflicts() {
    return this.#api("GET", "/v1/conflicts");
  }

  async resolveConflict(conflictId, winner) {
    return this.#api("POST", "/v1/conflicts/resolve", { conflictId, winner });
  }

  async log(limit = 50) {
    return this.#api("GET", `/v1/log?limit=${limit}`);
  }

  async backupNow() {
    return this.#api("POST", "/v1/backup", {});
  }

  async #api(method, path, body = undefined) {
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        ...(body !== undefined
          ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
    } catch (e) {
      throw new Error(`[datahub-kit] ${this.baseUrl || "(同一オリジン)"} へ接続できません: ${e.message}`);
    }
    const parsed = await res.json();
    if (!res.ok) {
      const message = parsed?.error?.message ?? `HTTP ${res.status}`;
      const err = new Error(`[datahub-kit] ${method} ${path}: ${message}`);
      err.status = res.status;
      err.code = parsed?.error?.code;
      throw err;
    }
    return parsed;
  }
}

const IDENTITY_KEY = "fm-datahub-author";

/**
 * ブラウザの PC 単位 Author identity (UUIDv4 + 表示名) を localStorage から
 * 読み込む。無ければ生成して保存する。
 */
export function loadBrowserIdentity(storage = globalThis.localStorage) {
  if (!storage) throw new Error("[datahub-kit] localStorage が利用できません");
  const raw = storage.getItem(IDENTITY_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.author === "string") return parsed;
  }
  const identity = { author: crypto.randomUUID(), name: null };
  storage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function saveBrowserIdentity(identity, storage = globalThis.localStorage) {
  if (!storage) throw new Error("[datahub-kit] localStorage が利用できません");
  storage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
