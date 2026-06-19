# feature/ — 差し替え可能なストレージ backend

## 目的
永続先を interface で抽象化し、in-memory (hermetic) / ディスク永続 / 将来の org 共有 remote を
同一コードで差し替えられるようにする。

## ユーザーストーリー
- テスト・一時利用では `Foundation.inMemory()` で永続なしの hermetic backend。
- 永続が要るときは `Foundation.onDisk(dir)` で同じ API のままディスクに保存。
- 将来 org 共有が要れば、consumer が `StorageBackend` を自前実装 (HTTP 等) して
  `new Foundation(backend)` に渡す (本体無変更)。

## 振る舞い
`StorageBackend` は content (不変・content-addressed) と keyed (可変) の 2 系統を持つ。値は
不透明な文字列。API は async 固定 (remote 後付けのため)。

提供実装:
- **MemoryBackend** — `Map` ベース、永続なし。既定。
- **FileBackend(dir)** — `content/<aa>/<hash>.json` (sharding) と
  `keyed/<enc(partition)>/<enc(key)>.json` (base64url)。書込みは tmp + rename で atomic、
  読み出し例外は miss 扱い (crash しない)。別インスタンスでも同 dir から永続を読める。

## 制約・前提・既知の制限
- content は内容ハッシュキーゆえ書込み冪等・並行衝突なし。
- keyed の上書きは last-write-wins (FileBackend の rename は atomic だが、上位の read-modify-write
  (user リビジョン列) は単一プロセス前提)。

## 関連
- API: [interface/storage-backend.md](../interface/storage-backend.md)
- レイアウト: [data/storage-backend-layout.md](../data/storage-backend-layout.md)
- 配線: [interface/foundation.md](../interface/foundation.md)
