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

## ライセンス

LUDIARS internal (private)。
