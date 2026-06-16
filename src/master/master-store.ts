/**
 * MasterStore — content-addressed・不変ストア。
 *
 * 「絶対に変わらない規定部分」を持つ層。値のみから id を導出するため、同一内容は
 * global に dedup され、一度書けばセッション/リポを跨いでヒットする (規定の解析代行の土台)。
 *
 * 不変ゆえ update / delete は持たない。「変更」= 別の値を put して別 id を得るだけ。
 *
 * SRP: 不変値の put / get のみ。論理名付けは Catalog。
 */
import type { StorageBackend } from "../backend/backend.js";
import { canonicalize } from "../hash/canonical.js";
import { contentIdFromCanonical } from "../hash/content-id.js";
import type { ContentId, JsonValue, MasterRecord } from "../types.js";

export class MasterStore {
  constructor(private readonly backend: StorageBackend) {}

  /**
   * 値を put し MasterRecord を返す。既存 (同 id) ならば書込みを省く (冪等)。
   */
  async put(value: JsonValue): Promise<MasterRecord> {
    const canonical = canonicalize(value);
    const id = contentIdFromCanonical(canonical);
    if (!(await this.backend.hasContent(id))) {
      await this.backend.putContent(id, canonical);
    }
    return { id, value };
  }

  /** 複数値を put。戻りは入力順の MasterRecord 配列。 */
  async putAll(values: JsonValue[]): Promise<MasterRecord[]> {
    const out: MasterRecord[] = [];
    for (const v of values) out.push(await this.put(v));
    return out;
  }

  /** content id から値を取得。無ければ null。 */
  async get(id: ContentId): Promise<JsonValue | null> {
    const canonical = await this.backend.getContent(id);
    return canonical === null ? null : (JSON.parse(canonical) as JsonValue);
  }

  /** content id の存在判定。 */
  async has(id: ContentId): Promise<boolean> {
    return this.backend.hasContent(id);
  }
}
