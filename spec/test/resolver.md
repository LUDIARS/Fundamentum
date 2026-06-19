# test/ — resolver.test.ts (Resolver)

> 正本: `src/__tests__/resolver.test.ts`。ユニット (MemoryBackend)。6 tests。

セットアップ: master に rule を put → catalog `an/proj` の `rule:ncd` に束ねた状態を共有。

- user 未設定なら master を返す (`source:"master"`)。
- user の live 値が master を上書きする (`source:"user"`)。
- user の tombstone が master を隠す (value `null`, `source:"user"`)。
- master にも user にも無ければ none (`source:"none"`)。
- overlay が scope 単位 (他 scope は master のまま)。
- `resolveAll` は master 名 ∪ user key を統合する。

## 担保するもの
解決優先順位 (user live > user tombstone > master > none)・scope 局所性・resolveAll の名前統合。

## 関連
- 実装: [interface/resolver.md](../interface/resolver.md)
- 機能: [feature/effective-resolution.md](../feature/effective-resolution.md)
