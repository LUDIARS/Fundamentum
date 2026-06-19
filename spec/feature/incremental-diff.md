# feature/ — catalog 差分で「変わった分だけ再解析」

## 目的
規定部分の更新時、consumer が **変わった分だけ** 再解析できるようにする。catalog の 2 版を
比較し、再解析すべき論理名を正確に返す (= 「規定部分の更新を楽にする」の実体)。

## ユーザーストーリー
ルールを改訂して新版を commit した consumer が `diff(prev, next)` を呼び、`changed` / `added` の
名前だけ再解析・再蒸留する。`unchanged` は content id が一致するため、consumer の解析キャッシュが
そのまま命中し、再解析を完全に省ける。

## 振る舞い (入力 → 処理 → 出力)
- 入力: 2 つの `Catalog` (例: `latest` の前後)。
- 処理: entries のキー集合と各 content id を比較。
- 出力: `CatalogDiff { added, removed, changed, unchanged }` (各配列は昇順)。

| 分類 | 意味 | consumer の扱い |
|---|---|---|
| `added` | b のみ | 新規解析 |
| `removed` | a のみ | 破棄 |
| `changed` | 両方にあるが id 違い | 再解析 |
| `unchanged` | 両方にあり id 同一 | **キャッシュ命中・再解析不要** |

## 制約・前提
- `diff` は同期メソッド (2 つの Catalog を渡すだけ)。backend アクセスなし。
- 「id 同一 = 内容同一」は content addressing が保証する (master / catalog 共通)。

## 関連
- API: [interface/catalog-store.md](../interface/catalog-store.md)
- 版管理: [feature/catalog-versioning.md](./catalog-versioning.md)
- テスト: [test/integration.md](../test/integration.md)
