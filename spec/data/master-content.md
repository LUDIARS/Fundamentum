# data/ — master (content-addressed 不変値)

> 正本実装: `src/master/master-store.ts`, `src/hash/canonical.ts`, `src/hash/content-id.ts`, `src/backend/*`

master 層は「絶対に変わらない規定部分」を持つ。値そのものから ID を導出する純粋な
content addressing で、同一内容は global に dedup される。本層は **不変** であり
update / delete を持たない (「変更」= 別 ID の新値を put するだけ)。

---

## 1. 保存単位 — content

| 項目 | 内容 |
|---|---|
| 識別子 | `ContentId` (= `string`) |
| 値 | `JsonValue` (JSON プリミティブ / 配列 / オブジェクトの再帰。`undefined` / 関数 / `bigint` / `symbol` / 非有限数は不可) |
| 直列化形式 | canonical JSON 文字列 (キー再帰ソート済み) |
| 変更可否 | 不変 (immutable)。同 ID → 同 value |

`JsonValue` の定義 (`src/types.ts`):

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
```

---

## 2. ContentId の生成規則

正本: `src/hash/content-id.ts` / `src/hash/canonical.ts`。

```
ContentId = "fm1:" + sha256_hex( canonicalize(value) )
```

- prefix `CONTENT_ID_PREFIX = "fm1:"` — アルゴリズム/版を将来切替できるよう明示。
- ハッシュ = `node:crypto` の `createHash("sha256").update(canonical, "utf8").digest("hex")` (64 桁 hex 小文字)。
- **値のみ**から導出する。namespace / catalog 名 / scope 等のラベルは ID に混ぜない
  → 内容が同じなら同じ ID (= dedup・キャッシュ命中の源)。

### canonical 直列化 (決定性の心臓)

`canonicalize(value: JsonValue): string` (`src/hash/canonical.ts`):

- オブジェクトのキーを **昇順再帰ソート**して `JSON.stringify` の実装差・キー順差を排除。
- 配列の順序は **保持** (順序が意味を持つ)。
- 数値: `-0` は `0` に正規化。非有限数 (`NaN` / `Infinity`) は `throw`。
- `undefined` / 関数 / `bigint` / `symbol` は `throw` (決定的に表せない)。

### ID 形式判定

`isContentId(s)` — `fm1:` で始まり残りが `^[0-9a-f]{64}$` を満たすかで判定する。

---

## 3. ディスク上レイアウト (FileBackend)

正本: `src/backend/file-backend.ts`。root = `Foundation.onDisk(dir)` の `dir`。

```
<dir>/
  content/<aa>/<hash>.json     # master 値 (canonical JSON 文字列をそのまま格納)
```

- `<aa>` = `hash` 先頭 2 桁 (sharding)。`hash` = ContentId から `fm1:` を除いた 64 桁 hex。
  - 例: `fm1:ab12...` → `content/ab/ab12....json`
  - hex が空のときの shard fallback は `"00"`。
- ファイル本文は **canonical JSON 文字列そのまま** (再パースせずバイト一致で持つ)。
- 書込みは `tmp + rename` で atomic (`<file>.tmp-<pid>` に書いてから rename)。
- content は内容ハッシュキーゆえ冪等。同 ID への複数書込みは衝突しない。
- 壊れた/読めないエントリは miss 扱い (例外を握りつぶし `null` / `false`)。crash させない。

MemoryBackend では同じ内容を in-memory `Map<ContentId, canonical>` に持つ (永続なし)。

---

## 4. 不変条件

- 同一 `JsonValue` (キー順違いを含む) → 同一 `ContentId`。
- `MasterStore.put` は既存 (同 ID) なら `hasContent` で検知して書込みを省く (冪等)。
- master 値の削除・上書きは無い。陳腐化した規定は catalog 側で論理名を差し替える
  ([data/catalog.md](./catalog.md)) か、user overlay で隠す ([data/user-overlay.md](./user-overlay.md))。

---

## 5. 関連

- 論理名付け・版管理: [data/catalog.md](./catalog.md)
- 可変 overlay: [data/user-overlay.md](./user-overlay.md)
- 公開 API: [interface/master-store.md](../interface/master-store.md)
- 機能概要: [feature/content-addressed-master.md](../feature/content-addressed-master.md)
