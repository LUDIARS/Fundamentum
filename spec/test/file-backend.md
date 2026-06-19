# test/ — file-backend.test.ts (FileBackend / 永続)

> 正本: `src/__tests__/file-backend.test.ts`。統合 (実 fs)。6 tests。

`beforeEach` で `mkdtemp(tmpdir(), "fundamentum-test-")` に実ディレクトリを作り、`afterEach` で
`rm(recursive, force)` する。実ファイルシステムで永続経路を裏取りする。

- content を roundtrip する (put → has → get)。
- 未知 content で `null` / `false`。
- keyed を roundtrip / list / delete する。
- 不在 partition の list で `[]` を返す。
- fs 非安全な key (slash / unicode、例 `rule:a/b 日本語`) も扱える (base64url enc)。
- 別インスタンス (`Foundation.onDisk(dir)` を 2 個) でも永続を読める (master / catalog / user)。

## 担保するもの
ディスクレイアウト ([data/storage-backend-layout.md](../data/storage-backend-layout.md)) の roundtrip、
base64url key による fs 非安全文字の安全格納、別プロセス相当 (別インスタンス) からの永続読込。

## 関連
- 実装: [interface/storage-backend.md](../interface/storage-backend.md)
- レイアウト: [data/storage-backend-layout.md](../data/storage-backend-layout.md)
