# test/ — integration.test.ts (Anatomia 風 end-to-end)

> 正本: `src/__tests__/integration.test.ts`。統合 (Foundation facade, MemoryBackend)。2 tests。

DESIGN §5 の利用シナリオを端から端まで通す。

## 「更新で変わるのは changed/added だけ、unchanged は id 一致」
- master に規定ルール 3 本を put → catalog `an/adventure` v1 に束ねる。
- v2 で 1 本の severity を上げ (changed)、新ルールを追加 (added)、2 本は据え置き。
- `diff(v1, v2)` が `changed=["no-deep-coupling"]`, `added=["dod-layout"]`, `removed=[]`,
  `unchanged=["no-cross-domain","spec-linked"]` を返す。
- unchanged の content id は v1 と一致 (= キャッシュ命中)、changed は別 id。

## 「user overlay は規定を上書きするが master の決定性を汚さない」
- 規定 (severity block) を catalog に置く。
- project scope `adventure` で severity warn に上書き (user.set)。
- `resolve` が `source:"user"` で warn を返す一方、master 側の規定値は block のまま無傷。
- 別 project scope `kuzu` では `source:"master"` で block のまま (overlay は scope 局所)。

## 担保するもの
master→catalog→user→resolve の配線が DESIGN の狙い (差分再解析・overlay が master を汚さない・
scope 局所性) を end-to-end で満たすこと。

## 関連
- 機能: [feature/incremental-diff.md](../feature/incremental-diff.md), [feature/effective-resolution.md](../feature/effective-resolution.md)
- facade: [interface/foundation.md](../interface/foundation.md)
