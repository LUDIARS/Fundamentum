# test/ — hash.test.ts (canonical / content id)

> 正本: `src/__tests__/hash.test.ts`。ユニット。10 tests。

`canonicalize` と `contentIdOf` / `isContentId` の決定性・形式を担保する。

## `canonicalize` (6)
- キー順に依存しない (キー順違いで同じ出力)。
- 入れ子オブジェクトのキーも再帰ソートする。
- 配列の順序は保持する (順序が意味)。
- `-0` を `0` に正規化する。
- 非有限数 (`NaN` / `Infinity`) で throw する。
- `undefined` / 関数で throw する。

## `contentIdOf` / `isContentId` (4)
- 同一内容 (キー順違い含む) で同じ id。
- 内容が違えば違う id。
- `fm1:` prefix + sha256 hex (64 桁) 形式。
- `isContentId` は非 id 文字列を弾く。

## 担保するもの
content addressing の根幹 (意味が同じ値 → 同じ文字列 → 同じハッシュ) と、id 形式の妥当性検査。

## 関連
- 実装: [interface/hashing.md](../interface/hashing.md), [data/master-content.md](../data/master-content.md)
