# test/ — user.test.ts (UserStore)

> 正本: `src/__tests__/user.test.ts`。ユニット (MemoryBackend)。7 tests。

- set した値を get できる。
- 未設定 key で `null`。
- set のたびに revision を増やす。
- delete で tombstone を積み get が `null` になる。
- `history` は tombstone 含む全リビジョンを古い順で返す。
- `list` は live key だけ返す (tombstone を除外)。
- scope が独立している (別 scope の同名 key に干渉しない)。

## 担保するもの
revision 列の append-only 性・tombstone セマンティクス・live フィルタ (get/list)・scope 分離。

## 関連
- 実装: [interface/user-store.md](../interface/user-store.md)
- スキーマ: [data/user-overlay.md](../data/user-overlay.md)
