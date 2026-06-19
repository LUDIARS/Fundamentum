# interface/ — Foundation facade

> 正本実装: `src/foundation.ts` / public barrel `src/index.ts`

Fundamentum はライブラリ (`import { Foundation } from "fundamentum"`)。本ドキュメントは
consumer (= Anatomia 等) が呼ぶ公開 API の contract。`Foundation` は backend を渡すと
master / catalog / user / resolver を配線する facade で、利用側の基本入口。

外部 API はすべて **async**。`StorageBackend` を差し替えれば永続先を変えられる。

---

## 1. ファクトリ / コンストラクタ

```ts
class Foundation {
  constructor(backend: StorageBackend);
  static inMemory(): Foundation;        // MemoryBackend を配線 (hermetic)
  static onDisk(dir: string): Foundation; // FileBackend(dir) を配線 (永続)
}
```

- `new Foundation(backend)` — 任意の `StorageBackend` 実装で配線。
- `inMemory()` — in-memory・永続なし。テスト / 一時利用。
- `onDisk(dir)` — `dir` 配下にディスク永続 ([data/storage-backend-layout.md](../data/storage-backend-layout.md))。

---

## 2. 公開プロパティ (各ストア)

| プロパティ | 型 | 参照 |
|---|---|---|
| `backend` | `StorageBackend` | [interface/storage-backend.md](./storage-backend.md) |
| `master` | `MasterStore` | [interface/master-store.md](./master-store.md) |
| `catalog` | `CatalogStore` | [interface/catalog-store.md](./catalog-store.md) |
| `user` | `UserStore` | [interface/user-store.md](./user-store.md) |
| `resolver` | `Resolver` | [interface/resolver.md](./resolver.md) |

いずれも `readonly`。コンストラクタで一度だけ配線される。

---

## 3. ショートカットメソッド

`resolver` への委譲ショートカット:

```ts
resolve(scope: string, catalogName: string, name: string): Promise<Resolved>;
resolveAll(scope: string, catalogName: string): Promise<Resolved[]>;
```

`fm.resolve(...)` ≡ `fm.resolver.resolve(...)`、`fm.resolveAll(...)` ≡ `fm.resolver.resolveAll(...)`。

---

## 4. 典型フロー (Anatomia 接続を想定)

```ts
import { Foundation } from "fundamentum";

const fm = Foundation.onDisk("/path/to/store");

// 1. 規定 (master) を put → content id
const rule = await fm.master.put({ id: "no-cross-domain", severity: "block" });

// 2. catalog に論理名で束ねる (新版を commit)
await fm.catalog.builder("an/adventure").set("no-cross-domain", rule.id).commit();

// 3. 利用側で上書き (user overlay)
await fm.user.set("project-1", "no-cross-domain", { id: "no-cross-domain", severity: "warn" });

// 4. 実効値を解決 (user > master)
const eff = await fm.resolve("project-1", "an/adventure", "no-cross-domain");
// → { key, value, source: "user", id: null }
```

---

## 5. public barrel で export されるもの (`fundamentum`)

`src/index.ts` の re-export 一覧 (consumer が import 可能な公開シンボル)。

**型** (type-only): `JsonPrimitive`, `JsonValue`, `ContentId`, `MasterRecord`, `CatalogEntry`,
`Catalog`, `CatalogDiff`, `UserRecord`, `ResolvedSource`, `Resolved`, `StorageBackend`。

**値/クラス/関数**: `canonicalize`, `contentIdOf`, `contentIdFromCanonical`, `isContentId`,
`CONTENT_ID_PREFIX`, `MemoryBackend`, `FileBackend`, `MasterStore`, `CatalogStore`,
`CatalogBuilder`, `UserStore`, `Resolver`, `Foundation`。

---

## 6. 関連

- 中核型: [interface/types.md](./types.md)
- ハッシュ関数群: [interface/hashing.md](./hashing.md)
