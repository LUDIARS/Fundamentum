# setup/ — ビルド / テスト / 依存

> 正本: `package.json`, `tsconfig.json`, `README.md`

Fundamentum は **ライブラリ** (サービスではない)。dev server / 環境変数 / シークレットは無い。
立ち上げは「依存導入 → ビルド → テスト」のみ。

---

## 1. 前提ランタイム

| 項目 | 値 |
|---|---|
| Node.js | **20+** (`package.json` engines `>=20`) |
| TypeScript | `^5.5.0` (devDependency) |
| モジュール | ESM (`"type": "module"`)、`module`/`moduleResolution` = `NodeNext` |
| target | ES2022、`strict: true` |
| 外部依存 | **ゼロ** (Node 標準 `node:crypto` / `node:fs` のみ。runtime dependencies 無し) |

devDependencies: `@types/node ^22`, `typescript ^5.5`, `vitest ^2`。

---

## 2. コマンド

```sh
npm install        # devDependencies 導入 (runtime deps は無い)
npm run build      # tsc → dist/ (declaration 付き)
npm run typecheck  # tsc --noEmit
npm test           # vitest run (42 tests)
```

`package.json` scripts:

| script | 実体 | 用途 |
|---|---|---|
| `build` | `tsc` | `dist/` に JS + `.d.ts` を出力 (`outDir: dist`, `rootDir: src`) |
| `typecheck` | `tsc --noEmit` | 型検査のみ |
| `test` | `vitest run` | テスト一括実行 |

---

## 3. パッケージ公開形態

- `main`: `dist/index.js` / `types`: `dist/index.d.ts`。
- `exports["."]` で `import` → `dist/index.js`、`types` → `dist/index.d.ts`。
- `files`: `["dist"]` (公開は dist のみ)。`private: true` / `license: UNLICENSED` (LUDIARS internal)。

---

## 4. consumer からの利用

```ts
import { Foundation } from "fundamentum";
const fm = Foundation.inMemory();           // or Foundation.onDisk("/path/to/store")
```

公開 API は [interface/foundation.md](../interface/foundation.md) 参照。

---

## 5. データ保管先 (FileBackend)

- `Foundation.onDisk(dir)` の `dir` 配下に `content/` `keyed/` を作る ([data/storage-backend-layout.md](../data/storage-backend-layout.md))。
- `.gitignore` でローカル scratch store `.fundamentum-data/` を無視。
- DB マイグレーションは無い (SQLite 等を使わない。ファイル/メモリのみ)。
