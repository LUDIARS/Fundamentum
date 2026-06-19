# feature/ — catalog による論理名付けと版管理

## 目的
master の content id は内容ハッシュなので、人間/コードが参照する **論理名** を与える。
catalog は「論理名 → master ContentId」のマップに版番号を付けて管理し、規定部分のスナップショットを
名前で引けるようにする。

## ユーザーストーリー
consumer が `catalog.builder("an/adventure").set("no-cross-domain", ruleId).commit()` で論理名に
束ね、以後 `latest("an/adventure")` や resolver 経由で論理名から実体を引く。ルール改訂のたびに
新版を commit し、`history` / `version(n)` で過去版も追える。

## 振る舞い (入力 → 処理 → 出力)
- 更新: `CatalogBuilder` に `set(name,id)` / `remove(name)` を積み `commit()`。
  - 現 latest を parent に新 entries を構築 → `version = parent.version+1` (初版 1) で新スナップショットを書く。
  - head / version ポインタを更新。
  - **差分なしの commit は no-op** (latest をそのまま返す。冪等な再構築)。
- 参照: `latest(name)` / `version(name,n)` / `history(name)` (latest 先頭) / `names()`。

## 状態遷移
`(無) → v1 → v2 → …`。各版は `parent` で 1 つ前を指し、片方向リンクで履歴を成す。

## 制約・前提・既知の制限
- catalog スナップショット自体も content-addressed (共有可能)。
- entries の値 (ContentId) が指す master 値の存在は catalog 側で保証しない (resolver が引いたとき null になりうる)。

## 関連
- スキーマ: [data/catalog.md](../data/catalog.md)
- API: [interface/catalog-store.md](../interface/catalog-store.md)
- 差分再解析: [feature/incremental-diff.md](./incremental-diff.md)
