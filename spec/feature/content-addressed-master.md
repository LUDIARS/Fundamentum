# feature/ — content-addressed master ストア

## 目的
「絶対に変わらない規定部分」(アーキテクチャルール、ドメインオントロジー、確定した仕様射影
など) を、内容から一意に決まる ID で不変に保管する。一度解析・キャッシュすれば、以後
セッション/リポを跨いで命中する (= consumer が「規定部分の解析を代行」できる土台)。

## ユーザーストーリー
consumer (最初は Anatomia) が、カノニカルな解析成果物を `master.put(value)` で置き、返る
`ContentId` を以後の参照キーにする。同じ内容を別セッションで put しても同じ ID が返るため、
解析結果を ID キーで共有・dedup できる。

## 振る舞い (入力 → 処理 → 出力)
- 入力: `JsonValue` (決定的に直列化できる JSON 値)。
- 処理: canonical 化 (キー再帰ソート) → `fm1: + sha256(canonical)` を導出 → 未存在なら書込み (冪等)。
- 出力: `MasterRecord { id, value }`。`get(id)` で値、`has(id)` で存在判定。

## 制約・前提・既知の制限
- **不変**: update / delete は無い。「変更」= 別 ID の新値を put するだけ。
- namespace 等のラベルは ID に混ぜない (純粋 content addressing)。論理名付けは catalog の役目。
- `undefined` / 関数 / 非有限数 / `bigint` / `symbol` を含む値は put 不可 (canonical 化で throw)。
- スキーマ強制はしない (consumer が zod 等で被せる)。

## 関連
- スキーマ: [data/master-content.md](../data/master-content.md)
- API: [interface/master-store.md](../interface/master-store.md), [interface/hashing.md](../interface/hashing.md)
