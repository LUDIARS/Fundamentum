# feature/ — user overlay (scoped・可変・revisioned)

## 目的
master を壊さず、利用側の上書き/調整/実験的な差分を持つ可変層。実験・上書きが master の
決定性を汚さないようにする。

## ユーザーストーリー
project / session が規定ルールを緩めたいとき `user.set(scope, key, value)` で上書きを置く。
不要になれば `user.delete(scope, key)` で tombstone を積む。各操作は履歴に残り、`history` で監査でき、
`list(scope)` で現在 live な調整一覧を得る。

## 振る舞い (入力 → 処理 → 出力)
- `set(scope,key,value)` → live リビジョンを末尾に積む (`revision = 前+1`)。
- `delete(scope,key)` → tombstone リビジョン (`value:null, deleted:true`) を積む。
- `get` → 最新が live ならその値、未設定 or tombstone なら `null`。
- `getRecord` → 最新リビジョン (tombstone 含む)。`history` → 全リビジョン (古い順)。
- `list(scope)` → live key のみ昇順。

## 状態遷移 (1 つの key)
`(無) → set:rev1 → set:rev2 → delete:rev3(tombstone) → set:rev4 …`
全リビジョンは append-only で保持。`get` / `list` は最新の生死だけ見る。

## 制約・前提・既知の制限
- **個人データストアではない**。`scope` に個人特定子を置かない (個人データは Cernere 単一情報源)。
- scope 同士は独立。
- master との統合 (user > master) はここではせず Resolver の責務。

## 関連
- スキーマ: [data/user-overlay.md](../data/user-overlay.md)
- API: [interface/user-store.md](../interface/user-store.md)
- 実効ビュー: [feature/effective-resolution.md](./effective-resolution.md)
