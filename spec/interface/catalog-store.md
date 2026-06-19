# interface/ — CatalogStore / CatalogBuilder (公開 API)

> 正本実装: `src/master/catalog.ts`

論理名 ↔ master content id の版管理 contract。データスキーマは
[data/catalog.md](../data/catalog.md)。

---

## CatalogStore

```ts
class CatalogStore {
  constructor(backend: StorageBackend);

  latest(name: string): Promise<Catalog | null>;
  version(name: string, version: number): Promise<Catalog | null>;
  load(id: ContentId): Promise<Catalog | null>;
  history(name: string): Promise<Catalog[]>;
  names(): Promise<string[]>;
  builder(name: string): CatalogBuilder;
  diff(a: Catalog, b: Catalog): CatalogDiff;

  // builder からのみ呼ばれる内部 commit (public だが consumer は使わない)
  _commit(name: string, entries: Record<string, ContentId>, parent: Catalog | null): Promise<Catalog>;
}
```

| メソッド | 戻り | 説明 |
|---|---|---|
| `latest(name)` | `Catalog \| null` | 最新版。未作成なら `null` |
| `version(name, n)` | `Catalog \| null` | 指定版。無ければ `null` |
| `load(id)` | `Catalog \| null` | content id から catalog スナップショットを読む |
| `history(name)` | `Catalog[]` | latest → parent と遡る全版 (**latest 先頭**)。未作成なら `[]` |
| `names()` | `string[]` | head ポインタのある catalog 名一覧 |
| `builder(name)` | `CatalogBuilder` | 更新ビルダー |
| `diff(a, b)` | `CatalogDiff` | 2 版間の `{ added, removed, changed, unchanged }` (各昇順) |

`diff` は同期メソッド (引数の 2 つの `Catalog` を比較するだけ)。`unchanged` は content id 一致
= consumer の解析キャッシュ命中。`_commit` は `builder().commit()` 内部用で consumer は直接呼ばない。

---

## CatalogBuilder

```ts
class CatalogBuilder {
  set(logicalName: string, id: ContentId): this;  // 上書き設定 (チェーン可)
  remove(logicalName: string): this;              // 削除 (チェーン可)
  commit(): Promise<Catalog>;
}
```

- `set` / `remove` は操作を内部に積むだけ (チェーン可。`builder(name).set(...).set(...).commit()`)。
- `commit()`:
  - 現 latest を parent に、積んだ操作を適用して新 entries を作る。
  - **適用後 entries が現 latest と同一なら新版を作らず latest を返す** (no-op 更新・冪等)。
  - 新版なら `version = parent.version + 1` (初版は 1)、head / version ポインタを更新して返す。

```ts
const v2 = await fm.catalog.builder("an/adventure")
  .set("no-deep-coupling", newId)
  .remove("obsolete-rule")
  .commit();
const d = fm.catalog.diff(v1!, v2); // d.changed / d.added だけ再解析
```

## 関連
- スキーマ: [data/catalog.md](../data/catalog.md)
- 値本体: [interface/master-store.md](./master-store.md)
- 機能: [feature/catalog-versioning.md](../feature/catalog-versioning.md), [feature/incremental-diff.md](../feature/incremental-diff.md)
