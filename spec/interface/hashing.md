# interface/ — ハッシュ / canonical 関数群 (公開 API)

> 正本実装: `src/hash/canonical.ts`, `src/hash/content-id.ts`

content addressing を支える公開関数。consumer が id を事前計算・検証するのに使える。
生成規則の全体は [data/master-content.md](../data/master-content.md) §2。

```ts
const CONTENT_ID_PREFIX = "fm1:";

function canonicalize(value: JsonValue): string;
function contentIdOf(value: JsonValue): ContentId;
function contentIdFromCanonical(canonical: string): ContentId;
function isContentId(s: string): boolean;
```

---

## contract

### `canonicalize(value): string`
- `JsonValue` を決定的な文字列へ。オブジェクトキーは昇順再帰ソート、配列順は保持。
- `-0` は `0` に正規化。非有限数 / `undefined` / 関数 / `bigint` / `symbol` は `throw`。

### `contentIdOf(value): ContentId`
- `contentIdFromCanonical(canonicalize(value))`。値から直接 id を作る。

### `contentIdFromCanonical(canonical): ContentId`
- `"fm1:" + sha256_hex(canonical)` (utf8)。既に canonical 化済みの文字列から (二重直列化回避用)。

### `isContentId(s): boolean`
- `fm1:` で始まり残りが `^[0-9a-f]{64}$` を満たすか。

### `CONTENT_ID_PREFIX`
- `"fm1:"`。アルゴリズム/版切替の余地を残す明示 prefix。

---

## 不変条件
- 同一 `JsonValue` (キー順違い含む) → 同一 canonical → 同一 ContentId。
- 内容が 1 ビットでも違えば別 id (sha256)。

## 関連
- 生成規則詳細: [data/master-content.md](../data/master-content.md)
- 利用元: [interface/master-store.md](./master-store.md)
