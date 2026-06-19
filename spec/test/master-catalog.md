# test/ — master.test.ts (MasterStore / CatalogStore)

> 正本: `src/__tests__/master.test.ts`。ユニット (MemoryBackend)。11 tests。

## MasterStore (4)
- put した値を id で取り出せる。
- 同一内容を dedup する (同 id)。
- 未知 id で `null` を返す。
- `putAll` は入力順の record を返す。

## CatalogStore (7)
- builder で初版を作る (version 1)。
- 更新で version を増やし parent を繋ぐ。
- 差分の無い commit を no-op にする (同 latest を返す)。
- `diff` は added / removed / changed / unchanged を返す。
- `history` は latest 先頭で全版を返す。
- `version(name, n)` で過去版を引ける。
- `names` は head のある catalog を列挙する。

## 担保するもの
不変ストアの dedup・冪等、catalog の版連鎖 (parent)・no-op commit・diff 分類・履歴/版引き・名前列挙。

## 関連
- 実装: [interface/master-store.md](../interface/master-store.md), [interface/catalog-store.md](../interface/catalog-store.md)
- スキーマ: [data/master-content.md](../data/master-content.md), [data/catalog.md](../data/catalog.md)
