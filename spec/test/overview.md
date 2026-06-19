# test/ — テスト構成 (種別と担保内容)

> 正本: `src/__tests__/*.test.ts`、実行 `npm test` (`vitest run`)

Fundamentum はライブラリのため、テストは **ユニット + ライブラリ統合** の 2 種。外部依存ゼロで
hermetic (MemoryBackend) または OS の tmpdir (FileBackend) で完結する。CI は型検査 + ユニット
green を担保ライン。

現状: **6 ファイル / 計 42 tests green** (内訳は下表、各ファイルの詳細は個別ドキュメント)。

| ファイル | 件数 | 種別 | 担保 | 詳細 |
|---|---|---|---|---|
| `hash.test.ts` | 10 | ユニット | canonical 直列化の決定性・content id 形式 | [test/hash.md](./hash.md) |
| `master.test.ts` | 11 | ユニット | MasterStore dedup / CatalogStore 版・diff・history | [test/master-catalog.md](./master-catalog.md) |
| `user.test.ts` | 7 | ユニット | UserStore revision / tombstone / list / scope 分離 | [test/user.md](./user.md) |
| `resolver.test.ts` | 6 | ユニット | user>master 優先・tombstone・none・resolveAll | [test/resolver.md](./resolver.md) |
| `file-backend.test.ts` | 6 | 統合 (実 fs) | FileBackend roundtrip / 永続 / fs 非安全 key | [test/file-backend.md](./file-backend.md) |
| `integration.test.ts` | 2 | 統合 (facade) | Anatomia 風シナリオ end-to-end | [test/integration.md](./integration.md) |

---

## 種別の考え方

- **ユニット**: 各ストア/ハッシュ関数を MemoryBackend (hermetic) で単体検証。決定性・冪等性・
  境界 (未設定 / tombstone / no-op) を担保。
- **統合 (実 fs)**: `file-backend.test.ts` は OS の `mkdtemp` で実ディレクトリを作り、atomic write /
  base64url key / 別インスタンス永続を実 fs で裏取り (`afterEach` で `rm`)。
- **統合 (facade)**: `integration.test.ts` は `Foundation` 経由で master → catalog → user → resolve の
  end-to-end を DESIGN §5 のシナリオで通す。

## 充実とみなす範囲
- 公開 API の各メソッドに対応するユニットがある。
- content addressing の決定性 (キー順非依存・dedup・diff の unchanged 一致) を明示的に検証。
- 永続経路 (FileBackend) を実 fs で 1 本以上担保。
- consumer 想定フロー (overlay が master を汚さない等) を統合で担保。

## やること (未カバー)
- remote backend を入れる際は同種の backend 契約テストを追加 (現状 FileBackend のみ実 fs 検証)。
- 並行書込み (複数プロセス) の競合は単一プロセス前提のため未検証。
