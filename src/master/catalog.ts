/**
 * Catalog — 名前付き・versioned スナップショット。
 *
 * master の content id は内容ハッシュなので、人間/コードが参照する論理名が要る。Catalog は
 * 「論理名 → master content id」のマップに版を付けて管理する。catalog 自体も content-addressed。
 *
 * 更新は CatalogBuilder で set/remove → commit。差分が無ければ commit は no-op (latest をそのまま
 * 返す)。`diff` は 2 版間の added/removed/changed/unchanged を返し、unchanged は content id が
 * 一致するので consumer の解析キャッシュがヒットする (= 規定部分の更新が楽になる中身)。
 *
 * SRP: 論理名 ↔ content id の版管理のみ。値の保管は MasterStore。
 */
import type { StorageBackend } from "../backend/backend.js";
import { canonicalize } from "../hash/canonical.js";
import { contentIdFromCanonical } from "../hash/content-id.js";
import type { Catalog, CatalogDiff, ContentId } from "../types.js";

/** latest ポインタ (catalog 名 → 最新 catalog content id) の partition。 */
const HEAD = "catalog:head";
/** 版ポインタ (`name@version` → catalog content id) の partition。 */
const VERSION = "catalog:version";

interface CatalogPayload {
  name: string;
  version: number;
  entries: Record<string, ContentId>;
  parent: ContentId | null;
}

export class CatalogStore {
  constructor(private readonly backend: StorageBackend) {}

  /** 最新版を返す。未作成なら null。 */
  async latest(name: string): Promise<Catalog | null> {
    const id = await this.backend.getKeyed(HEAD, name);
    return id === null ? null : this.load(id);
  }

  /** 指定版を返す。無ければ null。 */
  async version(name: string, version: number): Promise<Catalog | null> {
    const id = await this.backend.getKeyed(VERSION, `${name}@${version}`);
    return id === null ? null : this.load(id);
  }

  /** content id から catalog スナップショットを読む。 */
  async load(id: ContentId): Promise<Catalog | null> {
    const canonical = await this.backend.getContent(id);
    if (canonical === null) return null;
    const p = JSON.parse(canonical) as CatalogPayload;
    return { id, name: p.name, version: p.version, entries: p.entries, parent: p.parent };
  }

  /** latest → parent と遡った全版 (latest 先頭)。 */
  async history(name: string): Promise<Catalog[]> {
    const out: Catalog[] = [];
    let cur = await this.latest(name);
    while (cur) {
      out.push(cur);
      cur = cur.parent ? await this.load(cur.parent) : null;
    }
    return out;
  }

  /** 既存 catalog 名の一覧 (head ポインタが存在するもの)。 */
  async names(): Promise<string[]> {
    return this.backend.listKeys(HEAD);
  }

  /** 更新ビルダー。set/remove を積んで commit する。 */
  builder(name: string): CatalogBuilder {
    return new CatalogBuilder(this, name);
  }

  /** 2 版の差分。a → b で何が変わったか。 */
  diff(a: Catalog, b: Catalog): CatalogDiff {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const k of Object.keys(b.entries)) {
      if (!(k in a.entries)) added.push(k);
    }
    for (const k of Object.keys(a.entries)) {
      if (!(k in b.entries)) {
        removed.push(k);
      } else if (a.entries[k] !== b.entries[k]) {
        changed.push(k);
      } else {
        unchanged.push(k);
      }
    }
    return {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
      unchanged: unchanged.sort(),
    };
  }

  /** builder からのみ呼ばれる内部 commit。新版を書いて head/version ポインタを更新する。 */
  async _commit(
    name: string,
    entries: Record<string, ContentId>,
    parent: Catalog | null,
  ): Promise<Catalog> {
    const version = parent ? parent.version + 1 : 1;
    const payload: CatalogPayload = { name, version, entries, parent: parent?.id ?? null };
    const canonical = canonicalize(payload as unknown as import("../types.js").JsonValue);
    const id = contentIdFromCanonical(canonical);
    await this.backend.putContent(id, canonical);
    await this.backend.putKeyed(VERSION, `${name}@${version}`, id);
    await this.backend.putKeyed(HEAD, name, id);
    return { id, name, version, entries, parent: parent?.id ?? null };
  }
}

type Op = { kind: "set"; name: string; id: ContentId } | { kind: "remove"; name: string };

/** Catalog の更新ビルダー。操作を積み、commit 時に latest をベースに適用する。 */
export class CatalogBuilder {
  private readonly ops: Op[] = [];

  constructor(
    private readonly store: CatalogStore,
    private readonly name: string,
  ) {}

  /** 論理名 → master content id を設定 (上書き)。 */
  set(logicalName: string, id: ContentId): this {
    this.ops.push({ kind: "set", name: logicalName, id });
    return this;
  }

  /** 論理名を削除。 */
  remove(logicalName: string): this {
    this.ops.push({ kind: "remove", name: logicalName });
    return this;
  }

  /**
   * 積んだ操作を latest に適用して新版を作る。
   * 結果が現 latest と同一エントリなら新版を作らず latest をそのまま返す (no-op 更新)。
   */
  async commit(): Promise<Catalog> {
    const parent = await this.store.latest(this.name);
    const entries: Record<string, ContentId> = { ...(parent?.entries ?? {}) };
    for (const op of this.ops) {
      if (op.kind === "set") entries[op.name] = op.id;
      else delete entries[op.name];
    }
    if (parent && sameEntries(parent.entries, entries)) {
      return parent;
    }
    return this.store._commit(this.name, entries, parent);
  }
}

function sameEntries(
  a: Readonly<Record<string, ContentId>>,
  b: Readonly<Record<string, ContentId>>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
