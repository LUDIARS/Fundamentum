# interface/ — MasterStore (公開 API)

> 正本実装: `src/master/master-store.ts`

content-addressed・不変ストアの contract。不変ゆえ update / delete は **持たない**。
データスキーマは [data/master-content.md](../data/master-content.md)。

```ts
class MasterStore {
  constructor(backend: StorageBackend);
  put(value: JsonValue): Promise<MasterRecord>;
  putAll(values: JsonValue[]): Promise<MasterRecord[]>;
  get(id: ContentId): Promise<JsonValue | null>;
  has(id: ContentId): Promise<boolean>;
}
```

`MasterRecord = { readonly id: ContentId; readonly value: JsonValue }`。

---

## メソッド contract

### `put(value): Promise<MasterRecord>`
- `value` を canonical 化し `id = fm1: + sha256(canonical)` を導出。
- 既存 (同 id) なら `hasContent` で検知して書込みを省く (**冪等**)。
- 戻り: `{ id, value }`。
- throw: `value` が canonical 化不能 (`undefined` / 関数 / 非有限数 / `bigint` / `symbol` を含む) のとき。

### `putAll(values): Promise<MasterRecord[]>`
- 各値を順に `put`。戻りは **入力順** の `MasterRecord[]`。

### `get(id): Promise<JsonValue | null>`
- content id に対応する値を返す。無ければ `null`。
- 内部では canonical 文字列を `JSON.parse` して返す (キー順は canonical = ソート済み)。

### `has(id): Promise<boolean>`
- content id の存在判定 (backend.hasContent への委譲)。

---

## 不変条件 / 注意

- 同一内容 (キー順違い含む) → 同一 id。namespace 等のラベルは id に混ぜない。
- 「変更」は別 id の新値を put するだけ。既存値の上書き・削除は無い。
- id の妥当性は呼び出し側が `isContentId` で事前検査可能 ([interface/hashing.md](./hashing.md))。

## 関連
- スキーマ: [data/master-content.md](../data/master-content.md)
- 論理名付け: [interface/catalog-store.md](./catalog-store.md)
- 機能: [feature/content-addressed-master.md](../feature/content-addressed-master.md)
