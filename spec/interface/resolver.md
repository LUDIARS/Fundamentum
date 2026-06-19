# interface/ — Resolver (公開 API)

> 正本実装: `src/resolve/resolver.ts`

master + user overlay を統合した実効ビューの contract。優先順位は **user overlay > master**。

```ts
class Resolver {
  constructor(master: MasterStore, catalog: CatalogStore, user: UserStore);

  resolve(scope: string, catalogName: string, name: string): Promise<Resolved>;
  resolveAll(scope: string, catalogName: string): Promise<Resolved[]>;
}
```

`Resolved = { key: string, value: JsonValue | null, source: "user" | "master" | "none", id: ContentId | null }`。

---

## `resolve(scope, catalogName, name)`

解決順 (`src/resolve/resolver.ts`):

1. `user.getRecord(scope, name)` が存在:
   - live → `{ key:name, value, source:"user", id:null }`
   - tombstone → `{ key:name, value:null, source:"user", id:null }` (master を明示的に隠す)
2. user 無し → `catalog.latest(catalogName).entries[name]` を引く:
   - 該当 id あり → `{ key:name, value: master.get(id), source:"master", id }`
   - 無し → `{ key:name, value:null, source:"none", id:null }`

`id` が非 null になるのは `source:"master"` のときだけ。

> 注: user の lookup は `name` をそのまま user key として使う (catalog 論理名 = user key の前提)。
> scope と catalogName は別概念 (scope = user 区画、catalogName = master 名前空間)。

---

## `resolveAll(scope, catalogName)`

- 名前集合 = `catalog.latest(catalogName).entries` の全キー ∪ `user.list(scope)` の live key。
- 各名前を `resolve` して **名前昇順** で `Resolved[]` を返す。
- 「規定 (master) + 利用側調整 (user)」を統合した実効データセット一覧。

```ts
const eff = await fm.resolveAll("project-1", "an/adventure");
// master 由来 + user 由来の live key を名前順に統合 (各 source 付き)
```

## 関連
- 型: [interface/types.md](./types.md)
- 統合元: [interface/master-store.md](./master-store.md), [interface/catalog-store.md](./catalog-store.md), [interface/user-store.md](./user-store.md)
- 機能: [feature/effective-resolution.md](../feature/effective-resolution.md)
