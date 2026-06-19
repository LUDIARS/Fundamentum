# interface/ — UserStore (公開 API)

> 正本実装: `src/user/user-store.ts`

scoped・可変・revisioned overlay の contract。データスキーマは
[data/user-overlay.md](../data/user-overlay.md)。

> ⚠️ `scope` に個人特定子を置かない (個人データは Cernere 単一情報源)。

```ts
class UserStore {
  constructor(backend: StorageBackend);

  set(scope: string, key: string, value: JsonValue): Promise<UserRecord>;
  delete(scope: string, key: string): Promise<UserRecord>;
  get(scope: string, key: string): Promise<JsonValue | null>;
  getRecord(scope: string, key: string): Promise<UserRecord | null>;
  history(scope: string, key: string): Promise<UserRecord[]>;
  list(scope: string): Promise<string[]>;
}
```

`UserRecord = { scope, key, value: JsonValue | null, revision: number, deleted: boolean }`。

---

## メソッド contract

| メソッド | 戻り | 規則 |
|---|---|---|
| `set(scope, key, value)` | `UserRecord` | live リビジョン (`deleted:false`) を積む。`revision = (前 ?? 0)+1`。最新 record を返す |
| `delete(scope, key)` | `UserRecord` | tombstone リビジョン (`value:null, deleted:true`) を積む。最新 (tombstone) を返す |
| `get(scope, key)` | `JsonValue \| null` | 最新が live ならその value、未設定 or 最新が tombstone なら `null` |
| `getRecord(scope, key)` | `UserRecord \| null` | 最新リビジョン (tombstone 含む)。未設定なら `null` |
| `history(scope, key)` | `UserRecord[]` | 全リビジョン (**古い順**)。未設定なら `[]` |
| `list(scope)` | `string[]` | live key のみ (最新が tombstone の key を除外)、昇順 |

---

## 不変条件 / 注意

- 各 `(scope, key)` は append-only のリビジョン列。`set` / `delete` のたびに 1 つ積む。
- tombstone は `history` には残るが `get` / `list` からは消える。
- scope 同士は独立 (別 scope の同名 key に干渉しない)。
- 個別 key の上書きは「直前のリビジョン列を読んで末尾に追加し書き戻す」(read-modify-write)。
- master との統合はしない (実効値は Resolver、[interface/resolver.md](./resolver.md))。

## 関連
- スキーマ: [data/user-overlay.md](../data/user-overlay.md)
- 機能: [feature/user-overlay.md](../feature/user-overlay.md)
