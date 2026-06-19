# interface/ — 中核型 (公開型定義)

> 正本実装: `src/types.ts`

`fundamentum` が export する公開型。consumer はこれらで戻り値を受ける。値の意味づけは
各ストアの interface / data ドキュメント参照。

```ts
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type ContentId = string;            // "fm1:" + sha256 hex
type ResolvedSource = "user" | "master" | "none";

interface MasterRecord { readonly id: ContentId; readonly value: JsonValue; }

interface CatalogEntry { readonly name: string; readonly id: ContentId; }

interface Catalog {
  readonly id: ContentId;
  readonly name: string;
  readonly version: number;          // 1 始まり
  readonly entries: Readonly<Record<string, ContentId>>;
  readonly parent: ContentId | null; // 初版は null
}

interface CatalogDiff {
  readonly added: string[];
  readonly removed: string[];
  readonly changed: string[];
  readonly unchanged: string[];
}

interface UserRecord {
  readonly scope: string;
  readonly key: string;
  readonly value: JsonValue | null;  // tombstone は null
  readonly revision: number;         // 1 始まり
  readonly deleted: boolean;
}

interface Resolved {
  readonly key: string;
  readonly value: JsonValue | null;  // none / tombstone は null
  readonly source: ResolvedSource;
  readonly id: ContentId | null;     // source="master" のときだけ非 null
}
```

---

## 補足

- `JsonValue` = 本基盤が保管できる値 (決定的に直列化できる JSON 値に限る。`undefined` /
  関数 / 非有限数 / `bigint` / `symbol` は不可)。スキーマ強制は consumer 責務 (本体は不透明に扱う)。
- `CatalogEntry` は型として export されるが、`Catalog.entries` は `Record<論理名, ContentId>` を
  使う (entry 配列ではない)。
- 各型の実データ形式・保存規則は [data/](../data/) を参照。

## 関連
- [interface/foundation.md](./foundation.md) — public barrel の export 一覧
- [data/master-content.md](../data/master-content.md), [data/catalog.md](../data/catalog.md), [data/user-overlay.md](../data/user-overlay.md)
