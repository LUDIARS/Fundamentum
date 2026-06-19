# data/ — catalog (名前付き・versioned スナップショット)

> 正本実装: `src/master/catalog.ts`, `src/types.ts`

master の content id は内容ハッシュなので、人間/コードが参照する **論理名** が要る。
catalog は「論理名 → master ContentId」のマップに版番号を付けて管理する保存単位。
catalog スナップショット自体も content-addressed で、共有・差分が可能。

---

## 1. Catalog スナップショットの構造

`Catalog` 型 (`src/types.ts`):

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | `ContentId` | この catalog スナップショットの content id |
| `name` | `string` | 論理 catalog 名 (例 `anatomia/adventure`, `an/proj`) |
| `version` | `number` | 1 始まりの版番号。commit ごとに +1 |
| `entries` | `Readonly<Record<string, ContentId>>` | 論理名 → master content id |
| `parent` | `ContentId \| null` | 直前バージョンの catalog content id (初版は `null`) |

ディスク/メモリ上は、content として以下の `CatalogPayload` が canonical JSON で格納される
(`id` は payload から導出されるため payload には含まない):

```ts
interface CatalogPayload {
  name: string;
  version: number;
  entries: Record<string, ContentId>;
  parent: ContentId | null;
}
```

`Catalog.id = contentIdFromCanonical(canonicalize(payload))`。

---

## 2. ポインタ (keyed 層)

catalog の「最新」「特定版」を引くため、keyed 層に 2 種のポインタを持つ
(正本: `src/master/catalog.ts` の `HEAD` / `VERSION` 定数)。

| partition 定数 | partition 名 | key | 値 |
|---|---|---|---|
| `HEAD` | `catalog:head` | catalog 名 (例 `an/proj`) | 最新版の catalog ContentId |
| `VERSION` | `catalog:version` | `<name>@<version>` (例 `an/proj@2`) | その版の catalog ContentId |

- `latest(name)` → `HEAD[name]` を引いて `load`。
- `version(name, n)` → `VERSION["<name>@<n>"]` を引いて `load`。
- `names()` → `HEAD` partition の全 key を列挙。
- `history(name)` → `latest` から `parent` を辿って全版 (latest 先頭)。

---

## 3. ディスク上レイアウト (FileBackend)

keyed は `keyed/<enc(partition)>/<enc(key)>.json` (enc = base64url、fs 安全)。

```
<dir>/
  content/<aa>/<hash>.json                                  # CatalogPayload スナップショット
  keyed/<enc("catalog:head")>/<enc(name)>.json              # 最新版ポインタ (本文 = ContentId)
  keyed/<enc("catalog:version")>/<enc("name@version")>.json # 版ポインタ (本文 = ContentId)
```

- `enc` / `dec` = `Buffer.from(s,"utf8").toString("base64url")` とその逆。slash / unicode を含む
  partition・key も安全に扱える。
- ポインタファイルの本文は対象 catalog の ContentId 文字列。

---

## 4. version / parent と更新セマンティクス

- 初版は `version = 1`, `parent = null`。
- commit ごとに `version = parent.version + 1`、`parent = parent.id`。
- **差分なしの commit は no-op**: 適用後 entries が現 latest と同一なら新版を作らず latest をそのまま返す
  (`sameEntries` 比較)。冪等な「再構築」が無料。
- 更新は `CatalogBuilder` 経由 (set / remove → commit)。詳細は
  [interface/catalog-store.md](../interface/catalog-store.md)。

---

## 5. CatalogDiff (2 版間の差分)

`CatalogDiff` 型 (`src/types.ts`)。`diff(a, b)` が a → b の変化を返す。各配列は昇順ソート済み。

| フィールド | 意味 |
|---|---|
| `added` | b のみに存在する論理名 |
| `removed` | a のみに存在する論理名 |
| `changed` | 両方に存在するが content id が異なる論理名 |
| `unchanged` | 両方に存在し content id も同一 (= 再解析不要・キャッシュ命中) |

`unchanged` は content id が一致するため consumer の解析キャッシュがヒットし、
`changed` / `added` だけ再解析すればよい (規定部分の更新を楽にする中身)。

---

## 6. 関連

- 値本体: [data/master-content.md](./master-content.md)
- 公開 API: [interface/catalog-store.md](../interface/catalog-store.md)
- 機能概要: [feature/catalog-versioning.md](../feature/catalog-versioning.md)
