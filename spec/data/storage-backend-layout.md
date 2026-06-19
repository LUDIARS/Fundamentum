# data/ — StorageBackend のディスク/メモリ永続形式

> 正本実装: `src/backend/backend.ts`, `src/backend/memory-backend.ts`, `src/backend/file-backend.ts`

`StorageBackend` は永続層の抽象。全データ (master / catalog / user) はこの 2 系統に落ちる。
本ドキュメントは「ディスク上に何がどう並ぶか」を定義する (各論理スキーマは個別ファイル参照)。

---

## 1. 2 系統

| 系統 | 用途 | API |
|---|---|---|
| **content** | content-addressed・不変 (master 値 / catalog スナップショット)。key = ContentId、value = canonical JSON 文字列 | `getContent` / `putContent` / `hasContent` |
| **keyed** | 可変 key-value (catalog の head/version ポインタ、user リビジョン列) | `getKeyed` / `putKeyed` / `deleteKeyed` / `listKeys` |

backend は値を **不透明な文字列**として扱う (直列化/解釈は上位ストア)。API は **async 固定**
(remote backend を同 interface で後付けするため)。

---

## 2. FileBackend — ディスクレイアウト

root = `Foundation.onDisk(dir)` の `dir`。

```
<dir>/
  content/<aa>/<hash>.json                 # content 系統 (aa = hash 先頭 2 桁で sharding)
  keyed/<enc(partition)>/<enc(key)>.json   # keyed 系統 (enc = base64url)
```

### content

- `<hash>` = ContentId から `fm1:` prefix を除いた 64 桁 hex。`<aa>` = 先頭 2 桁 (空なら `"00"`)。
- ファイル本文 = canonical JSON 文字列をそのまま (バイト一致で保持)。
- 内容ハッシュキーゆえ冪等。同 ID への並行書込みが衝突しない。

### keyed

- partition / key は `base64url` で各々エンコードしてパス成分にする (`enc` / `dec`)。
  slash / unicode を含む partition・key も fs 安全に格納できる。
- ファイル本文 = 上位ストアが書いた JSON 文字列 (ポインタなら ContentId、user ならリビジョン配列)。
- `listKeys(partition, prefix?)` は partition ディレクトリの `*.json` を読んで `dec` し、
  prefix フィルタ後に昇順ソートして返す。partition 不在なら `[]`。

### 共通: atomic write & 耐障害

- 書込みは `mkdir -p` → `writeFile(<file>.tmp-<pid>)` → `rename` (atomic)。
  クラッシュで半端な内容を読ませない。
- 読み出しの例外は握りつぶして miss 扱い (`getContent`→`null`, `hasContent`→`false`,
  `getKeyed`→`null`, `listKeys`→`[]`)。壊れた/不在エントリで crash しない。
- `deleteKeyed` は不在なら no-op。

---

## 3. MemoryBackend — in-memory

既定の backend (hermetic、永続なし)。テスト・一時利用向け。

- content: `Map<string, string>` (ContentId → canonical)。
- keyed: `Map<string, Map<string, string>>` (partition → key → value)。
- `listKeys` は prefix フィルタ後に昇順ソート。挙動は FileBackend と一致させてある。

---

## 4. partition 名の割り当て (横断ビュー)

| partition | 書き手 | 内容 |
|---|---|---|
| `catalog:head` | CatalogStore | catalog 名 → 最新版 ContentId |
| `catalog:version` | CatalogStore | `name@version` → その版の ContentId |
| `user:<scope>` | UserStore | key → リビジョン配列 (JSON) |

content 系統には master 値と catalog スナップショットが ContentId キーで同居する
(どちらも canonical JSON、id 衝突は内容一致を意味するので安全)。

---

## 5. 関連

- master: [data/master-content.md](./master-content.md)
- catalog: [data/catalog.md](./catalog.md)
- user: [data/user-overlay.md](./user-overlay.md)
- 公開 API: [interface/storage-backend.md](../interface/storage-backend.md)
