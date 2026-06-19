# feature/ — 実効ビュー解決 (user overlay > master)

## 目的
「規定 (master) + 利用側調整 (user)」を統合した実効値を返す。consumer は「今この scope で
有効な値は何か」を 1 呼び出しで得られる。

## ユーザーストーリー
project が `resolve(scope, catalogName, name)` を呼ぶと、その project の上書きがあればそれ、
無ければ catalog 経由の規定値が返る。値の出所 (`source`) も付くので、規定なのか上書きなのか
区別できる。`resolveAll` で実効データセット全体を一覧する。

## 振る舞い (解決順)
1. user に該当 record があれば user 優先:
   - live → `source:"user"`、その value。
   - tombstone → `source:"user"`、value `null` (master を明示的に隠す)。
2. user 無し → catalog の論理名で master を引く:
   - 該当あり → `source:"master"`、master 値、`id` 付き。
   - 無し → `source:"none"`、value `null`。

`resolveAll(scope, catalogName)` = catalog の全論理名 ∪ user の live key を resolve して名前昇順で返す。

## 出力
`Resolved { key, value, source: "user"|"master"|"none", id }`。`id` は `source:"master"` のときだけ非 null。

## 制約・前提
- user lookup は `name` をそのまま user key として使う (catalog 論理名 = user key の前提)。
- `scope` (user 区画) と `catalogName` (master 名前空間) は別概念。

## 関連
- API: [interface/resolver.md](../interface/resolver.md)
- 構成元: [feature/content-addressed-master.md](./content-addressed-master.md), [feature/catalog-versioning.md](./catalog-versioning.md), [feature/user-overlay.md](./user-overlay.md)
