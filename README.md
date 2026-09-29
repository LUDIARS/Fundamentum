# Fundamentum

LUDIARS 横断の **共通データ基盤** (略称 `Fm`)。

「絶対に変わらない規定部分」(**master**) と「可変な利用側の上書き」(**user**) を 2 層に分け、
master を **content-addressed・決定的** に持つことで、規定部分の解析・更新を楽にする。

- **MasterStore** — content-addressed 不変ストア。同じ内容 → 同じ id。一度書けば
  セッション/リポを跨いでヒット (規定の解析を「代行」できる土台)。
- **Catalog** — 名前付き・versioned スナップショット (論理名 → master id)。更新は `diff` で
  changed/added だけ分かる → **変わった分だけ再解析**すればよい。
- **UserStore** — scoped・可変・revisioned overlay。master を壊さず利用側の上書き/調整を持つ。
- **Resolver** — `user overlay > master` の実効ビュー。

最初の consumer は **Anatomia (`An`)**。設計の詳細は [`DESIGN.md`](./DESIGN.md)。

> ⚠️ user 層は「可変なアプリ/セッション状態」であって**個人データストアではない**。
> 個人データは Cernere 単一情報源 (LUDIARS 共通規約)。

---

## セットアップ

```sh
npm install
npm run build      # tsc → dist/
npm test           # vitest
```

Node 20+ / TypeScript strict / ESM。外部依存ゼロ (Node 標準 `crypto` / `fs` のみ)。

---

## クイックスタート

```ts
import { Foundation } from "fundamentum";

const fm = Foundation.inMemory();         // または Foundation.onDisk("/path/to/store")

// 1. 規定 (master) を put → content id
const rule = await fm.master.put({ id: "no-cross-domain", severity: "block" });

// 2. catalog に論理名で束ねる
await fm.catalog.builder("an/adventure").set("no-cross-domain", rule.id).commit();

// 3. 利用側で上書き (user overlay)
await fm.user.set("project-1", "no-cross-domain", { id: "no-cross-domain", severity: "warn" });

// 4. 実効値を解決 (user > master)
const eff = await fm.resolve("project-1", "an/adventure", "no-cross-domain");
// → { source: "user", value: { ..., severity: "warn" }, ... }
```

### 更新を楽にする (差分だけ再解析)

```ts
const v1 = await fm.catalog.latest("an/adventure");
// ... ルールを改訂して新版を commit ...
const v2 = await fm.catalog.builder("an/adventure").set("no-deep-coupling", newId).commit();

const d = fm.catalog.diff(v1!, v2);
// d.changed / d.added だけ再解析すればよい。
// d.unchanged は content id が一致するので consumer の解析キャッシュが命中する。
```

---

## API 概要

| 入口 | 役割 |
|---|---|
| `Foundation.inMemory()` / `.onDisk(dir)` | backend を配線した facade |
| `fm.master` (`MasterStore`) | `put` / `putAll` / `get` / `has` |
| `fm.catalog` (`CatalogStore`) | `builder(name)` → `set`/`remove`/`commit`、`latest` / `version` / `history` / `names` / `diff` |
| `fm.user` (`UserStore`) | `set` / `get` / `getRecord` / `delete` / `history` / `list` |
| `fm.resolve` / `fm.resolveAll` | master + user の実効ビュー |
| `MemoryBackend` / `FileBackend` | `StorageBackend` 実装 (差し替え可能) |

---

## datahub — 中央集権 push/pull hub (共有配布層)

PC を跨いで **全員の更新差分を共有配布**する常駐 hub。全データに hub 採番の
リビジョンと Author (PC 単位 UUIDv4、表示名は別台帳) が付く。コンフリクトは
LLM (claude -p) で自動判断して情報量が多い側を採用・ログ保存し、センシティブ
データは push 時に成長型ブラックボックス検査 (Haiku) で遮断する。定期バックアップ付き。

```sh
cd datahub && npm install && npm run serve   # 起動は通常 Excubitor 経由 (port 4220)
# テストコンソール: http://127.0.0.1:4220/ui/
```

- 設計: `spec/feature/data-foundation.md` / API 契約: `spec/interface/datahub-api.md`
- 組み込みキット (クライアント + レスポンス表示 UI + Fm 用データテスト):
  `packages/datahub-kit/` (README 参照)
- 既存の master/user 2 層ライブラリ (`src/`) とは独立した自己完結パッケージ
  (lib の依存ゼロは維持)。

---

## 書き順データ

`fundamentum/stroke-data` は AnimCJK の固定版から書き順と筆跡を取り込み、
言語・提供元・版別のカタログとオフライン配布用JSONを生成します。
取得元のハッシュ、出典、ライセンス全文を保持します。
導入・再取得手順と収録範囲は [書き順データ仕様](spec/feature/stroke-data.md) を参照してください。
データのライセンスは以下のコードライセンスとは別です。

## コードのライセンス

LUDIARS internal (private)。
