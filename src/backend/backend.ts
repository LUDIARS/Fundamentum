/**
 * StorageBackend — 永続層の抽象。
 *
 * 2 系統を持つ:
 *  - content: content-addressed・不変 (master 値)。key = ContentId、value = canonical JSON 文字列。
 *  - keyed:   可変 key-value (catalog の head/version ポインタ、user リビジョン列)。
 *
 * backend は値を不透明な文字列として扱う (直列化/解釈は上位)。
 * async 固定 — remote backend (HTTP 等) を同 interface で後付けするため。
 *
 * SRP: バイト/文字列の出し入れのみ。意味づけは master/catalog/user 各ストア。
 */
export interface StorageBackend {
  // --- content (不変・content-addressed) ---

  /** content id に対応する canonical 文字列を返す。無ければ null。 */
  getContent(id: string): Promise<string | null>;
  /** content を書く。同 id → 同 value ゆえ冪等。 */
  putContent(id: string, canonical: string): Promise<void>;
  /** content の存在判定 (書込み前のスキップ用)。 */
  hasContent(id: string): Promise<boolean>;

  // --- keyed (可変) ---

  /** partition 内の key の値を返す。無ければ null。 */
  getKeyed(partition: string, key: string): Promise<string | null>;
  /** partition 内の key に値を書く (上書き)。 */
  putKeyed(partition: string, key: string, json: string): Promise<void>;
  /** partition 内の key を削除する。無ければ no-op。 */
  deleteKeyed(partition: string, key: string): Promise<void>;
  /** partition 内の key 一覧。prefix 指定でフィルタ。partition 不在なら []。 */
  listKeys(partition: string, prefix?: string): Promise<string[]>;
}
