# interface/ — StorageBackend (差し替え可能な永続抽象)

> 正本実装: `src/backend/backend.ts`, `src/backend/memory-backend.ts`, `src/backend/file-backend.ts`

永続層の抽象 interface。consumer は自前 backend (HTTP / org 共有 remote 等) を同 interface で
実装して `new Foundation(backend)` に渡せる。ディスク/メモリ上の形式は
[data/storage-backend-layout.md](../data/storage-backend-layout.md)。

```ts
interface StorageBackend {
  // content (不変・content-addressed)
  getContent(id: string): Promise<string | null>;
  putContent(id: string, canonical: string): Promise<void>;
  hasContent(id: string): Promise<boolean>;

  // keyed (可変)
  getKeyed(partition: string, key: string): Promise<string | null>;
  putKeyed(partition: string, key: string, json: string): Promise<void>;
  deleteKeyed(partition: string, key: string): Promise<void>;
  listKeys(partition: string, prefix?: string): Promise<string[]>;
}
```

---

## メソッド contract (実装が満たすべき規約)

| メソッド | 規約 |
|---|---|
| `getContent(id)` | 値を返す。無ければ `null`。読めない/壊れたら `null` (crash しない) |
| `putContent(id, canonical)` | content を書く。同 id → 同 value ゆえ **冪等** |
| `hasContent(id)` | 存在判定。書込み前スキップに使う |
| `getKeyed(partition, key)` | 値を返す。無ければ `null` |
| `putKeyed(partition, key, json)` | 上書き書込み |
| `deleteKeyed(partition, key)` | 削除。不在なら **no-op** |
| `listKeys(partition, prefix?)` | partition 内 key 一覧。prefix でフィルタ。partition 不在なら `[]`。**昇順** |

- 値はすべて **不透明な文字列** (直列化/解釈は上位ストア)。
- API は **async 固定** (remote backend を後付けするため)。
- 提供実装: `MemoryBackend` (既定・hermetic) / `FileBackend(dir)` (ディスク永続)。

---

## 提供実装

### MemoryBackend
- `content: Map<string,string>` / `keyed: Map<string, Map<string,string>>`。永続なし。

### FileBackend(dir)
- content: `content/<aa>/<hash>.json` (sharding)。keyed: `keyed/<enc(partition)>/<enc(key)>.json`
  (base64url)。書込みは tmp + rename で atomic。読み出し例外は miss 扱い。

## 関連
- レイアウト: [data/storage-backend-layout.md](../data/storage-backend-layout.md)
- setup: [setup/build-test.md](../setup/build-test.md)
