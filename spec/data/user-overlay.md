# data/ — user overlay (scoped・可変・revisioned)

> 正本実装: `src/user/user-store.ts`, `src/types.ts`

user 層は master を壊さず、利用側の上書き/調整を持つ **可変** ストア。scope は論理区画
(project id / session id 等)。各 key は「リビジョン列」として保持し、set / delete が
1 リビジョンを積んで履歴を残す。

> ⚠️ user 層は「可変なアプリ/セッション状態」であって **個人データストアではない**。
> 個人特定子 (`scope` 含む) は置かない。個人データは Cernere 単一情報源 (LUDIARS 共通規約, DESIGN §1.2)。

---

## 1. 保存単位 — UserRecord (リビジョン)

`UserRecord` 型 (`src/types.ts`):

| フィールド | 型 | 説明 |
|---|---|---|
| `scope` | `string` | 論理区画 (project id / session id 等)。個人特定子は禁止 |
| `key` | `string` | scope 内のキー |
| `value` | `JsonValue \| null` | 値。tombstone のときは `null` |
| `revision` | `number` | 1 始まり。set / delete のたびに +1 |
| `deleted` | `boolean` | delete (tombstone) なら `true` |

- 1 つの `(scope, key)` は **リビジョンの配列** (`UserRecord[]`、古い順) として保持される。
- set は `{ value, deleted:false }` を、delete は `{ value:null, deleted:true }` (tombstone) を末尾に積む。
- `revision` は `(直前の revision ?? 0) + 1`。

---

## 2. ディスク/メモリ上レイアウト

正本: `src/user/user-store.ts` の `partitionFor`。1 つの `(scope, key)` のリビジョン列全体を
keyed 層の 1 値 (JSON 配列文字列) として持つ。

| 要素 | 値 |
|---|---|
| keyed partition | `user:<scope>` (例 `user:project-1`) |
| keyed key | `key` (例 `rule:no-cross-domain`) |
| keyed 値 | `JSON.stringify(UserRecord[])` (リビジョン列全体) |

FileBackend では `keyed/<enc("user:<scope>")>/<enc(key)>.json` (enc = base64url)。
本文はリビジョン配列の JSON 文字列。

> 注: user 値は keyed 層に通常の JSON で保存する (master と違い content-addressed ではない)。
> canonical 化はせず `JSON.stringify` を使う。

---

## 3. 読み出しセマンティクス

正本: `src/user/user-store.ts`。

| メソッド | 戻り | 規則 |
|---|---|---|
| `get(scope, key)` | `JsonValue \| null` | 最新が live ならその value、未設定 or 最新が tombstone なら `null` |
| `getRecord(scope, key)` | `UserRecord \| null` | 最新リビジョン (tombstone 含む)。未設定なら `null` |
| `history(scope, key)` | `UserRecord[]` | 全リビジョン (古い順)。未設定なら `[]` |
| `list(scope)` | `string[]` | live な (最新が tombstone でない) key のみ。昇順 |

- tombstone は履歴に残る (`history` には現れる) が `get` / `list` からは除外される。
- scope 同士は独立 (別 scope の同名 key に干渉しない)。

---

## 4. master との統合 (Resolver)

user 層単独では master を参照しない。実効値 (user overlay > master) は Resolver が統合する。
優先順位は user live > user tombstone (master を明示的に隠す) > master > none。詳細は
[interface/resolver.md](../interface/resolver.md) / [feature/effective-resolution.md](../feature/effective-resolution.md)。

---

## 5. 関連

- 値本体 (master): [data/master-content.md](./master-content.md)
- 公開 API: [interface/user-store.md](../interface/user-store.md)
- 機能概要: [feature/user-overlay.md](../feature/user-overlay.md)
